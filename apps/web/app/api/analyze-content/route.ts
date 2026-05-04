import { NextRequest, NextResponse } from 'next/server';

import { UnauthorizedError, requireAuth, unauthorizedResponse } from '@/server/lib/auth';
import { contentAnalysisService } from '@/server/services/content-analysis-service';
import { jobHistoryService } from '@/server/services/job-history-service';
import type { AnalyzeContentRequest } from '@/server/types/content-analysis';

/**
 * POST /api/analyze-content
 * Analyzes a transcript to identify viral clips. Records an `analysis` job
 * in the user's history.
 */
export async function POST(request: NextRequest) {
  let user;
  try {
    user = await requireAuth();
  } catch (error) {
    if (error instanceof UnauthorizedError) return unauthorizedResponse();
    throw error;
  }

  const body = (await request.json()) as AnalyzeContentRequest;
  const { transcript, language = 'en' } = body;

  try {
    contentAnalysisService.validateTranscript(transcript);
  } catch (validationError) {
    return NextResponse.json(
      {
        success: false,
        error: validationError instanceof Error ? validationError.message : 'Invalid transcript',
      },
      { status: 400 }
    );
  }

  const job = await jobHistoryService.create({
    userId: user.id,
    type: 'analysis',
    inputData: { language, transcriptLength: transcript.length },
  });

  try {
    await jobHistoryService.markProcessing(job.id);
    const data = await contentAnalysisService.analyzeTranscript(transcript, language);
    await jobHistoryService.complete(job.id, data);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    await jobHistoryService.fail(job.id, message);

    console.error('Content analysis error:', error);

    if (error instanceof Error && error.message.includes('not configured')) {
      return NextResponse.json(
        {
          success: false,
          error: 'Service configuration error',
          details: error.message,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { success: false, error: 'Failed to analyze content', details: message },
      { status: 500 }
    );
  }
}
