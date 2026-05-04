import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';
import { queueService } from '@/server/services/queue-service';

/**
 * POST /api/render-video-subtitles
 *
 * Enqueues a render job and returns the DB job id immediately. The actual
 * render runs in the worker process (apps/web — `pnpm worker`); clients
 * poll `GET /api/jobs/:id` to watch progress and pick up the final
 * `videoUrl` from `resultData` once `status === 'completed'`.
 *
 * Request body:
 * - videoPath: string
 * - subtitles: Array<{start: number, end: number, text: string}>
 * - template: CaptionTemplate (default: 'viral')
 * - language: string (default: 'en')
 * - aspectRatio?: '9:16' | '1:1' | '4:5' | '16:9' (default: '9:16')
 * - brandKit?: BrandKit
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
  const {
    videoPath,
    subtitles,
    template = 'viral',
    language = 'en',
    aspectRatio = '9:16',
    brandKit,
  } = body;

  if (!videoPath) {
    return NextResponse.json({ success: false, message: 'videoPath is required' }, { status: 400 });
  }

  if (!subtitles || !Array.isArray(subtitles)) {
    return NextResponse.json(
      { success: false, message: 'subtitles array is required' },
      { status: 400 }
    );
  }

  const job = await jobHistoryService.create({
    userId: user.id,
    type: 'render',
    inputData: {
      videoPath,
      subtitles,
      template,
      language,
      aspectRatio,
      subtitleCount: subtitles.length,
      brandKit,
    },
  });

  await queueService.enqueue({ jobId: job.id, queueName: 'default' });

  return NextResponse.json(
    {
      success: true,
      data: { jobId: job.id },
      message: 'Render job queued',
    },
    { status: 202 }
  );
}
