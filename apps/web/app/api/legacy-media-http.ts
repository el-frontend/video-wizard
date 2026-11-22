import { z } from 'zod';
import { requireAuth, UnauthorizedError, unauthorizedResponse } from '@/server/lib/auth';
import { ValidationError } from '@/server/lib/utils';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { jobHistoryService, type JobType } from '@/server/services/job-history-service';
import { queueService } from '@/server/services/queue-service';
import {
  resolveBrand,
  resolveOwnedVideo,
  renderInput,
} from '@/server/services/owned-media-service';

export async function mediaRequest(
  request: Request,
  action: (owner: string, body: unknown) => Promise<Response>
) {
  try {
    const user = await requireAuth(request);
    return await action(user.id, await request.json());
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    if (error instanceof AssetNotFoundError)
      return Response.json({ success: false, message: error.message }, { status: 404 });
    if (
      error instanceof ValidationError ||
      error instanceof z.ZodError ||
      error instanceof SyntaxError
    )
      return Response.json(
        {
          success: false,
          message:
            error instanceof ValidationError
              ? error.message
              : 'Solicitud no válida. Usa un recurso o trabajo propio.',
        },
        { status: 400 }
      );
    throw error;
  }
}

export async function enqueue(owner: string, type: JobType, inputData: unknown) {
  const job = await jobHistoryService.create({ userId: owner, type, inputData });
  await queueService.enqueue({ jobId: job.id, queueName: 'default' });
  return Response.json({ success: true, data: { jobId: job.id } }, { status: 202 });
}

export function queueRender(request: Request, subtitleClock: 'seconds' | 'milliseconds') {
  return mediaRequest(request, async (owner, body) => {
    const input = renderInput.parse(body);
    await resolveOwnedVideo(owner, input);
    await resolveBrand(owner, input.brandKit);
    return enqueue(owner, 'render', { ...input, subtitleClock });
  });
}
