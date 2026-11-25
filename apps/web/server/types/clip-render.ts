import { z } from 'zod';

/**
 * Clip Rendering Types
 *
 * Types for integration with Python processing-engine /render-clip endpoint
 */

/**
 * Response schema from Python service /render-clip
 */
export const ClipRenderResponseSchema = z.object({
  success: z.boolean(),
  output_path: z.string().optional(),
  output_url: z.string().optional(),
  crop_mode: z.string().optional(),
  duration: z.number().optional(),
  sourceDurationMs: z.number().positive().nullish(),
  crop_dimensions: z
    .object({
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  file_size: z.number().optional(),
  start_time: z.number().optional(),
  end_time: z.number().optional(),
  error: z.string().optional(),
});

/**
 * Transcription response from Python service
 */
export const TranscriptionResponseSchema = z.object({
  video_path: z.string(),
  audio_path: z.string().nullish(),
  language: z.string().optional(),
  segments: z.array(
    z.object({
      id: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      words: z.array(z.object({ word: z.string(), start: z.number(), end: z.number() })).optional(),
    })
  ),
  full_text: z.string(),
  segment_count: z.number(),
});

// Type exports
export type ClipRenderResponse = z.infer<typeof ClipRenderResponseSchema>;
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;

export const OwnedClipInputSchema = z
  .strictObject({
    sourceAssetId: z.uuid(),
    startMs: z.int().nonnegative(),
    endMs: z.int().positive(),
    crop_mode: z.enum(['dynamic', 'static']).default('dynamic'),
    aspect_ratio: z.enum(['9:16', '1:1', '4:5', '16:9']).default('9:16'),
  })
  .refine((r) => r.endMs > r.startMs);
