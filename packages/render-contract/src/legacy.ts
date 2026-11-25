import { z } from 'zod';
const measured = z.strictObject({
  assetId: z.uuid(),
  hash: z.string().regex(/^[0-9a-f]{64}$/),
  mediaType: z.string(),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  hasAudio: z.boolean().optional(),
});
const color = z.string().regex(/^#[0-9A-Fa-f]{6}$/);
const timing = { start: z.number().nonnegative(), end: z.number().nonnegative() };
export const legacyAdmission = z
  .strictObject({
    compositionId: z.literal('VideoWithSubtitles'),
    webJobId: z.uuid(),
    sourceAsset: measured.extend({
      mediaType: z.string().regex(/^video\/[a-z0-9.+-]+$/),
      durationMs: z.int().positive(),
    }),
    logoAsset: measured
      .extend({
        mediaType: z
          .string()
          .refine((type) => ['image/png', 'image/jpeg', 'image/webp'].includes(type)),
      })
      .optional(),
    inputProps: z.strictObject({
      subtitles: z.array(
        z.strictObject({
          id: z.number(),
          ...timing,
          text: z.string(),
          words: z.array(z.strictObject({ ...timing, word: z.string() })).optional(),
        })
      ),
      template: z.enum([
        'default',
        'viral',
        'minimal',
        'modern',
        'highlight',
        'colorshift',
        'hormozi',
        'mrbeast',
        'mrbeastemoji',
      ]),
      language: z.string().max(32),
      aspectRatio: z.enum(['9:16', '4:5', '16:9', '1:1']),
      durationInFrames: z.int().positive(),
      backgroundColor: color,
      brandKit: z
        .strictObject({
          logoPosition: z.enum(['top-left', 'top-right', 'bottom-left', 'bottom-right']).optional(),
          logoScale: z.number().min(0.1).max(2).optional(),
          primaryColor: color.optional(),
          secondaryColor: color.optional(),
          textColor: color.optional(),
          backgroundColor: color.optional(),
          fontFamily: z.string().optional(),
        })
        .optional(),
    }),
  })
  .refine(
    (a) => a.inputProps.durationInFrames === Math.ceil((a.sourceAsset.durationMs * 30) / 1000)
  );
export type LegacyRenderAdmission = z.infer<typeof legacyAdmission>;
export type OwnedMediaDescriptor = z.infer<typeof measured>;
export type OwnedVideoDescriptor = LegacyRenderAdmission['sourceAsset'];
