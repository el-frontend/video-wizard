import { NextRequest, NextResponse } from 'next/server';

/**
 * Input subtitle format from the client
 */
interface InputSubtitle {
  start: number;
  end: number;
  text: string;
}

/**
 * POST /api/render-with-subtitles
 * 
 * Regenerate a video clip with edited subtitles using Remotion Render Server
 * 
 * Request body:
 * - clipPath: string - Path to the clip video file
 * - subtitles: Array<{start: number, end: number, text: string}> - Edited subtitles
 * - template?: string - Template to use (default, viral, minimal, modern)
 * 
 * Response:
 * - success: boolean
 * - data: { videoUrl: string, jobId: string }
 * - message: string (if error)
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { clipPath, subtitles, template = 'viral' } = body;

    if (!clipPath) {
      return NextResponse.json(
        { success: false, message: 'clipPath is required' },
        { status: 400 }
      );
    }

    if (!subtitles || !Array.isArray(subtitles)) {
      return NextResponse.json(
        { success: false, message: 'subtitles array is required' },
        { status: 400 }
      );
    }

    // Get Remotion Render Server URL from environment
    const REMOTION_SERVER_URL = process.env.REMOTION_SERVER_URL || 'http://localhost:3001';

    // Transform subtitles to the expected format
    const formattedSubtitles = (subtitles as InputSubtitle[]).map((sub, index) => ({
      id: index + 1,
      start: sub.start,
      end: sub.end,
      text: sub.text,
    }));

    console.log('Creating render job on Remotion server:', {
      videoUrl: clipPath,
      subtitleCount: formattedSubtitles.length,
      template,
    });

    // Create render job on Remotion server
    const renderResponse = await fetch(`${REMOTION_SERVER_URL}/renders`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        compositionId: 'VideoWithSubtitles',
        inputProps: {
          videoUrl: clipPath,
          subtitles: formattedSubtitles,
          template,
          backgroundColor: '#000000',
        },
      }),
    });

    if (!renderResponse.ok) {
      const errorData = await renderResponse.json();
      throw new Error(errorData.message || 'Failed to create render job');
    }

    const { jobId } = await renderResponse.json();

    console.log('Render job created:', jobId);

    // Poll for job completion
    let attempts = 0;
    const maxAttempts = 60; // 2 minutes max (2 seconds per attempt)

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const statusResponse = await fetch(`${REMOTION_SERVER_URL}/renders/${jobId}`);

      if (!statusResponse.ok) {
        throw new Error('Failed to check render status');
      }

      const jobStatus = await statusResponse.json();

      if (jobStatus.status === 'completed') {
        console.log('Render completed:', jobStatus.videoUrl);
        
        return NextResponse.json({
          success: true,
          data: {
            videoUrl: jobStatus.videoUrl,
            jobId,
            clipPath,
          },
          message: 'Video rendered successfully with subtitles',
        });
      }

      if (jobStatus.status === 'failed') {
        throw new Error(jobStatus.error?.message || 'Render job failed');
      }

      // Log progress
      if (jobStatus.status === 'in-progress') {
        console.log(`Render progress: ${Math.round(jobStatus.progress * 100)}%`);
      }

      attempts++;
    }

    throw new Error('Render job timed out');
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
