'use client';

import { useState } from 'react';
import type { CaptionTemplate } from '@remotion/compositions/types';
import { getPythonEngineUrl, validateVideoFile } from '../lib/utils';

export interface SubtitleSegment {
  start: number; // milliseconds
  end: number; // milliseconds
  text: string;
}

export type SubtitleGenerationStep =
  | 'idle'
  | 'uploading'
  | 'generating-subtitles'
  | 'editing'
  | 'rendering'
  | 'complete'
  | 'error';

export interface SubtitleGenerationState {
  file: File | null;
  currentStep: SubtitleGenerationStep;
  uploadedPath: string;
  subtitles: SubtitleSegment[];
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
    currentStep: 'idle',
    uploadedPath: '',
    subtitles: [],
    language: 'auto',
    selectedTemplate: 'viral',
    renderedVideoUrl: '',
    error: '',
    progress: '',
  });

  const PYTHON_ENGINE_URL = getPythonEngineUrl();

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

  const setLanguage = (language: string) => {
    setState((prev) => ({ ...prev, language }));
  };

  const setTemplate = (template: CaptionTemplate) => {
    setState((prev) => ({ ...prev, selectedTemplate: template }));
  };

  const updateSubtitles = (subtitles: SubtitleSegment[]) => {
    setState((prev) => ({ ...prev, subtitles }));
  };

  const updateState = (updates: Partial<SubtitleGenerationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const resetState = () => {
    setState({
      file: null,
      currentStep: 'idle',
      uploadedPath: '',
      subtitles: [],
      language: 'auto',
      selectedTemplate: 'viral',
      renderedVideoUrl: '',
      error: '',
      progress: '',
    });
  };

  /**
   * Upload video and generate subtitles
   */
  const generateSubtitles = async () => {
    if (!state.file) return;

    try {
      // Step 1: Upload video
      updateState({
        currentStep: 'uploading',
        progress: 'Uploading video to server...',
        error: '',
      });

      const formData = new FormData();
      formData.append('file', state.file);

      const uploadResponse = await fetch(`${PYTHON_ENGINE_URL}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!uploadResponse.ok) {
        throw new Error('Error uploading video');
      }

      const uploadData = await uploadResponse.json();
      updateState({
        uploadedPath: uploadData.path,
        progress: `Video uploaded: ${uploadData.filename}`,
      });

      // Step 2: Generate subtitles
      updateState({
        currentStep: 'generating-subtitles',
        progress: 'Generating subtitles from video...',
      });

      const subtitleResponse = await fetch('/api/generate-subtitles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPath: uploadData.path,
          language: state.language === 'auto' ? null : state.language,
        }),
      });

      if (!subtitleResponse.ok) {
        throw new Error('Error generating subtitles');
      }

      const subtitleData = await subtitleResponse.json();

      if (!subtitleData.success || !subtitleData.data) {
        throw new Error(subtitleData.message || 'Subtitle generation failed');
      }

      updateState({
        subtitles: subtitleData.data.subtitles,
        language: subtitleData.data.language,
        currentStep: 'editing',
        progress: `Generated ${subtitleData.data.totalSegments} subtitle segments`,
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
   * Render video with subtitles
   */
  const renderVideo = async () => {
    if (!state.uploadedPath || state.subtitles.length === 0) {
      updateState({
        error: 'No video or subtitles available',
        currentStep: 'error',
      });
      return;
    }

    try {
      updateState({
        currentStep: 'rendering',
        progress: 'Rendering video with subtitles...',
        error: '',
      });

      const renderResponse = await fetch('/api/render-video-subtitles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoPath: state.uploadedPath,
          subtitles: state.subtitles,
          template: state.selectedTemplate,
          language: state.language,
        }),
      });

      if (!renderResponse.ok) {
        throw new Error('Error rendering video');
      }

      const renderData = await renderResponse.json();

      if (!renderData.success || !renderData.data) {
        throw new Error(renderData.message || 'Render failed');
      }

      updateState({
        renderedVideoUrl: renderData.data.videoUrl,
        currentStep: 'complete',
        progress: 'Video rendered successfully!',
      });

      options?.onComplete?.(renderData.data.videoUrl);
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
    setLanguage,
    setTemplate,
    updateSubtitles,
    generateSubtitles,
    renderVideo,
    resetState,
  };
}
