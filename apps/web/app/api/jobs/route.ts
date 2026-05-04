import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { jobs as jobsTable } from '@/server/db/schema';
import { jobHistoryService } from '@/server/services/job-history-service';

const listQuerySchema = z.object({
  type: z.enum(jobsTable.type.enumValues).optional(),
  status: z.enum(jobsTable.status.enumValues).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

/**
 * GET /api/jobs
 *
 * Returns the signed-in user's job history.
 * Query params: ?type=&status=&limit=&offset=
 */
export async function GET(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const params = Object.fromEntries(request.nextUrl.searchParams);
  const parsed = listQuerySchema.safeParse(params);

  if (!parsed.success) {
    return NextResponse.json(
      { success: false, error: 'Invalid query parameters' },
      { status: 400 }
    );
  }

  const { type, status, limit, offset } = parsed.data;

  const [items, total] = await Promise.all([
    jobHistoryService.listByUser(user.id, { type, status, limit, offset }),
    jobHistoryService.countByUser(user.id, { type, status }),
  ]);

  return NextResponse.json({
    success: true,
    data: { items, total, limit, offset },
  });
}
