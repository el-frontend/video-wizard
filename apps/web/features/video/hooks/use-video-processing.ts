'use client';

import type { ContentAnalysis } from '@/lib/types/content-intelligence';
import { useState } from 'react';
import { formatTranscriptForAI, validateVideoFile } from '../lib/utils';
import { registerSource, transcribeSource } from '@/features/studio-shorts/lib/api';
import { toLegacySeconds } from '@/features/studio-shorts/lib/timing';
import { isYouTubeUrl } from '../lib/youtube';
import type {
  AspectRatio,
  TranscriptionResult,
  VideoInputMode,
  VideoProcessingState,
} from '../types';

interface UseVideoProcessingOptions {
  onComplete?: (
    analysis: ContentAnalysis,
    sourceAssetId: string,
    transcription: TranscriptionResult
  ) => void;
  onError?: (error: string) => void;
}

/**
 * Hook for managing video processing workflow
 *
 * Handles upload, transcription, and AI analysis
 */
export function useVideoProcessing(options?: UseVideoProcessingOptions) {
  const [state, setState] = useState<VideoProcessingState>({
    file: null,
    youtubeUrl: '',
    inputMode: 'file',
    aspectRatio: '9:16' as AspectRatio,
    currentStep: 'idle',
    sourceAssetId: '',
    transcription: null,
    analysis: null,
    language: 'en',
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

  const updateState = (updates: Partial<VideoProcessingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const setAspectRatio = (aspectRatio: AspectRatio) => {
    setState((prev) => ({ ...prev, aspectRatio }));
  };

  const resetState = () => {
    setState({
      file: null,
      youtubeUrl: '',
      inputMode: 'file',
      aspectRatio: '9:16' as AspectRatio,
      currentStep: 'idle',
      sourceAssetId: '',
      transcription: null,
      analysis: null,
      language: 'en',
      error: '',
      progress: '',
    });
  };

  const processVideo = async () => {
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
        new AbortController().signal
      );
      updateState({
        sourceAssetId: asset.id,
        currentStep: 'transcribing',
        progress: 'Extracting audio and generating subtitles...',
      });
      const { cues, language } = await transcribeSource(asset.id);
      const transcriptionData: TranscriptionResult = {
        cues,
        language: language ?? 'en',
        segments: toLegacySeconds(cues),
        full_text: cues.map((c) => c.text).join(' '),
        segment_count: cues.length,
      };
      const detectedLanguage = transcriptionData.language || 'en';
      updateState({
        transcription: transcriptionData,
        language: detectedLanguage,
        progress: `Transcription complete: ${transcriptionData.segment_count} segments (${detectedLanguage.toUpperCase()})`,
      });

      // Step 3: Analyze with AI
      updateState({
        currentStep: 'analyzing',
        progress: 'Analyzing content with AI to find viral clips...',
      });

      const formattedTranscript = formatTranscriptForAI(transcriptionData.segments);

      const analysisResponse = await fetch('/api/analyze-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          transcript: formattedTranscript,
          language: detectedLanguage,
        }),
      });

      if (!analysisResponse.ok) {
        throw new Error('Error analyzing content');
      }

      const analysisData = await analysisResponse.json();

      if (!analysisData.success || !analysisData.data) {
        throw new Error(analysisData.error || 'Analysis error');
      }

      updateState({
        analysis: analysisData.data,
        currentStep: 'complete',
        progress: 'Process completed! Viral clips found.',
      });

      options?.onComplete?.(analysisData.data, asset.id, transcriptionData);
    } catch (err) {
      console.error('Processing error:', err);
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
    processVideo,
    resetState,
  };
}
