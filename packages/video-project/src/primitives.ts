import { z } from 'zod';

export const IdSchema = z.string().regex(/\S/);
export const MillisecondsSchema = z.int().nonnegative();
export const EngineIdSchema = z.enum(['remotion', 'hyperframes']);
export type EngineId = z.infer<typeof EngineIdSchema>;
export type JsonValue = z.infer<ReturnType<typeof z.json>>;
// Validate entries individually so every JSON key survives deserialization.
export function dictionary<T extends z.ZodType>(value: T) {
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
