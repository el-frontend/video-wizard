'use client';

import { pollJobUntilDone } from '@/features/video/lib/poll-job';
import type { SubtitleSegment } from '@/server/types/video-render';
import { useCallback, useState } from 'react';

interface ClipWorkflowState {
  isProcessing: boolean;
  currentStep: 'idle' | 'creating-clip' | 'transcribing' | 'ready' | 'error';
  clipUrl: string | null;
  subtitles: SubtitleSegment[];
  error: string | null;
  clipMetadata: {
    duration?: number;
    cropDimensions?: { width: number; height: number };
    fileSize?: number;
  } | null;
}

interface CreateClipParams {
  videoPath: string;
  startTime: number;
  endTime: number;
  cropMode?: 'dynamic' | 'static';
  includeTranscription?: boolean;
}

/**
 * Hook: useClipWorkflow
 *
 * Orchestrates the complete workflow for creating clips with subtitles
 * Integrates Python backend /render-clip with Next.js frontend
 *
 * Workflow:
 * 1. Call /api/create-clip -> Python /render-clip (creates vertical clip)
 * 2. Call /api/transcribe -> Python /transcribe (gets subtitles)
 * 3. Ready for preview/export with Remotion
 */
export function useClipWorkflow() {
  const [state, setState] = useState<ClipWorkflowState>({
    isProcessing: false,
    currentStep: 'idle',
    clipUrl: null,
    subtitles: [],
    error: null,
    clipMetadata: null,
  });

  /**
   * Create a clip with optional transcription
   */
  const createClip = useCallback(async (params: CreateClipParams) => {
    try {
      setState((prev) => ({
        ...prev,
        isProcessing: true,
        currentStep: 'creating-clip',
        error: null,
      }));

      // Step 1: Enqueue the vertical clip via the worker queue.
      const clipResponse = await fetch('/api/create-clip', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_path: params.videoPath,
          start_time: params.startTime,
          end_time: params.endTime,
          crop_mode: params.cropMode || 'dynamic',
        }),
      });

      if (!clipResponse.ok) {
        const error = await clipResponse.json();
        throw new Error(error.message || 'Failed to queue clip creation');
      }

      const queued = await clipResponse.json();

      if (!queued.success || !queued.data?.jobId) {
        throw new Error('Clip creation queue failed');
      }

      const finished = await pollJobUntilDone(queued.data.jobId);
      if (finished.status === 'failed') {
        throw new Error(finished.errorMessage || 'Clip creation failed');
      }

      const clipData = finished.resultData as {
        output_url?: string;
        duration?: number;
        crop_dimensions?: { width: number; height: number };
        file_size?: number;
      } | null;

      if (!clipData?.output_url) {
        throw new Error('Clip finished but no output_url was returned');
      }

      const clipUrl = clipData.output_url;

      setState((prev) => ({
        ...prev,
        clipUrl,
        clipMetadata: {
          duration: clipData.duration,
          cropDimensions: clipData.crop_dimensions,
          fileSize: clipData.file_size,
        },
      }));

      // Step 2: Get transcription if requested
      if (params.includeTranscription) {
        setState((prev) => ({
          ...prev,
          currentStep: 'transcribing',
        }));

        const transcribeResponse = await fetch('/api/transcribe', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            video_path: params.videoPath,
          }),
        });

        if (!transcribeResponse.ok) {
          throw new Error('Transcription failed');
        }

        const transcribeResult = await transcribeResponse.json();

        // Filter segments to match clip time range
        const filteredSegments = transcribeResult.data.segments
          .filter(
            (seg: SubtitleSegment) => seg.start >= params.startTime && seg.end <= params.endTime
          )
          .map((seg: SubtitleSegment) => ({
            ...seg,
            // Adjust timestamps relative to clip start
            start: seg.start - params.startTime,
            end: seg.end - params.startTime,
          }));

        setState((prev) => ({
          ...prev,
          subtitles: filteredSegments,
        }));
      }

      // Step 3: Ready for preview/export
      setState((prev) => ({
        ...prev,
        isProcessing: false,
        currentStep: 'ready',
      }));

      return {
        clipUrl,
        subtitles: state.subtitles,
        metadata: state.clipMetadata,
      };
    } catch (error) {
      console.error('Clip workflow error:', error);

      setState((prev) => ({
        ...prev,
        isProcessing: false,
        currentStep: 'error',
        error: error instanceof Error ? error.message : 'Workflow failed',
      }));

      throw error;
    }
  }, []);

  /**
   * Reset workflow state
   */
  const reset = useCallback(() => {
    setState({
      isProcessing: false,
      currentStep: 'idle',
      clipUrl: null,
      subtitles: [],
      error: null,
      clipMetadata: null,
    });
  }, []);

  return {
    ...state,
    createClip,
    reset,
  };
}
