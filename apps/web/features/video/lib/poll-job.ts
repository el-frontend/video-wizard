import { sessionEvents } from '@/features/auth/lib/session-events';
import {
  authenticatedFetch,
  workspaceIdentity,
  type WorkspaceJob,
} from '@/lib/authenticated-fetch';
/**
 * Subset of the `jobs` row that the client cares about. Mirrors the
 * server-side Job type without coupling the client bundle to drizzle.
 */
export interface PolledJob {
  id: string;
  type: string;
  status: 'pending' | 'queued' | 'processing' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  resultData: unknown;
  errorMessage: string | null;
  createdAt: string;
  startedAt: string | null;
  completedAt: string | null;
}

interface PollOptions {
  /** Polling interval in ms. Default 2000. */
  intervalMs?: number;
  /** Hard deadline in ms. Default 30 minutes. */
  timeoutMs?: number;
}

const TERMINAL_STATUSES = new Set(['completed', 'failed', 'cancelled']);

function waitForRead(signal: AbortSignal, intervalMs?: number) {
  signal.throwIfAborted();
  return new Promise<void>((resolve, reject) => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    function finish() {
      clearTimeout(timer);
      window.removeEventListener(sessionEvents.restored, finish);
      signal.removeEventListener('abort', finish);
      if (signal.aborted) reject(signal.reason);
      else resolve();
    }
    window.addEventListener(sessionEvents.restored, finish);
    signal.addEventListener('abort', finish);
    if (intervalMs !== undefined) timer = setTimeout(finish, intervalMs);
  });
}

/** Follow an accepted job using only status GETs, including after same-owner sign-in. */
export async function pollJobUntilDone(
  jobId: string,
  operation: WorkspaceJob,
  onTick?: (job: PolledJob) => void,
  options: PollOptions = {}
): Promise<PolledJob> {
  const { intervalMs = 2000, timeoutMs = 30 * 60 * 1000 } = options;
  const url = '/api/jobs/' + encodeURIComponent(jobId);
  const controller = new AbortController();
  // The submitting caller captured the account lifetime before sending its POST.
  // It may already be aborted when a late 202 body supplies the job ID.
  const signal = AbortSignal.any([operation.signal, controller.signal]);
  const deadline = setTimeout(
    () => controller.abort(new Error('Se agotó el tiempo de espera del trabajo.')),
    timeoutMs
  );
  function checkOwner() {
    const current = workspaceIdentity();
    if (!operation.ownerId || operation.ownerId !== current.ownerId) {
      throw new DOMException('El trabajo pertenece a otra cuenta.', 'AbortError');
    }
    signal.throwIfAborted();
    return current.active;
  }

  try {
    for (;;) {
      if (!checkOwner()) {
        await waitForRead(signal);
        continue;
      }
      const res = await authenticatedFetch(url, { signal });
      if (res.status === 401) continue; // Transport suspends this session before returning 401.
      if (!res.ok) throw new Error('No se pudo consultar el trabajo (' + res.status + ').');
      const body = (await res.json()) as
        | { success: true; data: PolledJob }
        | { success: false; error: string };
      if (!checkOwner()) continue;
      if (!body.success) throw new Error(body.error);
      onTick?.(body.data);
      if (TERMINAL_STATUSES.has(body.data.status)) return body.data;
      await waitForRead(signal, intervalMs);
    }
  } finally {
    clearTimeout(deadline);
  }
}
