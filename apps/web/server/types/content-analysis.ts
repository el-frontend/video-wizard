import { z } from 'zod';

/**
 * Zod schema for an individual viral clip
 */
export const ViralClipSchema = z.object({
  start_time: z.number().min(0).describe('Start time in seconds'),
  end_time: z.number().describe('End time in seconds'),
  viral_score: z
    .number()
    .min(0)
    .max(100)
    .describe('Viral potential score from 0-100'),
  summary: z.string().describe('Brief description of why this clip is engaging'),
  hook: z.string().describe('The attention-grabbing element in this clip'),
  conclusion: z.string().describe('How the clip ends or wraps up'),
});

/**
 * Schema for the complete content analysis response
 */
export const ContentAnalysisSchema = z.object({
  clips: z
    .array(ViralClipSchema)
    .describe('Array of identified viral-worthy clips'),
  total_clips: z.number().describe('Total number of clips identified'),
  analysis_summary: z
    .string()
    .describe('Overall summary of the content analysis'),
});

/**
 * TypeScript types inferred from Zod schemas
 */
export type ViralClip = z.infer<typeof ViralClipSchema>;
export type ContentAnalysis = z.infer<typeof ContentAnalysisSchema>;

/**
 * Request payload for content analysis
 */
export interface AnalyzeContentRequest {
  transcript: string;
  language?: string; // Detected language code (e.g., "en", "es")
}

/**
 * Response payload for successful content analysis
 */
export interface AnalyzeContentResponse {
  success: true;
  data: ContentAnalysis;
}

/**
 * Response payload for errors
 */
export interface AnalyzeContentErrorResponse {
  success: false;
  error: string;
  details?: string;
}
