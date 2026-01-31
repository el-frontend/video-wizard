'use client';

import type { ContentAnalysis } from '@/lib/types/content-intelligence';
import { useState } from 'react';
import { formatTranscriptForAI, getPythonEngineUrl, validateVideoFile } from '../lib/utils';
import type { TranscriptionResult, VideoProcessingState } from '../types';

interface UseVideoProcessingOptions {
  onComplete?: (
    analysis: ContentAnalysis,
    uploadedPath: string,
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
    currentStep: 'idle',
    uploadedPath: '',
    transcription: null,
    analysis: null,
    language: 'en',
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

  const updateState = (updates: Partial<VideoProcessingState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  };

  const resetState = () => {
    setState({
      file: null,
      currentStep: 'idle',
      uploadedPath: '',
      transcription: null,
      analysis: null,
      language: 'en',
      error: '',
      progress: '',
    });
  };

  const processVideo = async () => {
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

      // Step 2: Transcribe video
      updateState({
        currentStep: 'transcribing',
        progress: 'Extracting audio and generating subtitles...',
      });

      const transcribeResponse = await fetch(`${PYTHON_ENGINE_URL}/transcribe`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          video_path: uploadData.path,
          language: null, // Auto-detect
          cleanup: true,
        }),
      });

      if (!transcribeResponse.ok) {
        throw new Error('Error transcribing video');
      }

      const transcriptionData: TranscriptionResult = await transcribeResponse.json();
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

      options?.onComplete?.(analysisData.data, uploadData.path, transcriptionData);
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
    processVideo,
    resetState,
  };
}
