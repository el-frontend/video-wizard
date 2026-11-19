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

export const LibraryRefSchema = z.strictObject({ id: IdSchema, version: z.int().positive() });
export type LibraryRef = z.infer<typeof LibraryRefSchema>;
export const BrandSnapshotSchema = z.strictObject({
  ref: LibraryRefSchema,
  values: JsonObjectSchema,
});
export type BrandSnapshot = z.infer<typeof BrandSnapshotSchema>;

const property = z.strictObject({
  type: z.enum(['string', 'number', 'boolean', 'object', 'array', 'null']),
  required: z.boolean().optional(),
});
export const LibraryManifestSchema = z.strictObject({
  version: z.literal(1),
  props: dictionary(property),
});
export type LibraryManifest = z.infer<typeof LibraryManifestSchema>;
const entry = { ...LibraryRefSchema.shape, name: IdSchema, assetIds: z.array(IdSchema) };
const implementation = { engine: EngineIdSchema, manifest: LibraryManifestSchema };
export const LibraryEntrySchema = z.discriminatedUnion('kind', [
  z.strictObject({ ...entry, kind: z.literal('component'), ...implementation }),
  z.strictObject({ ...entry, kind: z.literal('template'), ...implementation }),
  z.strictObject({
    ...entry,
    kind: z.literal('style'),
    tokens: JsonObjectSchema,
    frameMarkdown: z.string().optional(),
  }),
  z.strictObject({ ...entry, kind: z.literal('brand'), values: JsonObjectSchema }),
]);
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
