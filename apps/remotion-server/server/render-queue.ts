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
 * Creates and manages a render job queue
 * Handles sequential rendering of video compositions
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
  let queue: Promise<unknown> = Promise.resolve();

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
        onProgress: (progress) => {
          console.info(`[${jobId}] Render progress: ${Math.round(progress.progress * 100)}%`);
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
   * Adds a job to the render queue
   */
  const queueRender = async ({
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
        jobs.delete(jobId);
      },
    });

    // Add to queue - processes sequentially
    queue = queue.then(() => processRender(jobId));
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
