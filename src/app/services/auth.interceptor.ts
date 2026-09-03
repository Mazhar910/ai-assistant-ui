import { HttpErrorResponse, HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from './auth.service';
import { catchError, firstValueFrom, from, switchMap, throwError } from 'rxjs';

// Guards against concurrent refresh storms and refresh-recursion:
// if a refresh is already in flight, other 401s wait for it rather than firing more.
let refreshing: Promise<boolean> | null = null;

function clearAuthStorage(): void {
  localStorage.removeItem('aiAgentToken');
  localStorage.removeItem('aiAgentRefreshToken');
  localStorage.removeItem('aiAgentUser');
  localStorage.removeItem('aiAgentSessions');
  localStorage.removeItem('aiAgentActiveSession');
}

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const auth = inject(AuthService);

  const token = localStorage.getItem('aiAgentToken');
  const isAuthUrl = req.url.includes('/auth/refresh')
    || req.url.includes('/auth/login')
    || req.url.includes('/auth/register');

  let outgoing = req;
  if (token) {
    outgoing = req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
  }

  return next(outgoing).pipe(
    catchError((err: HttpErrorResponse) => {
      // A 401 on the auth endpoints themselves (login/register/refresh) must never
      // trigger a refresh attempt (infinite recursion), and 403 (disabled/revoked)
      // means the account cannot be refreshed -> go to login.
      const shouldTryRefresh = err?.status === 401
        && !isAuthUrl
        && !!auth.refreshToken;

      if (!shouldTryRefresh) {
        if (err?.status === 401 || err?.status === 403) {
          clearAuthStorage();
          if (!router.url.startsWith('/login')) {
            router.navigate(['/login']);
          }
        }
        return throwError(() => err);
      }

      return from(refreshOnce(auth)).pipe(
        switchMap((success) => {
          if (!success) {
            clearAuthStorage();
            if (!router.url.startsWith('/login')) {
              router.navigate(['/login']);
            }
            return throwError(() => err);
          }
          // Retry the original request once with the new access token.
          const newToken = localStorage.getItem('aiAgentToken');
          const retry = newToken
            ? outgoing.clone({ setHeaders: { Authorization: `Bearer ${newToken}` } })
            : outgoing;
          return next(retry);
        })
      );
    })
  );
};

/** Runs a single shared refresh; returns true on success. */
function refreshOnce(auth: AuthService): Promise<boolean> {
  if (!refreshing) {
    refreshing = firstValueFrom(auth.refresh())
      .then(() => true)
      .catch(() => false)
      .finally(() => { refreshing = null; });
  }
  return refreshing;
}
