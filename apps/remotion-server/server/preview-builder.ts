import { build } from 'esbuild';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ExportSnapshot } from '@workspace/render-contract';
import { buildRegistry, serverModules } from './registry-builder.js';
import { browserInput } from './project-adapter.js';

export async function buildPreview(snapshot: ExportSnapshot, workspace: string) {
  const { entry, hash } = await buildRegistry(snapshot, workspace);
  const player = fileURLToPath(new URL('./preview-player.tsx', import.meta.url));
  const source = [
    'import { registry } from ' + JSON.stringify(entry) + ';',
    'import { mountPreview } from ' + JSON.stringify(player) + ';',
    'mountPreview({...JSON.parse(' +
      JSON.stringify(JSON.stringify(browserInput(snapshot))) +
      '),registry});',
  ].join('\n');
  await build({
    stdin: { contents: source, resolveDir: workspace },
    outfile: join(workspace, 'player.js'),
    bundle: true,
    platform: 'browser',
    format: 'iife',
    jsx: 'automatic',
    minify: true,
    nodePaths: [serverModules],
    define: { 'process.env.NODE_ENV': '"production"' },
    legalComments: 'none',
  });
  return { hash };
}
