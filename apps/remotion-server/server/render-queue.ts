import {
    makeCancelSignal,
    renderMedia,
    selectComposition,
} from '@remotion/renderer';
import { randomUUID } from 'node:crypto';
import path from 'node:path';

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
 * Creates and manages a render queue
 * Supports configurable concurrency for parallel rendering of video compositions
 */
export const makeRenderQueue = ({
  serveUrl,
  rendersDir,
  publicUrl,
  maxConcurrentRenders = 1,
  concurrencyPerRender,
  timeoutInMilliseconds = 300_000,
}: {
  serveUrl: string;
  rendersDir: string;
  publicUrl: string;
  /** Maximum number of render jobs that can run in parallel. Default: 1 */
  maxConcurrentRenders?: number;
  /** Number of CPU threads (Chromium tabs) used per render job. Defaults to Remotion's auto-detect */
  concurrencyPerRender?: number;
  /** Per-render timeout in milliseconds. Default: 5 minutes */
  timeoutInMilliseconds?: number;
}) => {
  const jobs = new Map<string, JobState>();
  const pendingJobIds: string[] = [];
  let activeRenders = 0;

  /**
   * Attempts to start pending jobs up to the concurrency limit
   */
  const tryProcessNext = () => {
    while (activeRenders < maxConcurrentRenders && pendingJobIds.length > 0) {
      const nextJobId = pendingJobIds.shift()!;
      activeRenders++;
      processRender(nextJobId).finally(() => {
        activeRenders--;
        tryProcessNext();
      });
    }
  };

  /**
   * Processes a render job
   * Handles composition selection, rendering, and error management
   */
  const processRender = async (jobId: string): Promise<void> => {
    const job = jobs.get(jobId);
    if (!job) {
      throw new Error(`Render job ${jobId} not found`);
    }

    const { cancel, cancelSignal } = makeCancelSignal();
    const startTime = Date.now();
    let lastLoggedPct = -1;

    jobs.set(jobId, {
      progress: 0,
      status: 'in-progress',
      cancel,
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
        timeoutInMilliseconds,
      });

      console.info(`[${jobId}] Starting render...`);

      // Render the video
      await renderMedia({
        cancelSignal,
        serveUrl,
        composition,
        inputProps,
        codec: 'h264',
        // Number of CPU threads / Chromium tabs used during rendering
        ...(concurrencyPerRender !== undefined && { concurrency: concurrencyPerRender }),
        // Per-render timeout to prevent stuck jobs
        timeoutInMilliseconds,
        // Chromium flags that improve performance in containerised Linux environments
        chromiumOptions: {
          enableMultiProcessOnLinux: true,
        },
        onProgress: (progress) => {
          const pct = Math.floor(progress.progress * 10) * 10;
          if (pct > lastLoggedPct) {
            lastLoggedPct = pct;
            console.info(`[${jobId}] Render progress: ${pct}%`);
          }
          jobs.set(jobId, {
            progress: progress.progress,
            status: 'in-progress',
            cancel,
            data: job.data,
          });
        },
        outputLocation: path.join(rendersDir, `${jobId}.mp4`),
      });

      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.info(`[${jobId}] Render completed in ${elapsed}s`);

      jobs.set(jobId, {
        status: 'completed',
        videoUrl: `${publicUrl}/renders/${jobId}.mp4`,
        data: job.data,
      });
    } catch (error) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.error(`[${jobId}] Render failed after ${elapsed}s:`, error);
      jobs.set(jobId, {
        status: 'failed',
        error: error as Error,
        data: job.data,
      });
    }
  };

  /**
   * Adds a job to the render queue
   */
  const queueRender = ({
    jobId,
    data,
  }: {
    jobId: string;
    data: JobData;
  }) => {
    jobs.set(jobId, {
      status: 'queued',
      data,
      cancel: () => {
        const idx = pendingJobIds.indexOf(jobId);
        if (idx !== -1) pendingJobIds.splice(idx, 1);
        jobs.delete(jobId);
      },
    });

    pendingJobIds.push(jobId);
    tryProcessNext();
  };

  /**
   * Creates a new render job and returns the job ID for tracking
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
