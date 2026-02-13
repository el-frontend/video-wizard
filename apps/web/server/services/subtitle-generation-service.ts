/**
 * Subtitle Generation Service
 *
 * Handles video transcription and subtitle generation without content analysis
 */

import type { CaptionTemplate } from '@/remotion/types';

export interface SubtitleSegment {
  start: number; // milliseconds
  end: number; // milliseconds
  text: string;
}

export interface TranscriptionResult {
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>;
  text: string;
  language: string;
  segment_count: number;
}

export interface SubtitleGenerationInput {
  videoPath: string;
  language?: string; // Language code or 'auto' for auto-detection
}

export interface SubtitleGenerationResult {
  subtitles: SubtitleSegment[];
  language: string;
  totalSegments: number;
  videoDuration: number; // milliseconds
}

export interface BrandKitInput {
  logoUrl?: string;
  logoPosition?: 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
  logoScale?: number;
  primaryColor?: string;
  secondaryColor?: string;
  textColor?: string;
  backgroundColor?: string;
  fontFamily?: string;
}

export interface RenderSubtitlesInput {
  videoPath: string;
  subtitles: SubtitleSegment[];
  template: CaptionTemplate;
  language: string;
  aspectRatio?: string;
  brandKit?: BrandKitInput;
}

export interface RenderSubtitlesResult {
  jobId: string;
  videoUrl: string;
}

export class SubtitleGenerationService {
  private pythonEngineUrl: string;
  private remotionServerUrl: string;
  private pythonEngineInternalUrl: string;

  constructor() {
    this.pythonEngineUrl = process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL || 'http://localhost:8000';
    this.remotionServerUrl = process.env.REMOTION_SERVER_URL || 'http://localhost:3001';
    this.pythonEngineInternalUrl =
      process.env.PYTHON_ENGINE_INTERNAL_URL || 'http://processing-engine:8000';
  }

  /**
   * Generate subtitles from video transcription
   */
  async generateSubtitles(input: SubtitleGenerationInput): Promise<SubtitleGenerationResult> {
    try {
      // Call Python processing engine to transcribe video
      const response = await fetch(`${this.pythonEngineUrl}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_path: input.videoPath,
          language: input.language === 'auto' ? null : input.language,
          cleanup: false, // Don't delete audio file yet
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.detail || 'Failed to transcribe video');
      }

      const transcriptionData: TranscriptionResult = await response.json();

      // Transform segments to milliseconds format
      const subtitles: SubtitleSegment[] = transcriptionData.segments.map((segment) => ({
        start: Math.round(segment.start * 1000),
        end: Math.round(segment.end * 1000),
        text: segment.text.trim(),
      }));

      // Calculate video duration from last subtitle
      const lastSubtitle = subtitles[subtitles.length - 1];
      const videoDuration = lastSubtitle ? lastSubtitle.end : 0;

      return {
        subtitles,
        language: transcriptionData.language || 'en',
        totalSegments: transcriptionData.segment_count,
        videoDuration,
      };
    } catch (error) {
      console.error('Error generating subtitles:', error);
      throw error;
    }
  }

  /**
   * Render video with subtitles using Remotion Server
   */
  async renderWithSubtitles(input: RenderSubtitlesInput): Promise<RenderSubtitlesResult> {
    try {
      // Transform subtitles to Remotion format
      const formattedSubtitles = input.subtitles.map((sub, index) => ({
        id: index + 1,
        start: sub.start / 1000, // Convert to seconds
        end: sub.end / 1000, // Convert to seconds
        text: sub.text,
      }));

      // Calculate duration in frames
      const lastSubtitle = formattedSubtitles[formattedSubtitles.length - 1];
      const clipDurationMs = lastSubtitle ? lastSubtitle.end * 1000 : 10000;
      const fps = 30;
      const durationInFrames = Math.ceil((clipDurationMs / 1000) * fps);

      // Use internal URL for container-to-container communication
      const vUrl = new URL(`${this.pythonEngineInternalUrl}/${input.videoPath}`).toString();

      const aspectRatio = input.aspectRatio || '9:16';

      console.log('Creating render job:', {
        vUrl,
        subtitleCount: formattedSubtitles.length,
        template: input.template,
        language: input.language,
        aspectRatio,
        durationInFrames,
      });

      // Create render job on Remotion server
      const renderResponse = await fetch(`${this.remotionServerUrl}/renders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          compositionId: 'VideoWithSubtitles',
          inputProps: {
            videoUrl: vUrl,
            subtitles: formattedSubtitles,
            template: input.template,
            language: input.language,
            aspectRatio,
            backgroundColor: '#000000',
            durationInFrames,
            brandKit: input.brandKit,
          },
        }),
      });

      if (!renderResponse.ok) {
        const errorData = await renderResponse.json().catch(() => ({}));
        throw new Error(errorData.message || 'Failed to create render job');
      }

      const { jobId } = await renderResponse.json();

      console.log('Render job created:', jobId);

      // Poll for job completion
      const videoUrl = await this.pollRenderJob(jobId);

      return {
        jobId,
        videoUrl,
      };
    } catch (error) {
      console.error('Error rendering video with subtitles:', error);
      throw error;
    }
  }

  /**
   * Poll render job status until completion
   */
  private async pollRenderJob(jobId: string): Promise<string> {
    let attempts = 0;
    const pollIntervalMs = 2000;
    const maxAttempts = Math.ceil((30 * 60 * 1000) / pollIntervalMs); // 30 minutes max

    while (attempts < maxAttempts) {
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));

      const statusResponse = await fetch(`${this.remotionServerUrl}/renders/${jobId}`);

      if (!statusResponse.ok) {
        throw new Error('Failed to check render status');
      }

      const jobStatus = await statusResponse.json();

      if (jobStatus.status === 'completed') {
        console.log('Render completed:', jobStatus.videoUrl);
        return jobStatus.videoUrl;
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
  }

  /**
   * Get render job status
   */
  async getRenderStatus(jobId: string) {
    const response = await fetch(`${this.remotionServerUrl}/renders/${jobId}`);

    if (!response.ok) {
      throw new Error('Failed to get render status');
    }

    return response.json();
  }
}

export const subtitleGenerationService = new SubtitleGenerationService();
