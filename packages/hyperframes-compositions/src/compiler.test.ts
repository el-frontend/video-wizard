import { describe, expect, it } from 'vitest';
import { mkdtemp, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { ExportSnapshot } from '@workspace/render-contract';
import { compileProject } from './compiler';

const snapshot: ExportSnapshot = {
  ownerId: '0d62e643-b900-4546-b629-1c60dd827537',
  revision: 'revision',
  bundles: {},
  diagnostics: [],
  dependencies: { assets: {}, libraries: {} },
  document: {
    schemaVersion: 1,
    id: 'project',
    title: 'Prueba',
    engine: 'hyperframes',
    canvas: { fps: 30, width: 480, height: 320 },
    styleRef: null,
    brandSnapshot: null,
    assetIds: [],
    durationMs: 1200,
    globalAudio: [],
    scenes: [
      {
        id: 'one',
        durationMs: 1200,
        layers: [
          {
            id: 'captions',
            type: 'captions',
            startMs: 167,
            endMs: 1200,
            endAnchor: 'fixed',
            visible: true,
            zIndex: 1,
            box: { x: 20, y: 100, width: 430, height: 130 },
            cues: [
              { id: 'before', startMs: 0, endMs: 33, text: 'Anterior' },
              { id: 'exact', startMs: 33, endMs: 34, text: 'Preciso' },
              { id: 'last', startMs: 34, endMs: 1020, text: '<Final>' },
            ],
          },
        ],
      },
    ],
  },
};
describe('native compiler', () => {
  it('uses one path-independent native timeline, editable captions and local scripts', async () => {
    const dirs = await Promise.all([1, 2].map(() => mkdtemp(join(tmpdir(), 'hf-unit-'))));
    const [first, second] = await Promise.all(dirs.map((dir) => compileProject(snapshot, dir)));
    expect(first!.manifestHash).toBe(second!.manifestHash);
    const html = await readFile(first!.entry, 'utf8');
    expect(html).toContain('data-composition-id=');
    expect(html).toContain('Preciso');
    expect(html).toContain('&lt;Final&gt;');
    expect(html).not.toMatch(/fetch\(|https?:\/\/|Date\.now|Math\.random/);
    expect(html).toBe(await readFile(second!.entry, 'utf8'));
  });
});

it('assigns the picture to its first scene frame and keeps embedded sound on the document clock', async () => {
  const { nativeDocument } = await import('./runtime');
  const fixture = structuredClone(snapshot);
  const video = {
    id: 'picture',
    type: 'video' as const,
    assetId: 'crop',
    fit: 'cover' as const,
    focalPoint: { x: 0.5, y: 0.5 },
    sourceInMs: 250,
    volume: 0.5,
    startMs: 0,
    endMs: 183,
    endAnchor: 'fixed' as const,
    visible: true,
    zIndex: 0,
    box: { x: 0, y: 0, width: 50, height: 50 },
  };
  fixture.dependencies.assets.crop = {
    id: 'crop',
    name: 'crop',
    hash: 'a'.repeat(64),
    mediaType: 'video/mp4',
    url: 'media/crop',
    hasAudio: true,
  };
  fixture.document.scenes = [
    { id: 'first', durationMs: 1017, layers: [] },
    { id: 'second', durationMs: 183, layers: [video] },
  ];
  const { html } = nativeDocument(
    fixture,
    new Map([['picture', { src: 'media/crop', sourceInMs: 250, volume: 0.5 }]])
  );
  expect(html).toMatch(/<video [^>]*data-start="1"[^>]*data-media-start="0.25"[^>]*muted/);
  expect(html).toMatch(/<audio [^>]*data-start="1.017"[^>]*data-media-start="0.25"/);
});
