/**
 * Subtitle Generation Service
 *
 * Handles video transcription and subtitle generation without content analysis
 */

import {
  durationFrames,
  fromWhisperSeconds,
  isSourceDurationMs,
  legacyMsToSeconds,
  type LegacySubtitleMs,
  type SubtitleSegmentSeconds,
  type WhisperSegment,
} from '@/features/video/lib/legacy-timing';
import { getVideoSourceUrl } from '@/features/video/lib/utils';
import type { BrandKit, CaptionTemplate, SubtitleSegment } from '@workspace/remotion-compositions';

export interface TranscriptionResult {
  segments: WhisperSegment[];
  language: string;
  segment_count: number;
}

export interface SubtitleGenerationInput {
  videoPath: string;
  language?: string; // Language code or 'auto' for auto-detection
}

export interface SubtitleGenerationResult {
  subtitles: LegacySubtitleMs[];
  language: string;
  totalSegments: number;
  sourceDurationMs: number;
  videoDuration: number; // Compatibility field, in milliseconds
}

export interface RenderSubtitlesInput {
  videoPath: string;
  subtitles: LegacySubtitleMs[];
  sourceDurationMs?: number;
  template: CaptionTemplate;
  language: string;
  aspectRatio?: string;
  brandKit?: BrandKit;
}

export interface RenderSubtitlesResult {
  jobId: string;
  videoUrl: string;
}

export class SubtitleGenerationService {
  private readonly pythonEngineUrl: string;
  private readonly remotionVideoOrigin: string;
  private readonly remotionServerUrl: string;

  constructor() {
    // Prefer the in-network address when running in Docker, fall back to
    // the browser-facing one for host-based dev (port-mapped to localhost).
    this.pythonEngineUrl =
      process.env.PYTHON_ENGINE_INTERNAL_URL ||
      process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL ||
      'http://localhost:8000';
    // Remotion resolves video URLs from its own network, including in mixed host/container setups.
    this.remotionVideoOrigin =
      process.env.PYTHON_ENGINE_INTERNAL_URL || 'http://processing-engine:8000';
    this.remotionServerUrl = process.env.REMOTION_SERVER_URL || 'http://localhost:3001';
  }

  /**
   * Generate subtitles from video transcription
   */
  async generateSubtitles(input: SubtitleGenerationInput): Promise<SubtitleGenerationResult> {
    try {
      const sourceDurationMs = await this.probeSourceDurationMs(input.videoPath);
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

      return {
        subtitles: fromWhisperSeconds(transcriptionData.segments),
        language: transcriptionData.language || 'en',
        totalSegments: transcriptionData.segment_count,
        sourceDurationMs,
        videoDuration: sourceDurationMs,
      };
    } catch (error) {
      console.error('Error generating subtitles:', error);
      throw error;
    }
  }

  private async probeSourceDurationMs(videoPath: string): Promise<number> {
    const response = await fetch(`${this.pythonEngineUrl}/video-metadata`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ video_path: videoPath }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.detail || 'Failed to measure source video duration');
    }

    const { sourceDurationMs } = await response.json();
    if (!isSourceDurationMs(sourceDurationMs)) {
      throw new Error('Invalid source video duration');
    }
    return sourceDurationMs;
  }

  /**
   * Render video with subtitles using Remotion Server.
   *
   * Optional `onProgress` is invoked with an integer 0-100 every time the
   * upstream Remotion server reports progress. The worker uses it to keep
   * the user-facing job's progress bar moving while the render runs.
   */
  renderWithSubtitles(
    input: RenderSubtitlesInput,
    onProgress?: (percent: number) => void | Promise<void>
  ): Promise<RenderSubtitlesResult> {
    return this.render({ ...input, subtitles: legacyMsToSeconds(input.subtitles) }, onProgress);
  }

  renderClipWithSubtitles(
    input: Omit<RenderSubtitlesInput, 'subtitles'> & { subtitles: SubtitleSegmentSeconds[] }
  ): Promise<RenderSubtitlesResult> {
    const subtitles = input.subtitles.map((subtitle, index) => ({ ...subtitle, id: index + 1 }));
    return this.render({ ...input, subtitles });
  }

  private async render(
    input: Omit<RenderSubtitlesInput, 'subtitles'> & { subtitles: SubtitleSegment[] },
    onProgress?: (percent: number) => void | Promise<void>
  ): Promise<RenderSubtitlesResult> {
    try {
      const videoUrl = getVideoSourceUrl(this.remotionVideoOrigin, input.videoPath);
      const sourceDurationMs =
        input.sourceDurationMs ?? (await this.probeSourceDurationMs(input.videoPath));
      if (!isSourceDurationMs(sourceDurationMs)) {
        throw new Error('Invalid source video duration');
      }
      const durationInFrames = durationFrames(sourceDurationMs, 30);

      const aspectRatio = input.aspectRatio || '9:16';

      console.log('Creating render job:', {
        videoUrl,
        subtitleCount: input.subtitles.length,
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
            videoUrl,
            subtitles: input.subtitles,
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
      const renderedVideoUrl = await this.pollRenderJob(jobId, onProgress);

      return {
        jobId,
        videoUrl: renderedVideoUrl,
      };
    } catch (error) {
      console.error('Error rendering video with subtitles:', error);
      throw error;
    }
  }

  /**
   * Poll render job status until completion. When `onProgress` is given,
   * forward the upstream progress (0-100 integer) on every status check.
   */
  private async pollRenderJob(
    jobId: string,
    onProgress?: (percent: number) => void | Promise<void>
  ): Promise<string> {
    let attempts = 0;
    let lastReportedProgress = -1;
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

      if (jobStatus.status === 'in-progress' && typeof jobStatus.progress === 'number') {
        const pct = Math.round(jobStatus.progress * 100);
        console.log(`Render progress: ${pct}%`);

        if (onProgress && pct !== lastReportedProgress) {
          lastReportedProgress = pct;
          try {
            await onProgress(pct);
          } catch (progressError) {
            // Don't fail the render just because progress reporting failed.
            console.warn('Progress callback threw:', progressError);
          }
        }
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
