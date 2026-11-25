import { it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportSnapshot } from '@workspace/render-contract';
import { HyperframesProjectAdapter } from './adapter';
it.skipIf((import.meta as ImportMeta & { env: { MODE: string } }).env.MODE !== 'native')(
  'strict-checks a static native title with no library or media',
  async () => {
    const workspace = await mkdtemp(join(tmpdir(), 'hf-static-'));
    try {
      const snapshot: ExportSnapshot = {
        revision: 'draft',
        ownerId: 'owner',
        dependencies: { assets: {}, libraries: {} },
        bundles: {},
        diagnostics: [],
        document: {
          id: 'plain',
          title: 'Título',
          engine: 'hyperframes',
          schemaVersion: 1,
          canvas: { width: 400, height: 300, fps: 30 },
          durationMs: 1000,
          styleRef: null,
          brandSnapshot: null,
          assetIds: [],
          globalAudio: [],
          scenes: [
            {
              id: 'first',
              durationMs: 1000,
              layers: [
                {
                  type: 'text',
                  id: 'title',
                  startMs: 0,
                  endMs: 1000,
                  endAnchor: 'fixed',
                  visible: true,
                  zIndex: 0,
                  text: 'Título',
                  box: { x: 20, y: 30, width: 360, height: 100 },
                },
              ],
            },
          ],
        },
      };
      const adapter = new HyperframesProjectAdapter();
      const p = await adapter.prepare(snapshot, workspace);
      const result = JSON.parse(await adapter.check(p, new AbortController().signal));
      expect(result.ok).toBe(true);
    } finally {
      await rm(workspace, { recursive: true, force: true });
    }
  },
  60000
);
