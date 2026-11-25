'use client';

import { authenticatedFetch, workspaceIdentity } from '@/lib/authenticated-fetch';
import { useState } from 'react';
import type { CaptionTemplate } from '@/remotion/types';
import type { AspectRatio } from '../lib/aspect-ratios';
import { isSourceDurationMs, type LegacySubtitleMs } from '../lib/legacy-timing';
import type { BrandKit } from '../types/brand-kit';
import { pollJobUntilDone } from '../lib/poll-job';
import { registerSource } from '@/features/studio-shorts/lib/api';
import { validateVideoFile } from '../lib/utils';
import { isYouTubeUrl } from '../lib/youtube';

export type SubtitleGenerationStep =
  | 'idle'
  | 'uploading'
  | 'generating-subtitles'
  | 'editing'
  | 'rendering'
  | 'complete'
  | 'error';

export type VideoInputMode = 'file' | 'youtube';

export interface SubtitleGenerationState {
  file: File | null;
  youtubeUrl: string;
  inputMode: VideoInputMode;
  aspectRatio: AspectRatio;
  currentStep: SubtitleGenerationStep;
  sourceAssetId: string;
  transcriptionJobId: string;
  sourceDurationMs: number | null;
  subtitles: LegacySubtitleMs[];
  language: string;
  selectedTemplate: CaptionTemplate;
  renderedVideoUrl: string;
  error: string;
  progress: string;
}

interface UseSubtitleGenerationOptions {
  onComplete?: (videoUrl: string) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for managing subtitle generation workflow
 *
 * Handles upload, transcription, subtitle editing, and video rendering
 */
export function useSubtitleGeneration(options?: UseSubtitleGenerationOptions) {
  const [state, setState] = useState<SubtitleGenerationState>({
    file: null,
    youtubeUrl: '',
    inputMode: 'file',
    aspectRatio: '9:16' as AspectRatio,
    currentStep: 'idle',
    sourceAssetId: '',
    transcriptionJobId: '',
    sourceDurationMs: null,
    subtitles: [],
    language: 'auto',
    selectedTemplate: 'viral',
    renderedVideoUrl: '',
    error: '',
    progress: '',
  });

  const setFile = (file: File | null) => {
    if (!file) {
      setState((prev) => ({ ...prev, file: null, error: '' }));
      return;
    }

    const validation = validateVideoFile(file);
    if (!validation.valid) {
      setState((prev) => ({ ...prev, error: validation.error || '' }));
      return;
    }

    setState((prev) => ({ ...prev, file, error: '' }));
  };

  const setYoutubeUrl = (youtubeUrl: string) => {
    setState((prev) => ({ ...prev, youtubeUrl, error: '' }));
  };

  const setInputMode = (inputMode: VideoInputMode) => {
    setState((prev) => ({ ...prev, inputMode, error: '' }));
  };

  const setAspectRatio = (aspectRatio: AspectRatio) => {
    setState((prev) => ({ ...prev, aspectRatio }));
  };

  const setLanguage = (language: string) => {
    setState((prev) => ({ ...prev, language }));
  };

  const setTemplate = (template: CaptionTemplate) => {
    setState((prev) => ({ ...prev, selectedTemplate: template }));
  };

  const updateSubtitles = (subtitles: LegacySubtitleMs[]) => {
    setState((prev) => ({ ...prev, subtitles }));
  };

  const updateState = (updates: Partial<SubtitleGenerationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const resetState = () => {
    setState({
      file: null,
      youtubeUrl: '',
      inputMode: 'file',
      aspectRatio: '9:16' as AspectRatio,
      currentStep: 'idle',
      sourceAssetId: '',
      transcriptionJobId: '',
      sourceDurationMs: null,
      subtitles: [],
      language: 'auto',
      selectedTemplate: 'viral',
      renderedVideoUrl: '',
      error: '',
      progress: '',
    });
  };

  /**
   * Upload video (or download from YouTube) and generate subtitles
   */
  const generateSubtitles = async () => {
    const operation = workspaceIdentity();
    const isYouTube = state.inputMode === 'youtube';

    if (!isYouTube && !state.file) return;
    if (isYouTube && !isYouTubeUrl(state.youtubeUrl)) return;

    try {
      // Step 1: Get video to server (upload or YouTube download)
      updateState({
        currentStep: 'uploading',
        progress: isYouTube ? 'Downloading video from YouTube...' : 'Uploading video to server...',
        error: '',
      });

      const asset = await registerSource(
        isYouTube ? state.youtubeUrl : state.file!,
        operation.signal
      );

      operation.signal.throwIfAborted();
      updateState({
        sourceAssetId: asset.id,
        sourceDurationMs: null,
        progress: `Video listo: ${asset.name}`,
      });

      // Step 2: Generate subtitles
      updateState({
        currentStep: 'generating-subtitles',
        progress: 'Generating subtitles from video...',
      });

      const subtitleResponse = await authenticatedFetch('/api/generate-subtitles', {
        method: 'POST',
        signal: operation.signal,
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceAssetId: asset.id,
          language: state.language === 'auto' ? null : state.language,
        }),
      });

      if (!subtitleResponse.ok) {
        throw new Error('Error queuing transcription');
      }

      const subtitleData = await subtitleResponse.json();

      if (!subtitleData.success || !subtitleData.data?.jobId) {
        throw new Error(subtitleData.message || 'Transcription queue failed');
      }

      // Worker drains the queue; poll the job until it finishes.
      const finished = await pollJobUntilDone(subtitleData.data.jobId, operation, (job) => {
        if (job.status === 'queued' || job.status === 'pending') {
          updateState({ progress: 'Waiting in queue...' });
        } else if (job.status === 'processing') {
          updateState({ progress: 'Transcribing audio...' });
        }
      });

      operation.signal.throwIfAborted();
      if (finished.status === 'failed') {
        throw new Error(finished.errorMessage || 'Transcription failed');
      }

      const result = finished.resultData as {
        subtitles?: LegacySubtitleMs[];
        sourceDurationMs?: number;
        language?: string;
        totalSegments?: number;
      } | null;

      if (!result?.subtitles) {
        throw new Error('Transcription finished but no subtitles were returned');
      }
      if (!isSourceDurationMs(result.sourceDurationMs)) {
        throw new Error('La transcripción terminó sin devolver la duración del video de origen');
      }

      updateState({
        transcriptionJobId: subtitleData.data.jobId,
        subtitles: result.subtitles,
        sourceDurationMs: result.sourceDurationMs,
        language: result.language ?? state.language,
        currentStep: 'editing',
        progress: `Generated ${result.totalSegments ?? result.subtitles.length} subtitle segments`,
      });
    } catch (err) {
      console.error('Subtitle generation error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updateState({
        error: errorMessage,
        currentStep: 'error',
      });
      options?.onError?.(errorMessage);
    }
  };

  /**
   * Enqueue a render job and poll the user's job row until it finishes.
   *
   * The render itself runs in the worker process (`pnpm --filter web
   * worker`); this hook only kicks it off and watches the resulting
   * `jobs` row via `GET /api/jobs/:id`.
   */
  const renderVideo = async (brandKit?: BrandKit) => {
    const operation = workspaceIdentity();
    if (!state.sourceAssetId || state.sourceDurationMs === null) {
      updateState({
        error: 'No hay un video de origen disponible',
        currentStep: 'error',
      });
      return;
    }

    try {
      updateState({
        currentStep: 'rendering',
        progress: 'Queuing render job...',
        error: '',
      });

      const renderResponse = await authenticatedFetch('/api/render-video-subtitles', {
        method: 'POST',
        signal: operation.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          jobId: state.transcriptionJobId,
          sourceDurationMs: state.sourceDurationMs,
          subtitles: state.subtitles,
          template: state.selectedTemplate,
          language: state.language,
          aspectRatio: state.aspectRatio,
          brandKit,
        }),
      });

      if (!renderResponse.ok) {
        throw new Error('Error queuing render job');
      }

      const renderData = await renderResponse.json();

      if (!renderData.success || !renderData.data?.jobId) {
        throw new Error(renderData.message || 'Render queue failed');
      }

      const jobId: string = renderData.data.jobId;

      const finished = await pollJobUntilDone(jobId, operation, (job) => {
        if (job.status === 'queued' || job.status === 'pending') {
          updateState({ progress: 'Waiting in queue...' });
        } else if (job.status === 'processing') {
          const pct = typeof job.progress === 'number' ? job.progress : 0;
          updateState({ progress: `Rendering video... ${pct}%` });
        }
      });

      operation.signal.throwIfAborted();
      if (finished.status === 'failed') {
        throw new Error(finished.errorMessage || 'Render failed');
      }

      const videoUrl = (finished.resultData as { videoUrl?: string } | null)?.videoUrl ?? '';

      if (!videoUrl) {
        throw new Error('Render finished but no videoUrl was returned');
      }

      updateState({
        renderedVideoUrl: videoUrl,
        currentStep: 'complete',
        progress: 'Video rendered successfully!',
      });

      options?.onComplete?.(videoUrl);
    } catch (err) {
      console.error('Render error:', err);
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      updateState({
        error: errorMessage,
        currentStep: 'error',
      });
      options?.onError?.(errorMessage);
    }
  };

  return {
    ...state,
    setFile,
    setYoutubeUrl,
    setInputMode,
    setAspectRatio,
    setLanguage,
    setTemplate,
    updateSubtitles,
    generateSubtitles,
    renderVideo,
    resetState,
  };
}
