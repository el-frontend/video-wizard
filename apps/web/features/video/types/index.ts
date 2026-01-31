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
  language: string; // Detected language code (e.g., "en", "es")
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
  language: string; // Detected language code
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
 * Template style for subtitle rendering
 */
export type SubtitleTemplate = 'default' | 'viral' | 'minimal' | 'modern' | 'highlight' | 'colorshift' | 'hormozi' | 'mrbeast' | 'mrbeastemoji';

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
  videoUrl?: string; // Cropped video without subtitles (for preview)
  clipPath?: string; // Path to cropped video
  renderedVideoUrl?: string; // Final rendered video with subtitles from Remotion server
  subtitles?: SubtitleSegment[];
  template?: SubtitleTemplate; // Current template selection
  language?: string; // Language code for emoji template
  isLoading: boolean;
  isRendering?: boolean; // True when rendering final video
  error?: string;
}
