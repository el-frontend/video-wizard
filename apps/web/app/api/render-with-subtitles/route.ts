import { NextRequest, NextResponse } from 'next/server';

import { isSourceDurationMs } from '@/features/video/lib/legacy-timing';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

/**
 * POST /api/render-with-subtitles
 * Renders an existing clip using edited subtitles and word timestamps in seconds.
 * Accepts a measured sourceDurationMs. Older clients may omit it.
 */
export async function POST(request: NextRequest) {
  try {
    const {
      clipPath,
      subtitles,
      sourceDurationMs,
      template = 'viral',
      language = 'en',
      aspectRatio = '9:16',
      brandKit,
    } = await request.json();

    if (!clipPath) {
      return NextResponse.json(
        { success: false, message: 'clipPath is required' },
        { status: 400 }
      );
    }

    if (!Array.isArray(subtitles)) {
      return NextResponse.json(
        { success: false, message: 'subtitles array is required' },
        { status: 400 }
      );
    }

    if (sourceDurationMs !== undefined && !isSourceDurationMs(sourceDurationMs)) {
      return NextResponse.json(
        { success: false, message: 'sourceDurationMs must be positive' },
        { status: 400 }
      );
    }

    const result = await subtitleGenerationService.renderClipWithSubtitles({
      videoPath: clipPath,
      subtitles,
      sourceDurationMs,
      template,
      language,
      aspectRatio,
      brandKit,
    });

    return NextResponse.json({
      success: true,
      data: { ...result, clipPath },
      message: 'Video rendered successfully with subtitles',
    });
  } catch (error) {
    console.error('Error rendering video with subtitles:', error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Unknown error occurred',
      },
      { status: 500 }
    );
  }
}
