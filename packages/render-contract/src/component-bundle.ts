import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';
import { z } from 'zod';
import {
  ComponentManifestSchema,
  type ComponentManifest,
  type ComponentSource,
} from '@workspace/video-project';

export const digest = (value: string | Uint8Array) =>
  createHash('sha256').update(value).digest('hex');
export function componentSourceHash({ manifest, files }: ComponentSource) {
  return digest(
    JSON.stringify([manifest, Object.entries(files).sort(([a], [b]) => a.localeCompare(b, 'en'))])
  );
}
export const hostVersions = {
  remotion: '4.0.405/react-19.2.3',
  hyperframes: '0.8.173/gsap-3.14.2',
} as const;
const sha = z.string().regex(/^[0-9a-f]{64}$/);
export const SealedModuleSchema = z.strictObject({
  abi: z.literal(1),
  host: z.string(),
  manifest: ComponentManifestSchema,
  sourceHash: sha,
  moduleHash: sha,
  module: z.string().max(300000),
});
export type SealedModule = z.infer<typeof SealedModuleSchema>;
export function verifyModule(bytes: Uint8Array, manifest: ComponentManifest, bundleHash: string) {
  if (digest(bytes) !== bundleHash) throw Error('El hash del bundle no coincide.');
  const sealed = SealedModuleSchema.parse(JSON.parse(Buffer.from(bytes).toString()));
  if (
    sealed.host !== hostVersions[manifest.engine] ||
    !isDeepStrictEqual(sealed.manifest, manifest) ||
    digest(sealed.module) !== sealed.moduleHash
  )
    throw Error('El módulo no coincide con la versión revisada.');
  return sealed;
}
