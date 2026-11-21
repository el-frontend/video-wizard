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
  kind: z.enum(['feedback', 'voice', 'component', 'storyboard']),
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
});
export type CompanionRequest = z.infer<typeof CompanionRequestSchema>;

export interface PreviewHandle {
  play(): void;
  pause(): void;
  seek(timeMs: number, boundary?: 'at-or-after'): void;
  getTimeMs(): number;
  /** Cue seeks acknowledge their exact requested start along with the sampled time. */
  subscribe(listener: (timeMs: number, acknowledgedCueStartMs?: number) => void): () => void;
}
