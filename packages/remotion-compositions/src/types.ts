/**
 * Remotion Video Composition Types
 * 
 * Type definitions for video composition props and subtitle data
 */

/**
 * Individual subtitle segment with timing
 */
export interface SubtitleSegment {
  id: number;
  start: number; // Time in seconds
  end: number;   // Time in seconds
  text: string;
  words?: WordTiming[];
}

/**
 * Word-level timing for fine-grained synchronization
 */
export interface WordTiming {
  word: string;
  start: number;
  end: number;
}

/**
 * Available caption template types
 */
export type CaptionTemplate = 'default' | 'viral' | 'minimal' | 'modern' | 'highlight' | 'colorshift' | 'hormozi' | 'mrbeast' | 'mrbeastemoji';

/**
 * Props for the main video composition
 */
export interface VideoCompositionProps {
  videoUrl: string;
  subtitles: SubtitleSegment[];
  template: CaptionTemplate;
  language?: string; // Language code for emoji matching (e.g., 'en', 'es')
  backgroundColor?: string;
  videoStartTime?: number; // Start offset in the source video
}

/**
 * Props for caption template components
 */
export interface CaptionTemplateProps {
  currentWord: string;
  currentSegment: SubtitleSegment | null;
  isActive: boolean;
  language?: string; // Language code for emoji matching
}
