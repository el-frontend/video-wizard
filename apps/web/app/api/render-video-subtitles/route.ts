import { NextRequest, NextResponse } from 'next/server';

import type { CaptionTemplate } from '@/remotion/types';
import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

/**
 * POST /api/render-video-subtitles
 *
 * Render a video with subtitles using the Remotion server. Records a
 * `render` job in the user's history.
 *
 * Request body:
 * - videoPath: string
 * - subtitles: Array<{start: number, end: number, text: string}>
 * - template: CaptionTemplate (default: 'viral')
 * - language: string (default: 'en')
 * - aspectRatio?: '9:16' | '1:1' | '4:5' | '16:9' (default: '9:16')
 * - brandKit?: BrandKit
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
      template,
      language,
      aspectRatio,
      subtitleCount: subtitles.length,
      brandKit,
    },
  });

  try {
    await jobHistoryService.markProcessing(job.id);
    console.log('Rendering video with subtitles:', {
      videoPath,
      template,
      language,
      aspectRatio,
      subtitleCount: subtitles.length,
    });

    const result = await subtitleGenerationService.renderWithSubtitles({
      videoPath,
      subtitles,
      template: template as CaptionTemplate,
      language,
      aspectRatio,
      brandKit,
    });

    await jobHistoryService.complete(job.id, result);

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Video rendered successfully with subtitles',
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to render video';
    await jobHistoryService.fail(job.id, message);
    console.error('Error rendering video with subtitles:', error);

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
