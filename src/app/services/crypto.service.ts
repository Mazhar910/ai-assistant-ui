import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { from, firstValueFrom } from 'rxjs';
import { environment } from '../../environments/environment';

/**
 * Establishes and manages the per-session AES key used to encrypt all application
 * traffic (bodies + the auth header) that is not HTTPS-worthy-in-DexTools. Key flow:
 *  1. Fetch the server's RSA public key.
 *  2. Generate a random AES-256-GCM key.
 *  3. Encrypt the AES key with RSA-OAEP and hand it to the server.
 *  4. Both ends now share the AES key, keyed by a session id returned by the server.
 */
@Injectable({ providedIn: 'root' })
export class CryptoService {
  private http = inject(HttpClient);
  private baseUrl = `${environment.apiBaseUrl}/crypto`;

  private sessionId: string | null = null;
  private aesKey: CryptoKey | null = null;
  private readyPromise: Promise<void> | null = null;

  /** Returns once a crypto session is ready (idempotent, cached per page load). */
  ensureSession(): Promise<void> {
    if (!this.readyPromise) {
      this.readyPromise = this.handshake().catch((err) => {
        this.readyPromise = null;
        throw err;
      });
    }
    return this.readyPromise;
  }

  getSessionId(): string | null {
    return this.sessionId;
  }

  private async handshake(): Promise<void> {
    const publicKeyB64 = await firstValueFrom(
      this.http.get<{ publicKey: string }>(`${this.baseUrl}/public-key`),
    );
    const aesKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, [
      'encrypt',
      'decrypt',
    ]);
    const rawKey = await crypto.subtle.exportKey('raw', aesKey);

    const rsaKey = await crypto.subtle.importKey(
      'spki',
      this.base64ToBytes(publicKeyB64.publicKey),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      false,
      ['encrypt'],
    );
    const encryptedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      rsaKey,
      rawKey,
    );

    const { sessionId } = await firstValueFrom(
      this.http.post<{ sessionId: string }>(`${this.baseUrl}/handshake`, {
        encryptedKey: this.bytesToBase64(encryptedKey),
      }),
    );

    this.sessionId = sessionId;
    this.aesKey = aesKey;
  }

  /** Encrypt arbitrary plaintext -> "{ivB64}:{cipherB64}". */
  async encrypt(plaintext: string): Promise<string> {
    const key = this.requireKey();
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, this.strToBytes(plaintext));
    return `${this.bytesToBase64(iv)}:${this.bytesToBase64(cipher)}`;
  }

  /** Decrypt "{ivB64}:{cipherB64}" -> plaintext string. */
  async decrypt(token: string): Promise<string> {
    const key = this.requireKey();
    const [ivB64, cipherB64] = token.split(':');
    const iv = this.base64ToBytes(ivB64);
    const cipher = this.base64ToBytes(cipherB64);
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipher);
    return this.bytesToStr(plain);
  }

  private requireKey(): CryptoKey {
    if (!this.aesKey) {
      throw new Error('Crypto session not ready');
    }
    return this.aesKey;
  }

  // ---------------- byte helpers ----------------
  private strToBytes(s: string): Uint8Array {
    return new TextEncoder().encode(s);
  }

  private bytesToStr(b: ArrayBuffer): string {
    return new TextDecoder().decode(b);
  }

  private base64ToBytes(b64: string): Uint8Array {
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    return bytes;
  }

  private bytesToBase64(bytes: Uint8Array | ArrayBuffer): string {
    const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let bin = '';
    for (const b of arr) {
      bin += String.fromCharCode(b);
    }
    return btoa(bin);
  }
}
