import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { logger } from '@/server/lib/utils';
import { jobHistoryService } from '@/server/services/job-history-service';
import { queueService } from '@/server/services/queue-service';
import { ClipRenderRequestSchema } from '@/server/types/clip-render';

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
    validatedData = ClipRenderRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, message: 'Invalid request data', errors: error },
        { status: 400 }
      );
    }
    throw error;
  }

  logger.info('Create clip request queued', {
    start_time: validatedData.start_time,
    end_time: validatedData.end_time,
  });

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
