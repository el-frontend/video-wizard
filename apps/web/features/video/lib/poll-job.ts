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

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Poll `GET /api/jobs/:id` until the job reaches a terminal status
 * (completed, failed, cancelled). `onTick` fires after every fetch so
 * callers can update progress UI between checks.
 */
export async function pollJobUntilDone(
  jobId: string,
  onTick?: (job: PolledJob) => void,
  options: PollOptions = {}
): Promise<PolledJob> {
  const { intervalMs = 2000, timeoutMs = 30 * 60 * 1000 } = options;
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    const res = await fetch(`/api/jobs/${jobId}`);
    if (!res.ok) {
      throw new Error(`Failed to fetch job status (${res.status})`);
    }

    const body = (await res.json()) as
      | { success: true; data: PolledJob }
      | { success: false; error: string };

    if (!body.success) {
      throw new Error(body.error);
    }

    onTick?.(body.data);

    if (TERMINAL_STATUSES.has(body.data.status)) {
      return body.data;
    }

    await sleep(intervalMs);
  }

  throw new Error('Job polling timed out');
}
