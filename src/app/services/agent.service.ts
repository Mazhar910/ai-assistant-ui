import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, Subject } from 'rxjs';
import { ChatMessage, User, AdminStats, ChatJobStatus, ChatSession } from '../models/chat';
import { environment } from '../../environments/environment';
import { AuthService } from './auth.service';

/** Handle returned by {@link AgentService#streamJobStatus} to stop a stream. */
export interface JobStreamHandle {
  /** Emits each parsed status event; completes when the job reaches a terminal state or the stream closes. */
  stream$: Observable<ChatJobStatus>;
  /** Closes the underlying connection and completes the stream. Call on teardown to avoid leaks. */
  abort: () => void;
}

@Injectable({
  providedIn: 'root'
})
export class AgentService {

  private readonly baseUrl = `${environment.apiBaseUrl}/agent`;
  private readonly adminUrl = `${environment.apiBaseUrl}/admin`;

  constructor(private http: HttpClient, private auth: AuthService) { }

  /** Submits a chat turn to the async job queue; returns immediately with a jobId. */
  sendMessageAsync(message: string, conversationId?: string): Observable<ChatJobStatus> {
    return this.http.post<ChatJobStatus>(`${this.baseUrl}/chat/async`, { message, conversationId });
  }

  /** Polls the status of an async chat job until it completes or fails. */
  getJobStatus(jobId: string): Observable<ChatJobStatus> {
    return this.http.get<ChatJobStatus>(`${this.baseUrl}/jobs/${jobId}/status`);
  }

  /**
   * Streams a job's status over Server-Sent Events. A hand-rolled `fetch` +
   * `ReadableStream` parser is used (rather than `EventSource`) so the JWT can be
   * sent in the `Authorization` header — never as a URL/query parameter (a data
   * leak risk). The returned handle's `abort()` must be called on teardown so the
   * in-flight connection and reader are released.
   */
  streamJobStatus(jobId: string): JobStreamHandle {
    const abortCtrl = new AbortController();
    const subject = new Subject<ChatJobStatus>();
    const token = this.auth.token;

    const run = async (): Promise<void> => {
      try {
        const res = await fetch(`${this.baseUrl}/jobs/${jobId}/stream`, {
          headers: {
            Authorization: token ? `Bearer ${token}` : '',
            Accept: 'text/event-stream'
          },
          signal: abortCtrl.signal
        });
        if (!res.ok || !res.body) {
          throw new Error(`Failed to open status stream (HTTP ${res.status})`);
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = '';

        while (!abortCtrl.signal.aborted) {
          const { value, done } = await reader.read();
          if (done) {
            break;
          }
          buffer += decoder.decode(value, { stream: true });

          let boundary: number;
          while ((boundary = buffer.indexOf('\n\n')) >= 0) {
            const chunk = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const event = this.parseSseEvent<ChatJobStatus>(chunk);
            if (!event) {
              continue;
            }
            subject.next(event);
            if (event.state === 'COMPLETED' || event.state === 'FAILED') {
              abortCtrl.abort();
              break;
            }
          }
        }
      } catch (err) {
        if (!abortCtrl.signal.aborted && !subject.closed) {
          subject.error(err);
        }
      } finally {
        subject.complete();
      }
    };

    run();

    return {
      stream$: subject.asObservable(),
      abort: () => abortCtrl.abort()
    };
  }

  /** Parses a single SSE block (between two blank lines) into its `data:` field, or null. */
  private parseSseEvent<T>(chunk: string): T | null {
    const data = chunk
      .split(/\r?\n/)
      .filter((line) => line.startsWith('data:'))
      .map((line) => line.slice(5).replace(/^ /, ''))
      .join('\n');
    if (!data) {
      return null; // heartbeat comment or metadata with no payload
    }
    try {
      return JSON.parse(data) as T;
    } catch {
      return null;
    }
  }

  newConversation(): Observable<{ conversationId: string }> {
    return this.http.post<{ conversationId: string }>(`${this.baseUrl}/conversation`, {});
  }

  getHistory(conversationId: string): Observable<ChatMessage[]> {
    return this.http.get<ChatMessage[]>(`${this.baseUrl}/conversation/${conversationId}`);
  }

  clearConversation(conversationId: string): Observable<{ cleared: boolean }> {
    return this.http.delete<{ cleared: boolean }>(`${this.baseUrl}/conversation/${conversationId}`);
  }

  getSessions(): Observable<ChatSession[]> {
    return this.http.get<ChatSession[]>(`${this.baseUrl}/sessions`);
  }

  getSuggestions(): Observable<string[]> {
    return this.http.get<string[]>(`${this.baseUrl}/suggestions`);
  }

  // Admin APIs
  getAllUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${this.adminUrl}/users`);
  }

  toggleUserAccess(userId: number): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/user/${userId}/toggle-access`, {});
  }

  changeUserRole(userId: number, role: string): Observable<any> {
    return this.http.put<any>(`${this.adminUrl}/user/${userId}/role`, { role });
  }

  deleteUser(userId: number): Observable<any> {
    return this.http.delete<any>(`${this.adminUrl}/user/${userId}`);
  }

  getStats(): Observable<AdminStats> {
    return this.http.get<AdminStats>(`${this.adminUrl}/stats`);
  }

  getUserStats(userId: number): Observable<any> {
    return this.http.get<any>(`${this.adminUrl}/stats/user/${userId}`);
  }
}
