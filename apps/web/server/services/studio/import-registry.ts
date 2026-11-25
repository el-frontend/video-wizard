import { readFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';

export const sourceIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/);
export const motionSourceSchema = z.strictObject({
  ownerId: z.uuid(),
  sourceId: sourceIdSchema,
  root: z.string().refine(isAbsolute),
  slug: z.string().regex(/^[a-z0-9][a-z0-9_-]{0,119}$/),
  fps: z.number().positive().max(240),
});
export type MotionSource = z.infer<typeof motionSourceSchema>;
export async function registeredSources(): Promise<MotionSource[]> {
  const config = process.env.STUDIO_IMPORT_SOURCES;
  if (!config) return [];
  try {
    return z.array(motionSourceSchema).parse(JSON.parse(await readFile(config, 'utf8')));
  } catch {
    throw new ValidationError('No se pudo leer el registro de fuentes del estudio.');
  }
}
