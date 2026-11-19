import { z } from 'zod';

/**
 * Clip Rendering Types
 *
 * Types for integration with Python processing-engine /render-clip endpoint
 */

/**
 * Request schema for creating clips from Python service
 */
export const ClipRenderRequestSchema = z.object({
  video_path: z.string(),
  start_time: z.number().min(0),
  end_time: z.number(),
  crop_mode: z.enum(['dynamic', 'static']).default('dynamic'),
  output_path: z.string().optional(),
  aspect_ratio: z.enum(['9:16', '1:1', '4:5', '16:9']).optional().default('9:16'),
});

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
  audio_path: z.string().optional(),
  segments: z.array(
    z.object({
      id: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
    })
  ),
  full_text: z.string(),
  segment_count: z.number(),
});

// Type exports
export type ClipRenderRequest = z.infer<typeof ClipRenderRequestSchema>;
export type ClipRenderResponse = z.infer<typeof ClipRenderResponseSchema>;
export type TranscriptionResponse = z.infer<typeof TranscriptionResponseSchema>;
