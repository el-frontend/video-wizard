import { z } from 'zod';
import { ComponentManifestSchema, componentPath } from './component-contract';
import { ProjectCommandSchema } from './commands';
import { dictionary, EngineIdSchema, LibraryRefSchema } from './primitives';

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
export const ProposalInputSchema = z.discriminatedUnion('kind', [
  z.strictObject({
    ...common,
    kind: z.literal('component'),
    engine: EngineIdSchema.optional(),
    name: z.string().trim().min(1).max(128).optional(),
    previous: LibraryRefSchema.optional(),
    manifest: ComponentManifestSchema,
    files: SourceFilesSchema,
  }),
  z.strictObject({
    ...common,
    kind: z.literal('storyboard'),
    engine: EngineIdSchema,
    manifest: z.null().optional(),
    files: z.strictObject({}).optional(),
  }),
]);
export type ProposalInput = z.infer<typeof ProposalInputSchema>;
export type Proposal = ProposalInput & { id: string; engine: z.infer<typeof EngineIdSchema> };
