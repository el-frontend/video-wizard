import type { CaptionTemplate } from '@/remotion/types';
import { jobHistoryService } from '@/server/services/job-history-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

import type { Job, JobType } from '@/server/services/job-history-service';

/**
 * A job handler reads its work payload from `job.inputData` and returns
 * the value to be persisted as `job.resultData`. Throwing causes the
 * task to be retried (or marked failed when out of retries).
 */
export type JobHandler = (job: Job) => Promise<unknown>;

class HandlerNotImplementedError extends Error {
  constructor(type: JobType) {
    super(
      `No worker handler is registered for job type "${type}". ` +
        `Add one in apps/web/server/worker/handlers.ts.`
    );
    this.name = 'HandlerNotImplementedError';
  }
}

interface RenderInput {
  videoPath: string;
  subtitles: Array<{ start: number; end: number; text: string }>;
  template: CaptionTemplate;
  language: string;
  aspectRatio: string;
  brandKit?: unknown;
}

/**
 * Render handler — the headline use case for the queue. Renders are
 * minutes-long and absolutely should not block API requests.
 *
 * Forwards Remotion's progress (0-100) to the user-facing job row so the
 * /jobs page progress bar moves while the render runs.
 */
const renderHandler: JobHandler = async (job) => {
  const input = job.inputData as RenderInput | null;
  if (!input || !input.videoPath || !Array.isArray(input.subtitles)) {
    throw new Error('Invalid render input: missing videoPath or subtitles');
  }

  return await subtitleGenerationService.renderWithSubtitles(
    {
      videoPath: input.videoPath,
      subtitles: input.subtitles,
      template: input.template,
      language: input.language,
      aspectRatio: input.aspectRatio,
      brandKit: input.brandKit as never,
    },
    (percent) => jobHistoryService.updateProgress(job.id, percent)
  );
};

/**
 * Registry of job-type → handler. Add new entries here as more endpoints
 * migrate from synchronous execution to enqueued execution.
 *
 * Stubs throw `HandlerNotImplementedError` so a misconfigured enqueue
 * (e.g. queueing an `analysis` job before its handler exists) fails loudly
 * on the worker side instead of silently sitting in the queue forever.
 */
export const handlers: Record<JobType, JobHandler> = {
  render: renderHandler,
  transcription: () => {
    throw new HandlerNotImplementedError('transcription');
  },
  analysis: () => {
    throw new HandlerNotImplementedError('analysis');
  },
  clip_creation: () => {
    throw new HandlerNotImplementedError('clip_creation');
  },
};
