import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { nativeCaptionSource, remotionCaptionPresets } from '@workspace/render-contract';
import type { LibraryManifest } from '@workspace/video-project';

// Local Studio and the seed CLI use the installed workspace's immutable preset archive.
export function packagesDirectory() {
  let root = resolve(process.cwd());
  while (!existsSync(join(root, 'pnpm-workspace.yaml'))) {
    const parent = dirname(root);
    if (parent === root) throw new Error('No se encontró el catálogo instalado.');
    root = parent;
  }
  return join(root, 'packages');
}
export function captionSource(preset: NonNullable<LibraryManifest['builtin']>['preset']) {
  return readFile(
    join(
      packagesDirectory(),
      'remotion-compositions',
      'studio-presets',
      'v1',
      remotionCaptionPresets[preset].source + '.tsx.txt'
    )
  );
}

export function builtinSource(builtin: NonNullable<LibraryManifest['builtin']>) {
  return builtin.kind === 'hyperframes-caption'
    ? Promise.resolve(Buffer.from(nativeCaptionSource))
    : captionSource(builtin.preset);
}
