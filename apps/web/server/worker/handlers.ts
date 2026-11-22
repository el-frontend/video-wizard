import { jobHistoryService, type Job, type JobType } from '@/server/services/job-history-service';
import {
  reingest,
  storedRenderInput,
  transcriptionInput,
} from '@/server/services/owned-media-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';
import { shortSource } from '@/server/services/studio/shorts';
import { OwnedClipInputSchema } from '@/server/types/clip-render';

export type JobHandler = (job: Job) => Promise<unknown>;
export const handlers: Record<JobType, JobHandler> = {
  async render(job) {
    const input = storedRenderInput.safeParse(job.inputData);
    if (!input.success) throw new Error(reingest);
    return subtitleGenerationService.render(job.userId, job.id, input.data, (percent) =>
      jobHistoryService.updateProgress(job.id, percent)
    );
  },
  async transcription(job) {
    const input = transcriptionInput.safeParse(job.inputData);
    if (!input.success) throw new Error(reingest);
    return subtitleGenerationService.generateSubtitles(job.userId, input.data);
  },
  async clip_creation(job) {
    const input = OwnedClipInputSchema.safeParse(job.inputData);
    if (!input.success) throw new Error(reingest);
    return shortSource.renderClip(job.userId, input.data);
  },
  async analysis() {
    throw new Error('No worker handler is registered for analysis');
  },
};
