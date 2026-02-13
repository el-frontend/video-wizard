import { z } from 'zod';

/**
 * Silence/Filler Detection Types
 *
 * Type definitions for detecting and removing silences, filler words,
 * and short noise segments from subtitle data.
 */

/**
 * Configuration schema for silence/filler detection
 */
export const SilenceFillerConfigSchema = z.object({
  /** Minimum gap duration (ms) to consider as silence */
  silenceThresholdMs: z.number().min(100).max(5000).default(1000),
  /** Minimum segment duration (ms) — shorter segments are flagged as noise */
  minSegmentDurationMs: z.number().min(50).max(2000).default(300),
  /** List of filler words/phrases to detect */
  fillerWords: z
    .array(z.string())
    .default([
      'um',
      'uh',
      'eh',
      'ah',
      'like',
      'you know',
      'basically',
      'actually',
      'literally',
      'right',
      'so',
      'well',
      'I mean',
    ]),
  enableSilenceDetection: z.boolean().default(true),
  enableFillerDetection: z.boolean().default(true),
  enableShortSegmentDetection: z.boolean().default(true),
});

export type SilenceFillerConfig = z.infer<typeof SilenceFillerConfigSchema>;

/**
 * Type of detected issue
 */
export type DetectedIssueType = 'silence' | 'filler' | 'short-segment';

/**
 * A single detected issue in the subtitle timeline
 */
export interface DetectedIssue {
  type: DetectedIssueType;
  /** Index of the affected segment (-1 for gap-only issues) */
  segmentIndex: number;
  /** Start time in the subtitle's time unit */
  start: number;
  /** End time in the subtitle's time unit */
  end: number;
  /** Duration in the subtitle's time unit */
  duration: number;
  /** Human-readable description */
  description: string;
  /** Filler words matched (for filler type) */
  matchedFillers?: string[];
  /** Index of the segment after which this gap occurs (for silence type) */
  gapAfterIndex?: number;
}

/**
 * Aggregated detection results
 */
export interface DetectionResult {
  issues: DetectedIssue[];
  silenceCount: number;
  fillerCount: number;
  shortSegmentCount: number;
  totalSilenceDuration: number;
  totalFillerDuration: number;
}
