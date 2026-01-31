import { NextRequest, NextResponse } from 'next/server';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';
import type { CaptionTemplate } from '@remotion/compositions/types';

/**
 * POST /api/render-video-subtitles
 *
 * Render a video with subtitles using Remotion Server
 *
 * Request body:
 * - videoPath: string - Path to the video file
 * - subtitles: Array<{start: number, end: number, text: string}> - Subtitle segments
 * - template: CaptionTemplate - Template to use (default, viral, minimal, etc.)
 * - language: string - Language code (e.g., 'en', 'es')
 *
 * Response:
 * - success: boolean
 * - data: { jobId, videoUrl }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoPath, subtitles, template = 'viral', language = 'en' } = body;

    if (!videoPath) {
      return NextResponse.json(
        { success: false, message: 'videoPath is required' },
        { status: 400 }
      );
    }

    if (!subtitles || !Array.isArray(subtitles)) {
      return NextResponse.json(
        { success: false, message: 'subtitles array is required' },
        { status: 400 }
      );
    }

    console.log('Rendering video with subtitles:', {
      videoPath,
      template,
      language,
      subtitleCount: subtitles.length,
    });

    const result = await subtitleGenerationService.renderWithSubtitles({
      videoPath,
      subtitles,
      template: template as CaptionTemplate,
      language,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: 'Video rendered successfully with subtitles',
    });
  } catch (error) {
    console.error('Error rendering video with subtitles:', error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to render video',
      },
      { status: 500 }
    );
  }
}
