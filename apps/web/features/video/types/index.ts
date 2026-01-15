/**
 * Video Feature Types
 * 
 * Type definitions for the video processing feature
 */

import type { ContentAnalysis } from '@/server/types/content-analysis';

export interface TranscriptSegment {
  id: number;
  start: number;
  end: number;
  text: string;
}

export interface TranscriptionResult {
  video_path: string;
  audio_path?: string;
  segments: TranscriptSegment[];
  full_text: string;
  segment_count: number;
}

export type ProcessingStep = 
  | 'idle' 
  | 'uploading' 
  | 'transcribing' 
  | 'analyzing' 
  | 'complete' 
  | 'error';

export type StepStatus = 'complete' | 'current' | 'error' | 'pending';

export interface VideoProcessingState {
  file: File | null;
  currentStep: ProcessingStep;
  uploadedPath: string;
  transcription: TranscriptionResult | null;
  analysis: ContentAnalysis | null;
  error: string;
  progress: string;
}

/**
 * Subtitle segment for video clips
 */
export interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

/**
 * Generated video clip with loading state
 */
export interface GeneratedClip {
  index: number;
  summary: string;
  viralScore: number;
  startTime: number;
  endTime: number;
  duration: number;
  videoUrl?: string;
  clipPath?: string;
  subtitles?: SubtitleSegment[];
  isLoading: boolean;
  error?: string;
}
