import type {
  BrandKit,
  CaptionTemplate as RenderTemplate,
  SubtitleSegment as RenderCaption,
} from '@workspace/remotion-compositions';
import { z } from 'zod';

/**
 * Video Rendering Service Types
 *
 * Zod schemas for video rendering and composition
 */

/**
 * Subtitle segment schema
 */
export const SubtitleSegmentSchema = z.object({
  id: z.number(),
  start: z.number(),
  end: z.number(),
  text: z.string(),
  words: z
    .array(
      z.object({
        word: z.string(),
        start: z.number(),
        end: z.number(),
      })
    )
    .optional(),
});

/**
 * Caption template types
 */
export const CaptionTemplateSchema = z.enum(['default', 'viral', 'minimal', 'modern']);

/**
 * Render request schema
 */
export const RenderRequestSchema = z.object({
  sourceAssetId: z.uuid(),
  subtitles: z.array(SubtitleSegmentSchema),
  template: CaptionTemplateSchema,
  outputFormat: z.enum(['mp4', 'webm']).default('mp4'),
  quality: z.enum(['high', 'medium', 'low']).default('high'),
});

/**
 * Render response schema
 */
export const RenderResponseSchema = z.object({
  success: z.boolean(),
  outputUrl: z.string().optional(),
  fileSize: z.number().optional(),
  duration: z.number().optional(),
  error: z.string().optional(),
});

// Type exports
export type SubtitleSegment = z.infer<typeof SubtitleSegmentSchema>;
export type CaptionTemplate = z.infer<typeof CaptionTemplateSchema>;
export type RenderRequest = z.infer<typeof RenderRequestSchema>;
export type RenderResponse = z.infer<typeof RenderResponseSchema>;

// Legacy renderer admission. The receiver derives the owner from the service credential.
export interface OwnedMediaDescriptor {
  assetId: string;
  hash: string;
  mediaType: string;
  width?: number;
  height?: number;
  hasAudio?: boolean;
}
export interface OwnedVideoDescriptor extends OwnedMediaDescriptor {
  durationMs: number;
}
export interface LegacyRenderAdmission {
  compositionId: 'VideoWithSubtitles';
  webJobId: string;
  sourceAsset: OwnedVideoDescriptor;
  logoAsset?: OwnedMediaDescriptor;
  inputProps: {
    subtitles: RenderCaption[];
    template: RenderTemplate;
    language: string;
    aspectRatio: string;
    backgroundColor: string;
    durationInFrames: number;
    brandKit?: Omit<BrandKit, 'logoUrl'>;
  };
}
