import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { logger } from '@/server/lib/utils';
import { clipIntegrationService } from '@/server/services/clip-integration-service';
import { jobHistoryService } from '@/server/services/job-history-service';
import { ClipRenderRequestSchema } from '@/server/types/clip-render';

/**
 * POST /api/create-clip
 *
 * Proxies to the Python backend `/render-clip` to create a vertical clip
 * with smart cropping. Records a `clip_creation` job in the user's history.
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  let validatedData;
  try {
    const body = await request.json();
    validatedData = ClipRenderRequestSchema.parse(body);
  } catch (error) {
    if (error instanceof Error && error.name === 'ZodError') {
      return NextResponse.json(
        { success: false, message: 'Invalid request data', errors: error },
        { status: 400 }
      );
    }
    throw error;
  }

  logger.info('Create clip request received', {
    start_time: validatedData.start_time,
    end_time: validatedData.end_time,
  });

  const job = await jobHistoryService.create({
    userId: user.id,
    type: 'clip_creation',
    inputData: validatedData,
  });

  try {
    await jobHistoryService.markProcessing(job.id);

    const result = await clipIntegrationService.createClip(validatedData);

    if (!result.success) {
      const message = result.error || 'Clip creation failed';
      await jobHistoryService.fail(job.id, message);
      return NextResponse.json({ success: false, message }, { status: 500 });
    }

    const fullUrl = result.output_url
      ? clipIntegrationService.getVideoUrl(result.output_url)
      : null;

    const enriched = { ...result, output_url: fullUrl };
    await jobHistoryService.complete(job.id, enriched);

    logger.info('Clip created successfully', { output_url: fullUrl });

    return NextResponse.json({ success: true, data: enriched });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    await jobHistoryService.fail(job.id, message);
    logger.error('Create clip endpoint error', error);

    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
