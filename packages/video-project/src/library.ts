import { z } from 'zod';

export const IdSchema = z.string().regex(/\S/);
export const MillisecondsSchema = z.int().nonnegative();
export const EngineIdSchema = z.enum(['remotion', 'hyperframes']);
export type EngineId = z.infer<typeof EngineIdSchema>;
export type JsonValue = z.infer<ReturnType<typeof z.json>>;
// Validate entries individually so every JSON key survives deserialization.
function dictionary<T extends z.ZodType>(value: T) {
  return z
    .preprocess(
      (input) => {
        if (input === null || typeof input !== 'object') return null;
        const prototype = Object.getPrototypeOf(input);
        return prototype === null || prototype === Object.prototype ? Object.entries(input) : null;
      },
      z.array(z.tuple([z.string(), value]))
    )
    .transform((entries): Record<string, z.output<T>> => Object.fromEntries(entries));
}
export const JsonValueSchema: z.ZodType<JsonValue> = z.lazy(() =>
  z.union([
    z.string(),
    z.number(),
    z.boolean(),
    z.null(),
    z.array(JsonValueSchema),
    JsonObjectSchema,
  ])
);
export const JsonObjectSchema = dictionary(JsonValueSchema);

// A library ID must round-trip as a PostgreSQL text key and one encoded URL segment.
export const LibraryIdSchema = IdSchema.refine(
  (id) => id !== '.' && id !== '..' && !id.includes('\0') && !/[\uD800-\uDFFF]/u.test(id)
);
export const LibraryRefSchema = z.strictObject({
  id: LibraryIdSchema,
  version: z.int().positive(),
});
export type LibraryRef = z.infer<typeof LibraryRefSchema>;
export const BrandSnapshotSchema = z.strictObject({
  ref: LibraryRefSchema,
  values: JsonObjectSchema,
});
export type BrandSnapshot = z.infer<typeof BrandSnapshotSchema>;

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
    .strictObject({
      kind: z.literal('remotion-caption'),
      preset: RemotionCaptionPresetSchema,
    })
    .optional(),
});
export type LibraryManifest = z.infer<typeof LibraryManifestSchema>;
const entry = { ...LibraryRefSchema.shape, name: IdSchema, assetIds: z.array(IdSchema) };
const implementation = { engine: EngineIdSchema, manifest: LibraryManifestSchema };
const fontWeight = z.int().min(1).max(1000);
const fontBinding = z.strictObject({
  assetId: IdSchema,
  family: IdSchema,
  weight: z.strictObject({ min: fontWeight, max: fontWeight }).refine(({ min, max }) => min <= max),
});
const fonts = z.array(fontBinding).optional();
export const LibraryEntrySchema = z
  .discriminatedUnion('kind', [
    z.strictObject({ ...entry, kind: z.literal('component'), ...implementation }),
    z.strictObject({ ...entry, kind: z.literal('template'), ...implementation }),
    z.strictObject({
      ...entry,
      kind: z.literal('style'),
      tokens: JsonObjectSchema,
      frameMarkdown: z.string().optional(),
      engines: z.array(EngineIdSchema).optional(),
      exposedRoles: z.array(AppearanceRoleSchema).optional(),
      fonts,
    }),
    z.strictObject({ ...entry, kind: z.literal('brand'), values: JsonObjectSchema, fonts }),
  ])
  .superRefine((value, ctx) => {
    if (
      'manifest' in value &&
      value.manifest.builtin &&
      (value.kind !== 'component' || value.engine !== 'remotion')
    ) {
      ctx.addIssue({
        code: 'custom',
        path: ['manifest', 'builtin'],
        message: 'Expected a Remotion component.',
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
