import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { BehaviorSubject, Observable, tap } from 'rxjs';
import { AuthResponse } from '../models/chat';
import { environment } from '../../environments/environment';

export interface CurrentUser {
  id?: number;
  username?: string;
  role?: string;
}

@Injectable({
  providedIn: 'root'
})
export class AuthService {

  private readonly baseUrl = `${environment.apiBaseUrl}/auth`;
  private readonly tokenKey = 'aiAgentToken';
  private readonly refreshTokenKey = 'aiAgentRefreshToken';
  private readonly userKey = 'aiAgentUser';

  private loggedIn$ = new BehaviorSubject<boolean>(this.hasToken());
  private user$ = new BehaviorSubject<CurrentUser | null>(this.loadUser());

  constructor(private http: HttpClient) { }

  get isLoggedIn$(): Observable<boolean> {
    return this.loggedIn$.asObservable();
  }

  get userObservable$(): Observable<CurrentUser | null> {
    return this.user$.asObservable();
  }

  refreshUser(): Observable<any> {
    return this.http.get(`${this.baseUrl}/me`).pipe(
      tap((data: any) => {
        const id: number = data?.id;
        const username: string = data?.username;
        const role: string = data?.role;
        if (username && role) {
          const user: CurrentUser = { id, username, role };
          localStorage.setItem(this.userKey, JSON.stringify(user));
          this.user$.next(user);
        }
      })
    );
  }

  get isLoggedIn(): boolean {
    return this.hasToken();
  }

  get token(): string | null {
    return localStorage.getItem(this.tokenKey);
  }

  get refreshToken(): string | null {
    return localStorage.getItem(this.refreshTokenKey);
  }

  /** Exchanges the stored refresh token for a fresh access/refresh pair. */
  refresh(): Observable<AuthResponse> {
    const rt = this.refreshToken;
    return this.http.post<AuthResponse>(`${this.baseUrl}/refresh`, { refreshToken: rt }).pipe(
      tap(res => this.handleAuth(res))
    );
  }

  get currentUser(): CurrentUser | null {
    return this.loadUser();
  }

  get isAdmin(): boolean {
    return this.currentUser?.role === 'ADMIN';
  }

  register(username: string, email: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/register`, { username, email, password })
      .pipe(tap(res => this.handleAuth(res)));
  }

  login(username: string, password: string): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${this.baseUrl}/login`, { username, password })
      .pipe(tap(res => this.handleAuth(res)));
  }

  logout(): Observable<any> {
    return this.http.post(`${this.baseUrl}/logout`, {}).pipe(
      tap(() => this.clearAuth()),
      tap({ error: () => this.clearAuth() })
    );
  }

  private handleAuth(res: AuthResponse): void {
    if (res.token) {
      localStorage.setItem(this.tokenKey, res.token);
      if (res.refreshToken) {
        localStorage.setItem(this.refreshTokenKey, res.refreshToken);
      }
    }
    if (res.username && res.role) {
      const user: CurrentUser = { username: res.username, role: res.role };
      localStorage.setItem(this.userKey, JSON.stringify(user));
      this.user$.next(user);
    }
    if (res.token) {
      this.loggedIn$.next(true);
    }
  }

  private clearAuth(): void {
    localStorage.removeItem(this.tokenKey);
    localStorage.removeItem(this.refreshTokenKey);
    localStorage.removeItem(this.userKey);
    localStorage.removeItem('aiAgentSessions');
    localStorage.removeItem('aiAgentActiveSession');
    this.user$.next(null);
    this.loggedIn$.next(false);
  }

  private loadUser(): CurrentUser | null {
    try {
      const raw = localStorage.getItem(this.userKey);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }

  private hasToken(): boolean {
    return !!localStorage.getItem(this.tokenKey);
  }
}
