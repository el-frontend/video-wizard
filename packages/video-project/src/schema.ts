import { z } from 'zod';
import {
  BrandSnapshotSchema,
  EngineIdSchema,
  IdSchema,
  JsonObjectSchema,
  LibraryRefSchema,
  MillisecondsSchema,
} from './primitives';
import { projectDurationMs } from './time';

const range = { startMs: MillisecondsSchema, endMs: MillisecondsSchema };
function nonemptyRange(value: { startMs: number; endMs: number }) {
  return value.startMs < value.endMs;
}
const rangeIssue = { message: 'El final debe ser posterior al inicio', path: ['endMs'] };
export const CaptionWordSchema = z
  .strictObject({ ...range, text: z.string() })
  .refine(nonemptyRange, rangeIssue);
export const CaptionCueSchema = z
  .strictObject({
    ...range,
    id: IdSchema,
    text: z.string(),
    words: z.array(CaptionWordSchema).optional(),
  })
  .refine(nonemptyRange, rangeIssue);
// New caption input requires usable alignment. Historical drafts keep their original schema.
export const CaptionInputSchema = CaptionCueSchema.refine((cue) => !!cue.text.trim(), {
  message: 'Escribe texto para el subtítulo.',
}).refine(
  (cue) => !cue.words?.some((word) => !word.text.trim() || word.endMs > cue.endMs - cue.startMs),
  {
    message: 'Cada palabra necesita texto y un intervalo dentro del subtítulo.',
  }
);
export type CaptionCue = z.infer<typeof CaptionCueSchema>;
export type CaptionWord = z.infer<typeof CaptionWordSchema>;

export const BoxSchema = z.strictObject({
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
});
export const FocalPointSchema = z.strictObject({
  x: z.number().min(0).max(1),
  y: z.number().min(0).max(1),
});
export const TakeSchema = z.strictObject({
  durationMs: z.int().positive(),
  provider: IdSchema,
  spokenText: z.string(),
  stale: z.boolean(),
});
const base = {
  ...range,
  id: IdSchema,
  endAnchor: z.enum(['fixed', 'scene-end']),
  visible: z.boolean(),
  zIndex: z.int(),
  overrides: JsonObjectSchema.optional(),
};
const visual = { ...base, box: BoxSchema };
const media = {
  assetId: IdSchema,
  sourceInMs: MillisecondsSchema,
  volume: z.number().nonnegative(),
};
const audio = { ...base, ...media, type: z.literal('audio'), take: TakeSchema.optional() };
export const AudioLayerSchema = z.strictObject(audio).refine(nonemptyRange, rangeIssue);
export const GlobalAudioLayerSchema = z
  .strictObject({ ...audio, endAnchor: z.literal('fixed') })
  .refine(nonemptyRange, rangeIssue);
export type AudioLayer = z.infer<typeof AudioLayerSchema>;
export const PlaybackVariantSchema = z
  .strictObject({
    kind: z.literal('processed-crop'),
    assetId: IdSchema,
    jobId: z.uuid(),
    sourceStartMs: MillisecondsSchema,
    sourceEndMs: MillisecondsSchema,
  })
  .refine((v) => v.sourceStartMs < v.sourceEndMs);
export type PlaybackVariant = z.infer<typeof PlaybackVariantSchema>;
export const LayerSchema = z
  .discriminatedUnion('type', [
    z.strictObject(audio),
    z.strictObject({
      ...visual,
      ...media,
      type: z.literal('video'),
      fit: z.enum(['cover', 'contain']),
      focalPoint: FocalPointSchema,
      playbackVariant: PlaybackVariantSchema.optional(),
    }),
    z.strictObject({ ...visual, type: z.literal('image'), assetId: IdSchema }),
    z.strictObject({ ...visual, type: z.literal('text'), text: z.string() }),
    z.strictObject({
      ...visual,
      type: z.literal('component'),
      componentRef: LibraryRefSchema,
      props: JsonObjectSchema,
    }),
    z.strictObject({
      ...visual,
      type: z.literal('captions'),
      sourceAudioLayerId: IdSchema.optional(),
      templateRef: LibraryRefSchema.optional(),
      cues: z.array(CaptionCueSchema),
    }),
  ])
  .refine(nonemptyRange, rangeIssue);
export type Layer = z.infer<typeof LayerSchema>;

export const SceneSchema = z.strictObject({
  id: IdSchema,
  durationMs: z.int().positive(),
  layers: z.array(LayerSchema),
  templateRef: LibraryRefSchema.optional(),
  editorial: z
    .strictObject({
      headline: z.string().optional(),
      narration: z.string().optional(),
      content: JsonObjectSchema.optional(),
    })
    .optional(),
});
export type Scene = z.infer<typeof SceneSchema>;

export const CanvasSchema = z.strictObject({
  width: z.int().positive(),
  height: z.int().positive(),
  fps: z.number().positive(),
});

export const ProjectDraftSchema = z
  .strictObject({
    schemaVersion: z.literal(1),
    id: IdSchema,
    title: IdSchema,
    engine: EngineIdSchema,
    canvas: CanvasSchema,
    durationMs: MillisecondsSchema,
    scenes: z.array(SceneSchema),
    globalAudio: z.array(GlobalAudioLayerSchema),
    assetIds: z.array(IdSchema),
    styleRef: LibraryRefSchema.nullable(),
    brandSnapshot: BrandSnapshotSchema.nullable(),
  })
  .superRefine((project, ctx) => {
    if (project.durationMs !== projectDurationMs(project)) {
      ctx.addIssue({
        code: 'custom',
        path: ['durationMs'],
        message: 'La duración no coincide con la secuencia y las pistas globales',
      });
    }
    const sceneIds = new Set<string>(),
      layerIds = new Set<string>();
    function unique(ids: Set<string>, id: string, path: (string | number)[]) {
      if (ids.has(id))
        ctx.addIssue({ code: 'custom', path, message: 'Identificador duplicado: ' + id });
      ids.add(id);
    }
    project.scenes.forEach((scene, i) => {
      unique(sceneIds, scene.id, ['scenes', i, 'id']);
      scene.layers.forEach((layer, j) => {
        const path = ['scenes', i, 'layers', j];
        unique(layerIds, layer.id, [...path, 'id']);
        if (layer.type === 'captions') {
          const cueIds = new Set<string>();
          layer.cues.forEach((cue, k) => unique(cueIds, cue.id, [...path, 'cues', k, 'id']));
        }
      });
    });
    project.globalAudio.forEach((layer, i) => unique(layerIds, layer.id, ['globalAudio', i, 'id']));
    const assetIds = new Set<string>();
    project.assetIds.forEach((id, i) => unique(assetIds, id, ['assetIds', i]));
  });
export type ProjectDraft = z.infer<typeof ProjectDraftSchema>;
export const DiagnosticSchema = z.strictObject({
  severity: z.enum(['error', 'warning']),
  code: IdSchema,
  message: IdSchema,
  sceneId: IdSchema.optional(),
  layerId: IdSchema.optional(),
});
export type Diagnostic = z.infer<typeof DiagnosticSchema>;

export const ImportKindSchema = z.enum(['motion-studio', 'legacy-job']);
export const ImportSlotSchema = z.strictObject({
  id: IdSchema,
  kind: z.enum(['audio', 'style', 'captions', 'video']),
  label: IdSchema,
  sceneId: IdSchema.optional(),
  startMs: MillisecondsSchema.default(0),
  inactiveTake: z.boolean().optional(),
  spokenText: z.string().optional(),
  resolution: z.enum(['pending', 'replaced', 'omitted']).default('pending'),
});
export type ImportSlot = z.infer<typeof ImportSlotSchema>;
export const ImportContextSchema = z.strictObject({
  version: z.literal(1),
  kind: ImportKindSchema,
  sourceId: IdSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  mode: z.enum(['editable', 'original']),
  originalAssetId: IdSchema.optional(),
  narration: z
    .strictObject({
      playback: z.enum(['master', 'scenes']),
      masterAssetId: IdSchema.optional(),
      takes: z.array(
        z.strictObject({
          sceneId: IdSchema,
          assetId: IdSchema,
          startMs: MillisecondsSchema,
          durationMs: MillisecondsSchema,
          spokenText: z.string().optional(),
          stale: z.boolean(),
        })
      ),
    })
    .optional(),
  diagnostics: z.array(DiagnosticSchema),
  slots: z.array(ImportSlotSchema),
});
export type ImportContext = z.infer<typeof ImportContextSchema>;
export function importDiagnostics(context?: ImportContext): Diagnostic[] {
  if (!context) return [];
  return [
    ...context.diagnostics,
    ...(context.mode === 'original'
      ? [
          {
            severity: 'error' as const,
            code: 'import-original',
            message: 'El original carece de un modelo editable.',
          },
        ]
      : []),
    ...context.slots
      .filter((slot) => slot.resolution === 'pending')
      .map((slot) => ({
        severity: 'error' as const,
        code: 'import-slot',
        message: slot.label,
        sceneId: slot.sceneId,
      })),
  ];
}
export const ProjectRecordSchema = z.strictObject({
  ownerId: IdSchema,
  revision: IdSchema,
  document: ProjectDraftSchema,
  importContext: ImportContextSchema.optional(),
  updatedAt: z.iso.datetime({ offset: true }),
});
export type ProjectRecord = z.infer<typeof ProjectRecordSchema>;
export function parseProject(value: unknown): ProjectDraft {
  return ProjectDraftSchema.parse(value);
}
