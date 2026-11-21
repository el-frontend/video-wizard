import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';
import { queueService } from '@/server/services/queue-service';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { ValidationError } from '@/server/lib/utils';
import { shortSource } from '@/server/services/studio/shorts';
import { OwnedClipInputSchema, ClipRenderRequestSchema } from '@/server/types/clip-render';

/**
 * POST /api/create-clip
 *
 * Enqueues a clip-creation job and returns the DB job id immediately.
 * The actual smart-crop happens in the worker (`pnpm worker`); the
 * client polls `GET /api/jobs/:id` and reads `output_url` from
 * `resultData` when status flips to `completed`.
 *
 * Response: { success: true, data: { jobId: string } }
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  let validatedData;
  try {
    const body = await request.json();
    if (body && typeof body === 'object' && 'sourceAssetId' in body) {
      validatedData = OwnedClipInputSchema.parse(body);
      await shortSource.validateClip(user.id, validatedData);
    } else validatedData = ClipRenderRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof ValidationError || error instanceof AssetNotFoundError)
      return NextResponse.json(
        { success: false, message: error.message },
        { status: error instanceof ValidationError ? 400 : 404 }
      );
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, message: 'Invalid request data', errors: error },
        { status: 400 }
      );
    }
    throw error;
  }

  const job = await jobHistoryService.create({
    userId: user.id,
    type: 'clip_creation',
    inputData: validatedData,
  });

  await queueService.enqueue({ jobId: job.id, queueName: 'default' });

  return NextResponse.json(
    {
      success: true,
      data: { jobId: job.id },
      message: 'Clip creation job queued',
    },
    { status: 202 }
  );
}
