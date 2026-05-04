import type { CaptionTemplate } from '@/remotion/types';
import { clipIntegrationService } from '@/server/services/clip-integration-service';
import { jobHistoryService } from '@/server/services/job-history-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

import type { Job, JobType } from '@/server/services/job-history-service';
import type { ClipRenderRequest } from '@/server/types/clip-render';

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

interface TranscriptionInput {
  videoPath: string;
  language?: string | null;
}

/**
 * Transcription handler — runs Whisper via the Python engine. The full
 * subtitles array is returned so it lands in `resultData` for the
 * client to read after polling.
 */
const transcriptionHandler: JobHandler = async (job) => {
  const input = job.inputData as TranscriptionInput | null;
  if (!input || !input.videoPath) {
    throw new Error('Invalid transcription input: missing videoPath');
  }

  return await subtitleGenerationService.generateSubtitles({
    videoPath: input.videoPath,
    language: input.language ?? undefined,
  });
};

/**
 * Clip creation handler — proxies to Python /render-clip and enriches
 * the relative output path into a browser-routable URL before storing
 * it on the job result.
 */
const clipCreationHandler: JobHandler = async (job) => {
  const input = job.inputData as ClipRenderRequest | null;
  if (!input || !input.video_path) {
    throw new Error('Invalid clip_creation input: missing video_path');
  }

  const result = await clipIntegrationService.createClip(input);
  if (!result.success) {
    throw new Error(result.error || 'Clip creation failed');
  }

  return {
    ...result,
    output_url: result.output_url ? clipIntegrationService.getVideoUrl(result.output_url) : null,
  };
};

/**
 * Registry of job-type → handler. Add new entries here as more endpoints
 * migrate from synchronous execution to enqueued execution.
 *
 * Stubs throw `HandlerNotImplementedError` so a misconfigured enqueue
 * fails loudly on the worker side instead of silently sitting in the
 * queue forever.
 */
export const handlers: Record<JobType, JobHandler> = {
  render: renderHandler,
  transcription: transcriptionHandler,
  clip_creation: clipCreationHandler,
  analysis: () => {
    throw new HandlerNotImplementedError('analysis');
  },
};
