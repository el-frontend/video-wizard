import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobHistoryService } from '@/server/services/job-history-service';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/jobs/:id
 *
 * Fetch a single job. Returns 404 when the job doesn't exist OR belongs
 * to another user (no leakage of which IDs exist for other accounts).
 *
 * Designed to be polled by clients while a queued job is processing.
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const { id } = await context.params;

  const job = await jobHistoryService.getById(id, user.id);
  if (!job) {
    return NextResponse.json({ success: false, error: 'Job not found' }, { status: 404 });
  }

  return NextResponse.json({ success: true, data: job });
}
