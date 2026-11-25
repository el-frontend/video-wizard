import { z } from 'zod';
import { ComponentManifestSchema, componentPath } from './component-contract';
import { ProjectCommandSchema } from './commands';
import { dictionary, EngineIdSchema, LibraryRefSchema, type JsonValue } from './primitives';

export const SourceFilesSchema = dictionary(z.string().min(1).max(65536)).refine((files) => {
  const entries = Object.entries(files);
  return (
    entries.length > 0 &&
    entries.length <= 32 &&
    entries.every(([name]) => name.length <= 180 && componentPath.test(name)) &&
    entries.reduce((n, [, s]) => n + s.length, 0) <= 131072
  );
}, 'Se requieren archivos TS/TSX locales dentro del límite de tamaño.');
const common = {
  requestId: z.uuid(),
  baseRevision: z.uuid(),
  commands: z.array(ProjectCommandSchema).min(1).max(100),
};
// Keep malformed but bounded manifests available to their owner for correction.
function boundedManifest(value: unknown): value is Record<string, JsonValue> {
  let nodes = 0,
    size = 0;
  function visit(item: unknown, depth: number): boolean {
    if (depth > 32 || ++nodes > 4096 || size > 65536) return false;
    if (item === null || typeof item === 'boolean') return true;
    if (typeof item === 'number') return Number.isFinite(item);
    if (typeof item === 'string') {
      size += item.length;
      return size <= 65536;
    }
    if (Array.isArray(item)) return item.length <= 1024 && item.every((v) => visit(v, depth + 1));
    if (
      !item ||
      typeof item !== 'object' ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(item))
    )
      return false;
    return Object.entries(item).every(([key, v]) => {
      size += key.length;
      return !['__proto__', 'constructor', 'prototype'].includes(key) && visit(v, depth + 1);
    });
  }
  if (!value || typeof value !== 'object' || Array.isArray(value) || !visit(value, 0)) return false;
  const m = value as Record<string, unknown>;
  return !(['dependencies', 'assetIds', 'exposedRoles'] as const).some(
    (key) => Array.isArray(m[key]) && m[key].length > (key === 'dependencies' ? 4 : 64)
  );
}
const componentDelivery = z.strictObject({
  ...common,
  kind: z.literal('component'),
  engine: EngineIdSchema.optional(),
  name: z.string().trim().min(1).max(128).optional(),
  previous: LibraryRefSchema.optional(),
  manifest: z.custom<Record<string, JsonValue>>(
    boundedManifest,
    'Manifiesto fuera de los límites de admisión.'
  ),
  files: SourceFilesSchema,
});
const storyboardDelivery = z.strictObject({
  ...common,
  kind: z.literal('storyboard'),
  engine: EngineIdSchema,
  manifest: z.null().optional(),
  files: z.strictObject({}).optional(),
});
export const ProposalDeliverySchema = z.discriminatedUnion('kind', [
  componentDelivery,
  storyboardDelivery,
]);
export const ProposalInputSchema = z.discriminatedUnion('kind', [
  componentDelivery.extend({ manifest: ComponentManifestSchema }),
  storyboardDelivery,
]);
export type ProposalDelivery = z.infer<typeof ProposalDeliverySchema>;
export type ProposalInput = z.infer<typeof ProposalInputSchema>;
export type Proposal = ProposalInput & { id: string; engine: z.infer<typeof EngineIdSchema> };
