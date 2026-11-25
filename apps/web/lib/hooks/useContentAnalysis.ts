'use client';

import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type {
  AnalyzeContentErrorResponse,
  AnalyzeContentResponse,
  ContentAnalysis,
} from '@/lib/types/content-intelligence';
import { useState } from 'react';

interface UseContentAnalysisOptions {
  onSuccess?: (data: ContentAnalysis) => void;
  onError?: (error: string) => void;
}

export function useContentAnalysis(options?: UseContentAnalysisOptions) {
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState<ContentAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);

  const analyzeContent = async (transcript: string) => {
    setIsAnalyzing(true);
    setError(null);

    try {
      const response = await authenticatedFetch('/api/analyze-content', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ transcript }),
      });

      const data: AnalyzeContentResponse | AnalyzeContentErrorResponse = await response.json();

      if (!response.ok || !data.success) {
        const errorData = data as AnalyzeContentErrorResponse;
        const errorMessage = errorData.error || 'Failed to analyze content';
        setError(errorMessage);
        options?.onError?.(errorMessage);
        return null;
      }

      const successData = data as AnalyzeContentResponse;
      setAnalysis(successData.data);
      options?.onSuccess?.(successData.data);
      return successData.data;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error occurred';
      setError(errorMessage);
      options?.onError?.(errorMessage);
      return null;
    } finally {
      setIsAnalyzing(false);
    }
  };

  const reset = () => {
    setAnalysis(null);
    setError(null);
    setIsAnalyzing(false);
  };

  return {
    analyzeContent,
    isAnalyzing,
    analysis,
    error,
    reset,
  };
}
