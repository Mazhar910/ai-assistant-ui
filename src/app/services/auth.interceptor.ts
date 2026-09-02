import { HttpInterceptorFn } from '@angular/common/http';
import { inject } from '@angular/core';
import { Router } from '@angular/router';
import { catchError, throwError } from 'rxjs';

export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const router = inject(Router);
  const token = localStorage.getItem('aiAgentToken');
  if (token) {
    const cloned = req.clone({
      setHeaders: { Authorization: `Bearer ${token}` }
    });
    return next(cloned).pipe(
      catchError((err) => {
        // 401: token invalidated (single-session logout, expiry) or 403: account
        // disabled / role revoked -> clear local auth and go to login (avoids redirect loops)
        if (err?.status === 401 || err?.status === 403) {
          localStorage.removeItem('aiAgentToken');
          localStorage.removeItem('aiAgentUser');
          localStorage.removeItem('aiAgentSessions');
          localStorage.removeItem('aiAgentActiveSession');
          if (!router.url.startsWith('/login')) {
            router.navigate(['/login']);
          }
        }
        return throwError(() => err);
      })
    );
  }
  return next(req);
};
