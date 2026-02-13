/**
 * Video Feature Types
 *
 * Type definitions for the video processing feature
 */

import type { ContentAnalysis } from '@/server/types/content-analysis';
import type { AspectRatio } from '../lib/aspect-ratios';

export type { AspectRatio } from '../lib/aspect-ratios';

// Brand Kit types
export type { BrandKit, LogoPosition } from './brand-kit';
export { BrandKitSchema, BRAND_KIT_STORAGE_KEY, DEFAULT_FONT_OPTIONS } from './brand-kit';

// Silence/Filler types
export type { DetectedIssue, DetectionResult, SilenceFillerConfig } from './silence-filler';
export { SilenceFillerConfigSchema } from './silence-filler';

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

export type VideoInputMode = 'file' | 'youtube';

export interface VideoProcessingState {
  file: File | null;
  youtubeUrl: string;
  inputMode: VideoInputMode;
  aspectRatio: AspectRatio;
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
export type SubtitleTemplate =
  | 'default'
  | 'viral'
  | 'minimal'
  | 'modern'
  | 'highlight'
  | 'colorshift'
  | 'hormozi'
  | 'mrbeast'
  | 'mrbeastemoji';

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
  aspectRatio?: AspectRatio; // Aspect ratio for this clip
  isLoading: boolean;
  isRendering?: boolean; // True when rendering final video
  error?: string;
}
