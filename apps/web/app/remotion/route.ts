import { auth } from '@/auth';
import { unauthorizedResponse } from '@/server/lib/auth';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Remotion Bundle Serve Endpoint
 *
 * This endpoint serves the Remotion composition for rendering.
 * In development, it redirects to the Remotion dev server.
 * In production, you should pre-bundle and serve statically.
 *
 * See: https://www.remotion.dev/docs/ssr-node
 */
export async function GET(request: NextRequest) {
  if (!(await auth(request))) return unauthorizedResponse();
  // For now, return a helpful message
  // In production, you would serve a pre-built bundle
  return NextResponse.json(
    {
      error: 'Remotion bundle not configured',
      message:
        'For server-side rendering, please use @remotion/player for preview only, or deploy a pre-built bundle',
      documentation: 'https://www.remotion.dev/docs/ssr-node',
    },
    { status: 501 }
  );
}
