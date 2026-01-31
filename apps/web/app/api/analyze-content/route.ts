import { contentAnalysisService } from '@/server/services/content-analysis-service';
import type {
    AnalyzeContentErrorResponse,
    AnalyzeContentRequest,
    AnalyzeContentResponse,
} from '@/server/types/content-analysis';
import { NextRequest, NextResponse } from 'next/server';

/**
 * API Route Handler for content analysis
 * 
 * POST /api/analyze-content
 * Analyzes video transcriptions to identify viral clips
 */
export async function POST(
  request: NextRequest
): Promise<NextResponse<AnalyzeContentResponse | AnalyzeContentErrorResponse>> {
  try {
    // Parse and validate request body
    const body = (await request.json()) as AnalyzeContentRequest;
    const { transcript, language = 'en' } = body;

    // Validate transcript
    try {
      contentAnalysisService.validateTranscript(transcript);
    } catch (validationError) {
      return NextResponse.json(
        {
          success: false,
          error:
            validationError instanceof Error
              ? validationError.message
              : 'Invalid transcript',
        },
        { status: 400 }
      );
    }

    // Execute analysis with detected language
    const data = await contentAnalysisService.analyzeTranscript(transcript, language);

    return NextResponse.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Content analysis error:', error);

    // Handle configuration errors
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

    // Generic error
    return NextResponse.json(
      {
        success: false,
        error: 'Failed to analyze content',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
