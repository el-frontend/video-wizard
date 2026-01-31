import { NextRequest, NextResponse } from 'next/server';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';

/**
 * POST /api/generate-subtitles
 *
 * Generate subtitles from a video file without content analysis
 *
 * Request body:
 * - videoPath: string - Path to the uploaded video file
 * - language?: string - Language code for transcription ('auto' for auto-detect)
 *
 * Response:
 * - success: boolean
 * - data: { subtitles, language, totalSegments, videoDuration }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { videoPath, language = 'auto' } = body;

    if (!videoPath) {
      return NextResponse.json(
        { success: false, message: 'videoPath is required' },
        { status: 400 }
      );
    }

    console.log('Generating subtitles for:', videoPath);

    const result = await subtitleGenerationService.generateSubtitles({
      videoPath,
      language,
    });

    return NextResponse.json({
      success: true,
      data: result,
      message: `Generated ${result.totalSegments} subtitle segments`,
    });
  } catch (error) {
    console.error('Error generating subtitles:', error);

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Failed to generate subtitles',
      },
      { status: 500 }
    );
  }
}
