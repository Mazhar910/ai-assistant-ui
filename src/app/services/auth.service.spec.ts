import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { AuthService } from './auth.service';
import { AuthResponse } from '../models/chat';
import { environment } from '../../environments/environment';

describe('AuthService (refresh-token flow)', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
    });
    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  it('refresh exchanges the stored refresh token and stores the new pair', () => {
    localStorage.setItem('aiAgentRefreshToken', 'old-refresh');
    expect(service.refreshToken).toBe('old-refresh');

    let received: AuthResponse | undefined;
    service.refresh().subscribe((res) => (received = res));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/refresh`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ refreshToken: 'old-refresh' });
    req.flush({
      token: 'new-access',
      refreshToken: 'new-refresh',
      username: 'alice',
      role: 'USER',
    } as AuthResponse);

    expect(received?.token).toBe('new-access');
    expect(localStorage.getItem('aiAgentToken')).toBe('new-access');
    expect(localStorage.getItem('aiAgentRefreshToken')).toBe('new-refresh');
    expect(service.isLoggedIn).toBe(true);
  });

  it('login stores both the access and refresh tokens', () => {
    let received: AuthResponse | undefined;
    service.login('alice', 'secret').subscribe((res) => (received = res));

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/login`);
    req.flush({
      token: 'access-1',
      refreshToken: 'refresh-1',
      username: 'alice',
      role: 'ADMIN',
    } as AuthResponse);

    expect(received?.refreshToken).toBe('refresh-1');
    expect(localStorage.getItem('aiAgentToken')).toBe('access-1');
    expect(localStorage.getItem('aiAgentRefreshToken')).toBe('refresh-1');
    expect(service.isAdmin).toBe(true);
  });

  it('logout clears the stored tokens', () => {
    localStorage.setItem('aiAgentToken', 'x');
    localStorage.setItem('aiAgentRefreshToken', 'y');
    localStorage.setItem('aiAgentUser', JSON.stringify({ username: 'alice', role: 'USER' }));

    service.logout().subscribe();

    const req = httpMock.expectOne(`${environment.apiBaseUrl}/auth/logout`);
    req.flush({ message: 'Logged out successfully' });

    expect(localStorage.getItem('aiAgentToken')).toBeNull();
    expect(localStorage.getItem('aiAgentRefreshToken')).toBeNull();
    expect(service.isLoggedIn).toBe(false);
  });

  it('refreshToken getter reports absence when none is stored', () => {
    expect(service.refreshToken).toBeNull();
  });
});