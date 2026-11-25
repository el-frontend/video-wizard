import { runLegacyEncoder } from './legacy-encoder.js';
import { randomUUID } from 'node:crypto';
import type { LegacyRenderAdmission } from '@workspace/render-contract';
import { hostOwnedMedia } from './render-bundle-host.js';
import path from 'node:path';
import { rm } from 'node:fs/promises';

/**
 * Reads a positive-integer env var. An invalid value warns loudly and falls
 * back rather than silently rendering with a bad setting — a typo'd
 * `MAX_CONCURRENT_RENDERS` should not quietly become `NaN`.
 */
const positiveIntEnv = <T extends number | undefined>(name: string, fallback: T): number | T => {
  const raw = process.env[name];
  if (raw === undefined || raw === '') {
    return fallback;
  }

  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    console.warn(
      `[render-queue] Invalid ${name}="${raw}" (expected a positive integer), using ${
        fallback ?? "Remotion's default"
      }`
    );
    return fallback;
  }

  return parsed;
};

/**
 * Render tuning — see REMOTION_PERFORMANCE.md (issue #6).
 *
 * `x264Preset: 'veryfast'` + a bounded off-thread video cache cut render time
 * ~21% in benchmarks with negligible quality cost. Concurrency is left at
 * Remotion's default unless `RENDER_CONCURRENCY` is set: forcing it higher was
 * neutral-to-worse on this encode-bound workload, while a container may want to
 * cap it *lower* to bound Chromium's memory footprint. `chromiumOptions.gl` is
 * intentionally NOT set — the fast value is platform-specific (`swangle` was 2×
 * slower on macOS), so only set `RENDER_GL` after benchmarking on the target OS.
 */
const OFFTHREAD_VIDEO_CACHE_BYTES = positiveIntEnv('RENDER_OFFTHREAD_CACHE_MB', 2048) * 1024 * 1024;

const RENDER_CONCURRENCY = positiveIntEnv('RENDER_CONCURRENCY', undefined);

/** Per-render timeout. Stops a wedged job from occupying a slot forever. */
const RENDER_TIMEOUT_MS = positiveIntEnv('RENDER_TIMEOUT_MS', 300_000);

/**
 * How many render jobs run in parallel (Phase 2). This is distinct from
 * `RENDER_CONCURRENCY` above, which controls Chromium tabs *within* a single
 * render — total Chromium load ≈ MAX_CONCURRENT_RENDERS × per-render
 * concurrency, so size both against the host's RAM and `/dev/shm`.
 *
 * Defaults to 1 (the previous strictly-sequential behaviour); the container
 * sets it to 2 to match the worker's dispatch concurrency.
 */
const MAX_CONCURRENT_RENDERS = positiveIntEnv('MAX_CONCURRENT_RENDERS', 1);

/**
 * Job data structure
 * Generic to support any composition with any input props
 */
interface JobData {
  ownerId: string;
  admission: LegacyRenderAdmission;
}
interface JobState {
  status: 'queued' | 'in-progress' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  data: JobData;
  cancel: () => void;
}

export const makeRenderQueue = ({
  serveUrl,
  rendersDir,
  encode = runLegacyEncoder,
}: {
  serveUrl: string;
  rendersDir: string;
  encode?: typeof runLegacyEncoder;
}) => {
  const jobs = new Map<string, JobState>();
  const associations = new Map<string, string>();
  // Bounded concurrent scheduler: up to MAX_CONCURRENT_RENDERS jobs run at
  // once; the rest wait in `pending` until a slot frees up.
  const pending: { id: string; run: () => Promise<void> }[] = [];
  let active = 0;

  /**
   * Starts as many pending jobs as there are free slots. Safe to call
   * repeatedly — it no-ops when the pool is full or the queue is empty.
   */
  const pump = () => {
    while (active < MAX_CONCURRENT_RENDERS && pending.length > 0) {
      const task = pending.shift()!;
      active++;
      // processRender records its own failures on the job; the catch is a
      // safety net (e.g. a job cancelled out from under us). Either way, free
      // the slot and pump the next job.
      void task
        .run()
        .catch(() => {
          console.error('Unexpected render error.');
        })
        .finally(() => {
          active--;
          pump();
        });
    }
  };

  function createJob(data: JobData) {
    const key = JSON.stringify([data.ownerId, data.admission.webJobId]);
    const existing = associations.get(key);
    if (existing) return existing;
    const id = randomUUID();
    const abort = new AbortController();
    const job: JobState = {
      status: 'queued',
      progress: 0,
      data,
      cancel: () => {
        if (job.status !== 'queued' && job.status !== 'in-progress') return;
        job.status = 'cancelled';
        abort.abort();
      },
    };
    jobs.set(id, job);
    associations.set(key, id);
    schedule(id, async () => {
      if (abort.signal.aborted) return;
      job.status = 'in-progress';
      const outputLocation = path.join(rendersDir, id + '.mp4');
      let media: Awaited<ReturnType<typeof hostOwnedMedia>> | undefined;
      try {
        media = await hostOwnedMedia(data.ownerId, data.admission, abort.signal);
        abort.signal.throwIfAborted();
        await encode(
          {
            serveUrl,
            inputProps: media.inputProps,
            offthreadVideoCacheSizeInBytes: OFFTHREAD_VIDEO_CACHE_BYTES,
            timeoutInMilliseconds: RENDER_TIMEOUT_MS,
            concurrency: RENDER_CONCURRENCY,
            outputLocation,
          },
          abort.signal,
          (progress) => {
            job.progress = progress;
          }
        );
        abort.signal.throwIfAborted();
        job.status = 'completed';
      } catch {
        job.status = abort.signal.aborted ? 'cancelled' : 'failed';
        await rm(outputLocation, { force: true });
      } finally {
        await media?.close();
      }
    });
    return id;
  }
  function schedule(id: string, run: () => Promise<void>) {
    const task = { id, run };
    pending.push(task);
    pump();
    return () => {
      const index = pending.indexOf(task);
      if (index >= 0) pending.splice(index, 1);
    };
  }

  return {
    schedule,
    createJob,
    jobs,
  };
};
