import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';
import { queueService } from '@/server/services/queue-service';

/**
 * POST /api/generate-subtitles
 *
 * Enqueues a transcription job and returns the DB job id immediately.
 * The actual transcription runs in the worker process (`pnpm worker`);
 * the client polls `GET /api/jobs/:id` to pick up the result.
 *
 * Result shape on completion (in `resultData`):
 *   { subtitles, language, totalSegments, videoDuration }
 *
 * Request body:
 * - videoPath: string - Path to the uploaded video file
 * - language?: string - Language code or 'auto' for auto-detection
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

  const body = await request.json();
  const { videoPath, language = 'auto' } = body;

  if (!videoPath) {
    return NextResponse.json({ success: false, message: 'videoPath is required' }, { status: 400 });
  }

  const job = await jobHistoryService.create({
    userId: user.id,
    type: 'transcription',
    inputData: { videoPath, language },
  });

  await queueService.enqueue({ jobId: job.id, queueName: 'default' });

  return NextResponse.json(
    {
      success: true,
      data: { jobId: job.id },
      message: 'Transcription job queued',
    },
    { status: 202 }
  );
}
