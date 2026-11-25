import { auth } from '@/auth';
import { unauthorizedResponse } from '@/server/lib/auth';
import { logger } from '@/server/lib/utils';
import { NextResponse } from 'next/server';

/**
 * POST /api/render-final
 *
 * Export video with subtitles (Phase T)
 *
 * NOTE: Currently disabled - use client-side preview with @remotion/player
 * For production exports:
 * - Option 1: Use Python FFmpeg backend to burn in subtitles
 * - Option 2: Deploy with Remotion Lambda
 * - Option 3: Use browser recording with @remotion/player
 *
 * See: https://www.remotion.dev/docs/ssr-node
 */
export async function POST(request: Request) {
  if (!(await auth(request))) return unauthorizedResponse();
  try {
    logger.info('Render request received');

    return NextResponse.json(
      {
        success: false,
        message: 'Server-side rendering not configured',
        alternatives: [
          'Use @remotion/player for preview',
          'Export via Python FFmpeg backend',
          'Deploy with Remotion Lambda for production',
        ],
        documentation: 'https://www.remotion.dev/docs/ssr-node',
      },
      { status: 501 }
    );
  } catch (error) {
    logger.error('Render endpoint error', error);

    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        {
          success: false,
          message: 'Invalid request data',
          errors: error,
        },
        { status: 400 }
      );
    }

    return NextResponse.json(
      {
        success: false,
        message: error instanceof Error ? error.message : 'Internal server error',
      },
      { status: 500 }
    );
  }
}
