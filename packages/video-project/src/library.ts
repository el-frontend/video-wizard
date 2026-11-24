import { ComponentManifestSchema, type ComponentManifest } from './component-contract';
import { z } from 'zod';
import { CanvasSchema, SceneSchema, GlobalAudioLayerSchema } from './schema';
import {
  type EngineId,
  dictionary,
  IdSchema,
  LibraryRefSchema,
  EngineIdSchema,
  JsonObjectSchema,
  MillisecondsSchema,
} from './primitives';
export * from './primitives';
export const LibraryKindSchema = z.enum(['component', 'template', 'style', 'brand']);
export type LibraryKind = z.infer<typeof LibraryKindSchema>;
export const AppearanceRoleSchema = z
  .string()
  .refine((role) =>
    role
      .split('.')
      .every(
        (key) =>
          /^[a-zA-Z0-9_-]+$/.test(key) && !['__proto__', 'constructor', 'prototype'].includes(key)
      )
  );
export const RemotionCaptionPresetSchema = z.enum([
  'default',
  'viral',
  'minimal',
  'modern',
  'highlight',
  'colorshift',
  'hormozi',
  'mrbeast',
  'mrbeastemoji',
]);

const property = z.strictObject({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'null']),
  required: z.boolean().optional(),
});
export const LibraryManifestSchema = z.strictObject({
  version: z.literal(1),
  props: dictionary(property),
  exposedRoles: z.array(AppearanceRoleSchema).optional(),
  builtin: z
    .discriminatedUnion('kind', [
      z.strictObject({ kind: z.literal('remotion-caption'), preset: RemotionCaptionPresetSchema }),
      z.strictObject({ kind: z.literal('hyperframes-caption'), preset: z.literal('default') }),
    ])
    .optional(),
});
export type LibraryManifest = z.infer<typeof LibraryManifestSchema> | ComponentManifest;
export function manifestFields(m: LibraryManifest): Record<string, z.infer<typeof property>> {
  if ('props' in m) return m.props;
  return Object.fromEntries(
    Object.entries(m.propsSchema.properties).map(([key, field]) => [
      key,
      { type: field.type, required: m.propsSchema.required?.includes(key) },
    ])
  );
}
export const StudioBrandRoleSchema = z.enum([
  'colors.accent',
  'colors.background',
  'colors.foreground',
  'colors.surface',
  'typography.display.fontFamily',
]);
export const StyleFamilySchema = z.strictObject({
  id: z.enum(['noticias-liquid-glass', 'noticias-elfrontend-web', 'noticias-modern-editorial']),
  version: z.literal(1),
});
const layerTarget = { sceneId: IdSchema, layerId: IdSchema };
export const TemplateSlotSchema = z.discriminatedUnion('field', [
  z.strictObject({ field: z.literal('text'), ...layerTarget }),
  z.strictObject({ field: z.literal('caption'), ...layerTarget, cueId: IdSchema }),
  z.strictObject({ field: z.enum(['headline', 'narration']), sceneId: IdSchema }),
  z.strictObject({ field: z.literal('prop'), ...layerTarget, key: IdSchema }),
  z.strictObject({ field: z.literal('asset'), sceneId: IdSchema.nullable(), layerId: IdSchema }),
]);
export const TemplateStructureSchema = z.strictObject({
  version: z.literal(1),
  canvas: CanvasSchema,
  scenes: z.array(SceneSchema).min(1),
  globalAudio: z.array(GlobalAudioLayerSchema),
  styleRef: LibraryRefSchema.nullable(),
  slots: dictionary(TemplateSlotSchema),
});
export type TemplateStructure = z.infer<typeof TemplateStructureSchema>;
export type TemplateSlot = z.infer<typeof TemplateSlotSchema>;
export type StyleFamily = z.infer<typeof StyleFamilySchema>;
const entry = { ...LibraryRefSchema.shape, name: IdSchema, assetIds: z.array(IdSchema) };
const implementation = { engine: EngineIdSchema, manifest: LibraryManifestSchema };
const fontWeight = z.int().min(1).max(1000);
export const FontBindingSchema = z.strictObject({
  assetId: IdSchema,
  family: IdSchema,
  weight: z.strictObject({ min: fontWeight, max: fontWeight }).refine(({ min, max }) => min <= max),
});
const fonts = z.array(FontBindingSchema).optional();
export const LibraryEntrySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({
      ...entry,
      kind: z.literal('component'),
      ...implementation,
      manifest: z.union([LibraryManifestSchema, ComponentManifestSchema]),
    }),
    z.strictObject({
      ...entry,
      kind: z.literal('template'),
      ...implementation,
      structure: TemplateStructureSchema.optional(),
    }),
    z.strictObject({
      ...entry,
      kind: z.literal('style'),
      tokens: JsonObjectSchema,
      family: StyleFamilySchema.optional(),
      frameMarkdown: z.string().optional(),
      engines: z.array(EngineIdSchema).optional(),
      exposedRoles: z.array(AppearanceRoleSchema).optional(),
      fonts,
    }),
    z.strictObject({
      ...entry,
      kind: z.literal('brand'),
      values: JsonObjectSchema,
      fonts,
      tone: z.string().max(4000).optional(),
      logos: z.array(z.strictObject({ name: IdSchema, assetId: IdSchema })).optional(),
    }),
  ])
  .superRefine((value, ctx) => {
    if (
      value.kind === 'component' &&
      'schemaVersion' in value.manifest &&
      (value.engine !== value.manifest.engine ||
        JSON.stringify(value.assetIds) !== JSON.stringify(value.manifest.assetIds))
    )
      ctx.addIssue({
        code: 'custom',
        message: 'Los recursos y el motor deben coincidir con el manifiesto.',
      });
    if (
      'manifest' in value &&
      value.manifest.builtin &&
      (value.kind !== 'component' || value.manifest.builtin.kind !== value.engine + '-caption')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['manifest', 'builtin'],
        message: 'El componente y su fábrica deben usar el mismo motor.',
      });
    }
    if (
      value.kind === 'brand' &&
      value.logos?.some((logo) => !value.assetIds.includes(logo.assetId))
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['logos'],
        message: 'Registra los recursos de los logos.',
      });
    }
    if ('fonts' in value) {
      const ids = new Set(value.assetIds);
      value.fonts?.forEach((font, index) => {
        if (!ids.has(font.assetId)) {
          ctx.addIssue({
            code: 'custom',
            path: ['fonts', index, 'assetId'],
            message: 'Expected a registered asset ID.',
          });
        }
      });
    }
  });
export type LibraryEntry = z.infer<typeof LibraryEntrySchema>;

export type EntryOf<K extends LibraryKind> = Extract<LibraryEntry, { kind: K }>;
export function styleFamily(entry: EntryOf<'style'>): StyleFamily | undefined {
  if (entry.family) return entry.family;
  if (entry.version !== 2) return undefined;
  const legacy = StyleFamilySchema.safeParse({ id: entry.id, version: 1 });
  return legacy.success ? legacy.data : undefined;
}
export function supportsStudioEngine(entry: LibraryEntry, engine: EngineId) {
  if (entry.kind === 'brand') return true;
  if (entry.kind === 'style') return !!styleFamily(entry) && !!entry.engines?.includes(engine);
  if (entry.engine !== engine) return false;
  if (entry.kind === 'component')
    return (
      'schemaVersion' in entry.manifest ||
      (entry.manifest.builtin?.kind === engine + '-caption' &&
        !Object.keys(entry.manifest.props).length)
    );
  return !!entry.structure;
}
export const AssetRecordSchema = z.strictObject({
  id: IdSchema,
  ownerId: IdSchema,
  hash: z.string().regex(/^[a-f0-9]{64}$/),
  name: IdSchema,
  mediaType: IdSchema,
  locator: z.string().regex(/^[a-zA-Z0-9_-][a-zA-Z0-9._-]*(\/[a-zA-Z0-9_-][a-zA-Z0-9._-]*)*$/),
  durationMs: MillisecondsSchema.optional(),
  width: z.int().positive().optional(),
  height: z.int().positive().optional(),
  hasAudio: z.boolean().optional(),
});
export type AssetRecord = z.infer<typeof AssetRecordSchema>;
