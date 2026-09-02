import { Component, OnDestroy, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';

import { AgentService, JobStreamHandle } from '../services/agent.service';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { ChatJobStatus, ChatSession, ChatSessionRecord } from '../models/chat';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { MarkdownComponent } from '../markdown/markdown.component';

interface UiMessage {
  role: string;
  content: string;
}

@Component({
  selector: 'app-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, SidebarComponent, MarkdownComponent],
  templateUrl: './chat.component.html',
  styleUrls: ['./chat.component.css']
})
export class ChatComponent implements OnInit, OnDestroy {

  messages: UiMessage[] = [];
  sessions: ChatSessionRecord[] = [];
  activeSessionId: string | null = null;
  input = '';
  loading = false;
  historyLoading = false;
  error = '';
  copiedIndex: number | null = null;
  sidebarOpen = false;

  suggestions: string[] = [
    'Write a Python function to reverse a string',
    'Explain quantum computing in simple terms',
    'Draft a professional email requesting a day off',
    'Suggest a healthy weekly meal plan'
  ];

  private readonly sessionsKey = 'aiAgentSessions';
  private readonly activeKey = 'aiAgentActiveSession';
  private destroyed = false;

  // Active job-status tracking so it can be torn down (no leaks) on destroy/session
  // switch. The epoch guards against stale callbacks from an abandoned job (e.g. the
  // user clicked New Chat while a job was streaming): only the latest epoch may mutate
  // state or schedule polling.
  private stream: JobStreamHandle | null = null;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pendingPoll: { jobId: string; sessionId: string; attempt: number; epoch: number } | null = null;
  private trackEpoch = 0;

  constructor(
    private agentService: AgentService,
    public authService: AuthService,
    public themeService: ThemeService,
    public router: Router
  ) { }

  get userName(): string {
    return this.authService.currentUser?.username || 'User';
  }

  get userInitials(): string {
    const name = this.userName;
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    const first = parts[0].charAt(0);
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0) : '';
    return (first + last).toUpperCase();
  }

  ngOnInit(): void {
    this.loadSuggestions();
    this.authService.refreshUser().subscribe({
      next: () => this.loadSessions(),
      error: () => this.loadSessions()
    });
    document.addEventListener('visibilitychange', this.onVisibilityChange);
  }

  ngOnDestroy(): void {
    // Stop in-flight async churn (job polling/streaming, copy-ack timers) when the
    // component is torn down, so no open connection or timer can leak.
    this.stopTracking();
    document.removeEventListener('visibilitychange', this.onVisibilityChange);
    this.destroyed = true;
  }

  /** Pauses polling while the tab is hidden and resumes (without burning attempts) when it returns. */
  private onVisibilityChange = (): void => {
    if (this.destroyed) {
      return;
    }
    if (document.hidden) {
      if (this.pollTimer !== null) {
        clearTimeout(this.pollTimer);
        this.pollTimer = null;
      }
    } else if (this.pendingPoll && this.pollTimer === null) {
      const p = this.pendingPoll;
      this.pendingPoll = null;
      this.pollTimer = setTimeout(() => {
        this.pollTimer = null;
        if (!this.destroyed) {
          this.pollJob(p.jobId, p.sessionId, p.attempt, p.epoch);
        }
      }, 0);
    }
  };

  /** Load AI-generated welcome suggestions (rotating fresh set on each reload). */
  private loadSuggestions(): void {
    this.agentService.getSuggestions().subscribe({
      next: (list) => {
        if (list && list.length > 0) {
          this.suggestions = list.slice(0, 4);
        }
      },
      error: () => {
        // keep the defaults; the user can still start a chat normally
      }
    });
  }

  private loadSessions(): void {
    this.historyLoading = true;
    this.agentService.getSessions().subscribe({
      next: (serverSessions: ChatSession[]) => {
        this.sessions = this.mergeSessions(serverSessions || []);
        this.persistSessions();
        this.restoreActive();
      },
      error: () => {
        // Fall back to cached localStorage sessions if the server is unavailable.
        this.sessions = this.readSessions();
        this.restoreActive();
      }
    });
  }

  /** Merge server sessions (authoritative) with the localStorage cache and sort by recency. */
  private mergeSessions(server: ChatSession[]): ChatSessionRecord[] {
    const byId = new Map<string, ChatSessionRecord>();
    for (const c of this.readSessions()) {
      byId.set(c.conversationId, c);
    }
    for (const s of server) {
      byId.set(s.conversationId, {
        conversationId: s.conversationId,
        title: s.title,
        updatedAt: typeof s.updatedAt === 'number' ? s.updatedAt : new Date(s.updatedAt).getTime()
      });
    }
    return Array.from(byId.values()).sort((a, b) => b.updatedAt - a.updatedAt);
  }

  /** Restore the previously active session, or show the welcome screen. */
  private restoreActive(): void {
    this.historyLoading = false;
    const active = localStorage.getItem(this.activeKey);
    if (active && this.sessions.some((s) => s.conversationId === active)) {
      this.openSession(active);
    } else {
      this.messages = this.welcome();
    }
  }

  newChat(): void {
    // Do NOT abort an in-flight job for the previous conversation. Keep its stream
    // open in the background so the answer still arrives and populates that
    // conversation (sidebar / history on reopen), even though this fresh view won't
    // show it. Only release the composer so the new chat is immediately usable; the
    // epoch guard drops any stale callbacks and the next send/watchJob tears down
    // leftover tracking. If the user never sends again, the background stream simply
    // runs until the job completes (or the server-side SSE timeout fires) and then
    // releases itself via stopTracking().
    this.loading = false;
    this.activeSessionId = null;
    localStorage.removeItem(this.activeKey);
    this.messages = this.welcome();
    this.error = '';
    this.closeSidebar();
  }

  toggleSidebar(): void {
    this.sidebarOpen = !this.sidebarOpen;
  }

  closeSidebar(): void {
    this.sidebarOpen = false;
  }

  openSession(sessionId: string): void {
    this.activeSessionId = sessionId;
    localStorage.setItem(this.activeKey, sessionId);
    this.closeSidebar();
    this.historyLoading = true;
    this.error = '';
    this.messages = [];

    this.agentService.getHistory(sessionId).subscribe({
      next: (history) => {
        // Ignore a late response if the user switched to another session in the meantime,
        // otherwise the stale history would overwrite the newly-opened conversation.
        if (this.activeSessionId !== sessionId) {
          return;
        }
        this.messages = history.map((m) => ({
          role: m.role === 'user' ? 'user' : 'assistant',
          content: m.content
        }));
        if (this.messages.length === 0) {
          this.messages = this.welcome();
        }
        this.historyLoading = false;
      },
      error: (err) => {
        this.historyLoading = false;
        this.removeSession(sessionId);
        if (this.activeSessionId === sessionId) {
          this.newChat();
        }
        this.error = this.extractError(err);
      }
    });
  }

  deleteSession(sessionId: string): void {
    this.agentService.clearConversation(sessionId).subscribe({
      next: () => this.afterDelete(sessionId),
      error: (err) => {
        this.afterDelete(sessionId);
        this.error = this.extractError(err);
      }
    });
  }

  copyMessage(content: string, index: number): void {
    this.copyText(content);
    this.copiedIndex = index;
    setTimeout(() => {
      if (!this.destroyed) {
        this.copiedIndex = null;
      }
    }, 1600);
  }

  get showWelcome(): boolean {
    return !this.loading && !this.historyLoading && !this.messages.some((m) => m.role === 'user');
  }

  useSuggestion(text: string): void {
    this.input = text;
    this.send();
  }

  autoGrow(event: Event): void {
    const el = event.target as HTMLTextAreaElement;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 180) + 'px';
  }

  send(): void {
    const text = this.input.trim();
    if (!text || this.loading) {
      return;
    }

    this.error = '';
    this.messages.push({ role: 'user', content: text });
    this.input = '';
    this.loading = true;
    this.scrollToBottom();

    const dispatch = (sessionId: string) => {
      this.registerSession(sessionId, text);
      this.agentService.sendMessageAsync(text, sessionId).subscribe({
        next: (job) => {
          this.watchJob(job.jobId, sessionId);
        },
        error: (err) => {
          this.loading = false;
          this.error = this.extractError(err);
          this.scrollToBottom();
        }
      });
    };

    if (this.activeSessionId) {
      dispatch(this.activeSessionId);
    } else {
      this.agentService.newConversation().subscribe({
        next: (response) => {
          this.activeSessionId = response.conversationId;
          localStorage.setItem(this.activeKey, response.conversationId);
          dispatch(response.conversationId);
        },
        error: (err) => {
          this.loading = false;
          this.error = this.extractError(err);
        }
      });
    }
  }

  /**
   * Tracks a job's status to completion, preferring Server-Sent Events (low latency,
   * no polling load) and falling back to adaptive polling if the stream cannot be
   * established or is dropped before a terminal state. Polling pauses while the tab
   * is hidden, and everything is released on teardown ({@link stopTracking}).
   */
  private watchJob(jobId: string, sessionId: string): void {
    this.stopTracking();
    const epoch = this.trackEpoch;
    try {
      const handle = this.agentService.streamJobStatus(jobId);
      // The user may have clicked New Chat / switched while the stream was opening.
      if (epoch !== this.trackEpoch) {
        handle.abort();
        return;
      }
      this.stream = handle;
      handle.stream$.subscribe({
        next: (status) => {
          if (epoch !== this.trackEpoch) {
            return; // abandoned while waiting
          }
          if (this.onJobStatus(status, sessionId)) {
            this.stopTracking();
          }
        },
        error: () => {
          if (epoch !== this.trackEpoch) {
            return;
          }
          this.fallbackToPolling(jobId, sessionId);
        },
        complete: () => {
          // Stream closed without a terminal event (e.g. dropped connection while the
          // job is still running) -> fall back to polling to catch its completion.
          // The epoch guard (rather than the previous `!this.destroyed` check) is what
          // keeps an abandoned job from scheduling polling after teardown/New Chat.
          if (epoch !== this.trackEpoch) {
            return;
          }
          this.stream = null;
          if (this.loading) {
            this.pollJob(jobId, sessionId, 0, epoch);
          }
        }
      });
    } catch {
      if (epoch !== this.trackEpoch) {
        return;
      }
      this.fallbackToPolling(jobId, sessionId);
    }
  }

  private fallbackToPolling(jobId: string, sessionId: string): void {
    if (this.stream) {
      this.stream.abort();
      this.stream = null;
    }
    if (!this.destroyed) {
      this.pollJob(jobId, sessionId, 0, this.trackEpoch);
    }
  }

  /**
   * Adaptive polling fallback: grows the interval (up to a cap) so a dropped SSE
   * stream still gets to the terminal state without hammering the server, and pauses
   * entirely while the tab is hidden. The `epoch` pins this loop to the job it belongs
   * to so a stale response cannot resurrect polling for an abandoned job.
   */
  private pollJob(jobId: string, sessionId: string, attempt: number, epoch: number): void {
    const MAX_POLLS = 300;
    if (epoch !== this.trackEpoch) {
      return; // abandoned while waiting
    }
    if (attempt >= MAX_POLLS || this.destroyed) {
      this.pendingPoll = null;
      this.loading = false;
      this.error = 'The request is taking too long. Please try again.';
      this.scrollToBottom();
      return;
    }
    if (document.hidden) {
      // Pause; the visibilitychange handler resumes this without losing the attempt.
      this.pendingPoll = { jobId, sessionId, attempt, epoch };
      return;
    }
    this.agentService.getJobStatus(jobId).subscribe({
      next: (status) => {
        if (epoch !== this.trackEpoch) {
          return;
        }
        if (this.onJobStatus(status, sessionId)) {
          this.pendingPoll = null;
          return;
        }
        if (this.destroyed) {
          return;
        }
        const delay = Math.min(5000, 1000 * Math.pow(1.5, attempt));
        this.pendingPoll = { jobId, sessionId, attempt: attempt + 1, epoch };
        this.pollTimer = setTimeout(() => {
          const p = this.pendingPoll;
          this.pendingPoll = null;
          this.pollTimer = null;
          if (p && !this.destroyed) {
            this.pollJob(p.jobId, p.sessionId, p.attempt, p.epoch);
          }
        }, delay);
      },
      error: (err) => {
        if (epoch !== this.trackEpoch) {
          return;
        }
        this.pendingPoll = null;
        if (this.activeSessionId === sessionId) {
          this.loading = false;
          this.error = this.extractError(err);
          this.scrollToBottom();
        }
      }
    });
  }

  /**
   * Applies a job status event to the UI. Always registers the completed session in
   * the shared list, but only mutates the visible message list when the job's session
   * is still the active one (avoids appending to the wrong chat). Returns true when the
   * job reached a terminal state.
   */
  private onJobStatus(status: ChatJobStatus, sessionId: string): boolean {
    if (status.state === 'COMPLETED') {
      this.registerSession(sessionId, status.reply ?? '');
      if (this.activeSessionId === sessionId) {
        this.messages.push({ role: 'assistant', content: status.reply ?? '' });
      }
      this.loading = false;
      this.scrollToBottom();
      return true;
    }
    if (status.state === 'FAILED') {
      if (this.activeSessionId === sessionId) {
        this.error = status.error ?? 'The request failed. Please try again.';
      }
      this.loading = false;
      this.scrollToBottom();
      return true;
    }
    return false;
  }

  /** Aborts any open stream, clears any pending poll timer, and invalidates tracking. */
  private stopTracking(): void {
    // Invalidate any in-flight callbacks/timers for the previous job so an abandoned
    // stream cannot resurrect polling or mutate the UI.
    this.trackEpoch++;
    if (this.stream) {
      this.stream.abort();
      this.stream = null;
    }
    if (this.pollTimer !== null) {
      clearTimeout(this.pollTimer);
      this.pollTimer = null;
    }
    this.pendingPoll = null;
  }

  onComposerKeydown(event: KeyboardEvent): void {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      this.send();
    }
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }

  private afterDelete(sessionId: string): void {
    this.removeSession(sessionId);
    if (this.activeSessionId === sessionId) {
      this.newChat();
    }
  }

  private registerSession(sessionId: string, firstMessage: string): void {
    const existing = this.sessions.find((s) => s.conversationId === sessionId);
    if (existing) {
      existing.updatedAt = Date.now();
    } else {
      this.sessions.push({
        conversationId: sessionId,
        title: this.titleFor(firstMessage),
        updatedAt: Date.now()
      });
    }
    this.persistSessions();
  }

  private removeSession(sessionId: string): void {
    this.sessions = this.sessions.filter((s) => s.conversationId !== sessionId);
    this.persistSessions();
  }

  private titleFor(text: string): string {
    const clean = text.replace(/\s+/g, ' ').trim();
    return clean.length > 40 ? clean.slice(0, 40) + '...' : clean;
  }

  private readSessions(): ChatSessionRecord[] {
    try {
      const raw = localStorage.getItem(this.sessionsKey);
      const arr = raw ? JSON.parse(raw) : [];
      const sessions: ChatSessionRecord[] = Array.isArray(arr) ? arr : [];
      return sessions.sort((a, b) => b.updatedAt - a.updatedAt);
    } catch (err) {
      console.error('Could not read sessions from storage', err);
      return [];
    }
  }

  private persistSessions(): void {
    this.sessions = [...this.sessions].sort((a, b) => b.updatedAt - a.updatedAt);
    localStorage.setItem(this.sessionsKey, JSON.stringify(this.sessions));
  }

  private welcome(): UiMessage[] {
    return [{
      role: 'assistant',
      content: `Hello, ${this.userName}! I am your AI assistant, powered by opencode.\n\nAsk me anything — I can explain concepts, write and fix code, answer questions, and much more.`
    }];
  }

  private extractError(err: any): string {
    if (err?.status === 401 || err?.status === 403) {
      this.router.navigate(['/login']);
      return 'Session expired. Please log in again.';
    }
    const body = err?.error;
    if (body && body.message) {
      return body.message;
    }
    return err?.message ?? 'Something went wrong. Please try again.';
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      const el = document.getElementById('messageArea');
      if (el) {
        el.scrollTop = el.scrollHeight;
      }
    }, 0);
  }

  private copyText(text: string): void {
    if ('clipboard' in navigator) {
      navigator.clipboard.writeText(text).catch(() => this.fallbackCopy(text));
    } else {
      this.fallbackCopy(text);
    }
  }

  private fallbackCopy(text: string): void {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try {
      document.execCommand('copy');
    } catch {
      // ignore
    }
    document.body.removeChild(ta);
  }
}
