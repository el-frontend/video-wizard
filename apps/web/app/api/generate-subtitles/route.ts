import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

/**
 * POST /api/generate-subtitles
 *
 * Generate subtitles from a video file. Records a `transcription` job in
 * the user's history.
 *
 * Request body:
 * - videoPath: string - Path to the uploaded video file
 * - language?: string - Language code for transcription ('auto' for auto-detect)
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

  try {
    await jobHistoryService.markProcessing(job.id);
    console.log('Generating subtitles for:', videoPath);

    const result = await subtitleGenerationService.generateSubtitles({
      videoPath,
      language,
    });

    // Persist a lightweight result snapshot (skip the full subtitles array
    // to keep the row size small; clients re-fetch from the response).
    await jobHistoryService.complete(job.id, {
      language: result.language,
      totalSegments: result.totalSegments,
      videoDuration: result.videoDuration,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Generated ${result.totalSegments} subtitle segments`,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to generate subtitles';
    await jobHistoryService.fail(job.id, message);
    console.error('Error generating subtitles:', error);

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
