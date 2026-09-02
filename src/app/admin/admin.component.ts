import { Component, OnInit } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router, RouterLink } from '@angular/router';
import { AgentService } from '../services/agent.service';
import { AuthService } from '../services/auth.service';
import { ThemeService } from '../services/theme.service';
import { User, AdminStats } from '../models/chat';

@Component({
  selector: 'app-admin',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './admin.component.html',
  styleUrls: ['./admin.component.css']
})
export class AdminComponent implements OnInit {

  users: User[] = [];
  stats: AdminStats | null = null;
  loading = true;
  error = '';
  activeTab: 'overview' | 'users' = 'overview';

  constructor(
    private agentService: AgentService,
    public authService: AuthService,
    public themeService: ThemeService,
    private router: Router
  ) {}

  ngOnInit(): void {
    this.loadData();
  }

  loadData(): void {
    this.loading = true;
    this.agentService.getStats().subscribe({
      next: (stats) => { this.stats = stats; },
      error: (err) => { this.error = 'Failed to load stats'; }
    });
    this.agentService.getAllUsers().subscribe({
      next: (users) => { this.users = users; this.loading = false; },
      error: (err) => { this.error = 'Failed to load users'; this.loading = false; }
    });
  }

  switchTab(tab: 'overview' | 'users'): void {
    this.activeTab = tab;
  }

  get currentUserId(): number | null {
    return this.authService.currentUser?.id ?? null;
  }

  isSelf(userId: number): boolean {
    return this.currentUserId === userId;
  }

  toggleAccess(userId: number): void {
    this.agentService.toggleUserAccess(userId).subscribe({
      next: () => this.loadData(),
      error: (err) => { this.error = err?.error?.message || 'Failed'; }
    });
  }

  changeRole(userId: number, role: string): void {
    this.agentService.changeUserRole(userId, role).subscribe({
      next: () => this.loadData(),
      error: (err) => { this.error = err?.error?.message || 'Failed'; }
    });
  }

  deleteUser(userId: number, username: string): void {
    if (confirm(`Delete user "${username}" and all their data?`)) {
      this.agentService.deleteUser(userId).subscribe({
        next: () => this.loadData(),
        error: (err) => { this.error = err?.error?.message || 'Failed'; }
      });
    }
  }

  formatTokens(tokens: number): string {
    if (tokens >= 1000000) return (tokens / 1000000).toFixed(1) + 'M';
    if (tokens >= 1000) return (tokens / 1000).toFixed(1) + 'K';
    return tokens.toString();
  }

  getBarWidth(tokens: number): number {
    if (!this.stats || this.stats.tokensByModel.length === 0) return 0;
    const max = Math.max(...this.stats.tokensByModel.map(m => m.tokens));
    return max > 0 ? (tokens / max) * 100 : 0;
  }

  getDayBarHeight(tokens: number): number {
    if (!this.stats || this.stats.dailyUsage.length === 0) return 0;
    const max = Math.max(...this.stats.dailyUsage.map(d => d.tokens));
    return max > 0 ? (tokens / max) * 100 : 0;
  }

  logout(): void {
    this.authService.logout().subscribe({
      next: () => this.router.navigate(['/login']),
      error: () => this.router.navigate(['/login'])
    });
  }
}
