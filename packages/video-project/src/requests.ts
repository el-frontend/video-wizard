import { CaptionInputSchema } from './schema';
import { z } from 'zod';
import { EngineIdSchema, IdSchema, MillisecondsSchema } from './library';

export const AssistantProviderSchema = z.enum(['codex', 'claude']);
export type AssistantProvider = z.infer<typeof AssistantProviderSchema>;
export const EditorSelectionSchema = z.strictObject({
  sceneId: IdSchema.nullable(),
  layerId: IdSchema.nullable(),
  captionId: IdSchema.nullable(),
  timeMs: MillisecondsSchema,
});
export type EditorSelection = z.infer<typeof EditorSelectionSchema>;
export const CompanionRequestSchema = z.strictObject({
  id: IdSchema,
  projectId: IdSchema,
  baseRevision: IdSchema,
  provider: AssistantProviderSchema,
  bindingId: IdSchema,
  engine: EngineIdSchema,
  selection: EditorSelectionSchema,
  kind: z.enum(['feedback', 'voice', 'component', 'storyboard', 'shorts']),
  message: z.string(),
  status: z.enum([
    'created',
    'sending',
    'sent',
    'waiting',
    'running',
    'completed',
    'failed',
    'delivery-unknown',
    'cancelled',
  ]),
  idempotencyKey: IdSchema,
  sourceAssetId: z.uuid().optional(),
  note: z.string().optional(),
  voice: z
    .strictObject({
      durationMs: z.int().positive(),
      provider: z.string(),
      captionSource: z.string(),
    })
    .optional(),
  delivery: z
    .strictObject({
      status: z.enum(['sent', 'waiting', 'delivery-unknown', 'failed']),
      id: z.string().optional(),
    })
    .optional(),
  resultRevision: z.uuid().optional(),
  proposalId: z.uuid().optional(),
  assetId: z.uuid().optional(),
  ranges: z
    .array(z.strictObject({ startMs: MillisecondsSchema, endMs: MillisecondsSchema }))
    .optional(),
});
export type CompanionRequest = z.infer<typeof CompanionRequestSchema>;

export const CompanionRequestInputSchema = CompanionRequestSchema.pick({
  provider: true,
  bindingId: true,
  baseRevision: true,
  engine: true,
  kind: true,
  selection: true,
  message: true,
  idempotencyKey: true,
  sourceAssetId: true,
}).extend({
  sourceCaptions: z.array(CaptionInputSchema).max(2000).optional(),
  bindingId: z.uuid(),
  baseRevision: z.uuid(),
  idempotencyKey: z.string().min(1).max(160),
  message: z.string().trim().min(1).max(6000),
});
export type CompanionRequestInput = z.infer<typeof CompanionRequestInputSchema>;
export interface PreviewHandle {
  play(): void;
  pause(): void;
  seek(timeMs: number, boundary?: 'at-or-after'): void;
  getTimeMs(): number;
  /** Cue seeks acknowledge their exact requested start along with the sampled time. */
  subscribe(listener: (timeMs: number, acknowledgedCueStartMs?: number) => void): () => void;
}
