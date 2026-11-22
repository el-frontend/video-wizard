'use client';

import { decodeJwt } from 'jose';
import { authClient } from './auth-client';
import { sessionEvents } from '@/features/auth/lib/session-events';

let owner: string | null = null;
let session: string | null = null;
let suspended = true;
let generation = 0;
let cached: { token: string; expires: number } | null = null;
let pending: Promise<string | null> | null = null;

// Long-running readers retain the owner that submitted the job across session renewal.
export function workspaceIdentity() {
  return { ownerId: owner, active: !suspended };
}

export function clearAccessToken(): void {
  generation++;
  cached = null;
  pending = null;
}

export function bindWorkspaceSession(ownerId: string, sessionId: string | null) {
  if (owner !== ownerId || session !== sessionId || suspended) clearAccessToken();
  owner = ownerId;
  session = sessionId;
  suspended = false;
}

export function suspendWorkspace() {
  suspended = true;
  clearAccessToken();
}

function rejectSession(event: string) {
  suspendWorkspace();
  window.dispatchEvent(new Event(event));
  return null;
}

async function acquire(version: number) {
  const result = await authClient.token({ fetchOptions: { signal: AbortSignal.timeout(10000) } });
  if (version !== generation) return null;
  if (result.error) {
    if (result.error.status === 401 || result.error.status === 403)
      return rejectSession(sessionEvents.expired);
    throw new Error('No se pudo verificar la sesión. Inténtalo de nuevo.');
  }
  const token = result.data?.token;
  if (!token) return rejectSession(sessionEvents.expired);
  // These claims bind outgoing work to the open workspace. The server verifies the signature.
  const { sub, sid, exp } = decodeJwt(token);
  if (sub !== owner) return rejectSession(sessionEvents.accountChanged);
  if ((session && sid !== session) || !exp || exp * 1000 <= Date.now())
    return rejectSession(sessionEvents.expired);
  cached = { token, expires: exp * 1000 };
  return token;
}

function accessToken() {
  if (suspended) return null;
  if (cached && cached.expires > Date.now() + 30000) return cached.token;
  if (!pending) {
    const version = generation;
    pending = acquire(version).finally(() => {
      if (version === generation) pending = null;
    });
  }
  return pending;
}

const unauthorized = () =>
  Response.json({ success: false, error: 'Vuelve a iniciar sesión.' }, { status: 401 });

export async function authenticatedFetch(
  input: RequestInfo | URL,
  init?: RequestInit
): Promise<Response> {
  const request = input instanceof Request ? input : null;
  const destination = new URL(request?.url ?? String(input), window.location.href);
  if (
    destination.origin !== location.origin ||
    !/^https?:$/.test(destination.protocol) ||
    destination.username ||
    destination.password
  )
    throw new TypeError('La solicitud debe permanecer en el origen del estudio.');
  const signal = init?.signal ?? request?.signal;
  signal?.throwIfAborted();
  const version = generation;
  const acquisition = accessToken();
  let onAbort: (() => void) | undefined;
  let token: string | null;
  try {
    token =
      signal && acquisition instanceof Promise
        ? await Promise.race([
            acquisition,
            new Promise<never>((_, reject) => {
              onAbort = () => reject(signal.reason);
              signal.addEventListener('abort', onAbort, { once: true });
            }),
          ])
        : await acquisition;
  } finally {
    if (onAbort) signal?.removeEventListener('abort', onAbort);
  }
  signal?.throwIfAborted();
  if (!token || version !== generation) return unauthorized();

  const headers = new Headers(request?.headers);
  new Headers(init?.headers).forEach((value, key) => headers.set(key, value));
  headers.set('Authorization', 'Bearer ' + token);
  const response = await fetch(request ?? destination.href, {
    ...init,
    headers,
    credentials: 'same-origin',
    redirect: 'error',
  });
  if (version !== generation) return unauthorized();
  if (response.status === 401) rejectSession(sessionEvents.expired);
  return response;
}
