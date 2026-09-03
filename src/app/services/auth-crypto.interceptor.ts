import { HttpEvent, HttpInterceptorFn, HttpRequest, HttpResponse, HttpErrorResponse } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, from, Observable, of, switchMap } from 'rxjs';

import { CryptoService } from './crypto.service';
import { environment } from '../../environments/environment';

/**
 * Applies AES-GCM transport encryption to every request/response except the crypto
 * handshake endpoints. Request bodies and the auth token are encrypted and carried in
 * the X-Auth-Enc header; response bodies are encrypted envelopes. This keeps the data
 * hidden from DevTools Network inspection.
 *
 * When {@link environment.cryptoEnabled} is false the interceptor passes all traffic
 * through unchanged (plaintext, secured by TLS/JWT) so the layer can be switched off.
 */
export const authCryptoInterceptor: HttpInterceptorFn = (req, next) => {
  const cryptoService = inject(CryptoService);

  // Handshake + public-key endpoints stay plaintext.
  if (req.url.includes('/api/crypto/')) {
    return next(req);
  }

  // Feature flag off -> no application-layer encryption.
  if (!environment.cryptoEnabled) {
    return next(req);
  }

  return from(cryptoService.ensureSession()).pipe(
    switchMap(() => encryptRequest(cryptoService, req)),
    switchMap((encReq) =>
      next(encReq).pipe(
        switchMap((event) => decryptEvent(cryptoService, event)),
        catchError((err) => from(decryptError(cryptoService, err))),
      ),
    ),
  );
}

async function decryptError(cryptoService: CryptoService, err: HttpErrorResponse): Promise<never> {
  if (err instanceof HttpErrorResponse && typeof err.error === 'string' && err.error.trim()) {
    try {
      const envelope = JSON.parse(err.error);
      const plain = await cryptoService.decrypt(envelope.data);
      const body = JSON.parse(plain);
      throw new HttpErrorResponse({
        error: body,
        status: err.status,
        statusText: err.statusText,
        url: err.url ?? undefined,
      });
    } catch {
      // could not decrypt (e.g. plaintext error) -> rethrow original
      throw err;
    }
  }
  throw err;
};

async function encryptRequest(
  cryptoService: CryptoService,
  req: HttpRequest<unknown>,
): Promise<HttpRequest<unknown>> {
  const sessionId = cryptoService.getSessionId() ?? '';

  // Body encryption: wrap the encrypted payload in a JSON envelope so the
  // Content-Type stays application/json (Angular sets text/plain for string bodies).
  let body: unknown = req.body;
  if (req.body !== null && req.body !== undefined) {
    const plaintext = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    const encrypted = await cryptoService.encrypt(plaintext);
    body = { data: encrypted };
  }

  // Auth token encryption -> X-Auth-Enc header.
  let headers = req.headers.delete('Authorization');
  const token = localStorage.getItem('aiAgentToken');
  if (token) {
    const encToken = await cryptoService.encrypt(token);
    headers = headers.set('X-Auth-Enc', encToken);
  }
  headers = headers.set('X-Session-Id', sessionId);
  headers = headers.set('Content-Type', 'application/json');

  return req.clone({
    body,
    headers,
    // Receive the raw encrypted text so we can decrypt it ourselves.
    responseType: 'text' as 'json',
  });
}

function decryptEvent(
  cryptoService: CryptoService,
  event: HttpEvent<unknown>,
): Observable<HttpEvent<unknown>> {
  if (event instanceof HttpResponse) {
    return from(decryptBody(cryptoService, event.body as string)).pipe(
      switchMap((parsed) => {
        const decrypted = new HttpResponse({
          body: parsed,
          status: event.status,
          statusText: event.statusText,
          headers: event.headers,
          url: event.url ?? undefined,
        });
        return of(decrypted as HttpEvent<unknown>);
      }),
    );
  }
  return of(event);
}

async function decryptBody(cryptoService: CryptoService, text: string): Promise<unknown> {
  if (!text || !text.trim()) {
    return text;
  }
  try {
    const envelope = JSON.parse(text);
    const plain = await cryptoService.decrypt(envelope.data);
    return JSON.parse(plain);
  } catch {
    return text;
  }
}
