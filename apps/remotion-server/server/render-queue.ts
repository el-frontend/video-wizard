import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

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
  compositionId: string;
  inputProps: Record<string, unknown>;
}

/**
 * Job state types
 */
type JobState =
  | {
      status: 'queued';
      data: JobData;
      cancel: () => void;
    }
  | {
      status: 'in-progress';
      progress: number;
      data: JobData;
      cancel: () => void;
    }
  | {
      status: 'completed';
      videoUrl: string;
      data: JobData;
    }
  | {
      status: 'failed';
      error: Error;
      data: JobData;
    };

/**
 * Creates and manages a render job queue
 * Runs up to MAX_CONCURRENT_RENDERS video compositions in parallel
 */
export const makeRenderQueue = ({
  port,
  serveUrl,
  rendersDir,
  publicUrl,
}: {
  port: number;
  serveUrl: string;
  rendersDir: string;
  publicUrl: string;
}) => {
  const jobs = new Map<string, JobState>();

  // Bounded concurrent scheduler: up to MAX_CONCURRENT_RENDERS jobs run at
  // once; the rest wait in `pending` until a slot frees up.
  const pending: string[] = [];
  let active = 0;

  /**
   * Starts as many pending jobs as there are free slots. Safe to call
   * repeatedly — it no-ops when the pool is full or the queue is empty.
   */
  const pump = () => {
    while (active < MAX_CONCURRENT_RENDERS && pending.length > 0) {
      const jobId = pending.shift() as string;
      active++;
      // processRender records its own failures on the job; the catch is a
      // safety net (e.g. a job cancelled out from under us). Either way, free
      // the slot and pump the next job.
      void processRender(jobId)
        .catch((error) => {
          console.error(`[${jobId}] Unexpected render error:`, error);
        })
        .finally(() => {
          active--;
          pump();
        });
    }
  };

  /**
   * Processes a render job
   * Handles composition selection, rendering, and error management
   */
  const processRender = async (jobId: string) => {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Render job ${jobId} not found`);
    }

    const { cancel, cancelSignal } = makeCancelSignal();
    let lastLoggedPercent = -1;

    jobs.set(jobId, {
      progress: 0,
      status: 'in-progress',
      cancel: cancel,
      data: job.data,
    });

    try {
      const { compositionId, inputProps } = job.data;

      console.info(`[${jobId}] Selecting composition: ${compositionId}`);

      // Select the composition with input props
      const composition = await selectComposition({
        serveUrl,
        id: compositionId,
        inputProps,
      });

      console.info(`[${jobId}] Starting render...`);

      // Render the video
      await renderMedia({
        cancelSignal,
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        x264Preset: 'veryfast',
        offthreadVideoCacheSizeInBytes: OFFTHREAD_VIDEO_CACHE_BYTES,
        timeoutInMilliseconds: RENDER_TIMEOUT_MS,
        ...(RENDER_CONCURRENCY ? { concurrency: RENDER_CONCURRENCY } : {}),
        onProgress: (progress) => {
          // Job state updates on every tick (the client polls it), but only log
          // when the whole percent changes — onProgress fires far more often
          // than that, and concurrent renders interleave their output.
          const percent = Math.round(progress.progress * 100);
          if (percent !== lastLoggedPercent) {
            lastLoggedPercent = percent;
            console.info(`[${jobId}] Render progress: ${percent}%`);
          }

          jobs.set(jobId, {
            progress: progress.progress,
            status: 'in-progress',
            cancel: cancel,
            data: job.data,
          });
        },
        outputLocation: path.join(rendersDir, `${jobId}.mp4`),
      });

      console.info(`[${jobId}] Render completed successfully`);

      jobs.set(jobId, {
        status: 'completed',
        videoUrl: `${publicUrl}/renders/${jobId}.mp4`,
        data: job.data,
      });
    } catch (error) {
      console.error(`[${jobId}] Render failed:`, error);
      jobs.set(jobId, {
        status: 'failed',
        error: error as Error,
        data: job.data,
      });
    }
  };

  /**
   * Adds a job to the render queue. Runs immediately if a slot is free,
   * otherwise waits its turn in `pending`.
   */
  const queueRender = async ({ jobId, data }: { jobId: string; data: JobData }) => {
    jobs.set(jobId, {
      status: 'queued',
      data,
      cancel: () => {
        // Drop it from the waiting list so pump() never picks up a cancelled job.
        const index = pending.indexOf(jobId);
        if (index !== -1) {
          pending.splice(index, 1);
        }
        jobs.delete(jobId);
      },
    });

    pending.push(jobId);
    pump();
  };

  /**
   * Creates a new render job
   * Returns the job ID for tracking
   */
  function createJob(data: JobData) {
    const jobId = randomUUID();

    queueRender({ jobId, data });

    return jobId;
  }

  return {
    createJob,
    jobs,
  };
};
