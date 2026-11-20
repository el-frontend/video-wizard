import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRegistry, compositionsDirectory, hashBytes } from './registry-builder';
import { expect, it } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { libraryKey, validateSnapshot, type ExportSnapshot } from '@workspace/render-contract';
import { RemotionProjectAdapter } from './project-adapter';

const fixture = (): ExportSnapshot => ({
  ownerId: 'owner',
  revision: 'first',
  document: exampleProject(),
  dependencies: { assets: {}, libraries: {} },
  bundles: {},
  diagnostics: [],
});

it('blocks a missing resource and an entry for another engine', async () => {
  const snapshot = fixture();
  snapshot.dependencies.libraries['["card",1]'] = {
    id: 'card',
    version: 1,
    kind: 'component',
    name: 'Tarjeta',
    engine: 'hyperframes',
    assetIds: [],
    manifest: { version: 1, props: {} },
  };
  const diagnostics = await new RemotionProjectAdapter().validate(snapshot);
  expect(diagnostics.map((d) => d.code)).toEqual(
    expect.arrayContaining(['asset-missing', 'engine-mismatch'])
  );
});

it('flags oversized text and missing fonts by their actual pinned dependencies', () => {
  const snapshot = fixture();
  const layer = snapshot.document.scenes[1]!.layers[0]!;
  if (layer.type !== 'text') throw new Error('fixture');
  layer.text = 'muy largo '.repeat(2000);
  snapshot.dependencies.libraries['["estilo",2]'] = {
    kind: 'style',
    id: 'estilo',
    version: 2,
    name: 'Estilo',
    engines: ['remotion'],
    tokens: {},
    assetIds: ['font'],
    fonts: [{ assetId: 'font', family: 'Geist', weight: { min: 100, max: 900 } }],
  };
  expect(validateSnapshot(snapshot)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ code: 'text-overflow', severity: 'warning', layerId: 'bye' }),
      expect.objectContaining({ code: 'font-missing', severity: 'error' }),
    ])
  );
});

it('materializes the pinned bytes, keeps distinct versions and rejects foreign or modified code', async () => {
  const snapshot = fixture(),
    workspace = await mkdtemp(join(tmpdir(), 'studio-registry-'));
  const entry = {
    id: 'sub/\u{1F3AC}',
    version: 1,
    kind: 'component' as const,
    name: 'Subtítulo',
    assetIds: [],
    engine: 'remotion' as const,
    manifest: {
      version: 1 as const,
      props: {},
      builtin: { kind: 'remotion-caption' as const, preset: 'default' as const },
    },
  };
  const second = { ...entry, version: 2 };
  const bytes = await readFile(
    resolve(compositionsDirectory, '../studio-presets/v1/DefaultTemplate.tsx.txt')
  );
  for (const item of [entry, second]) {
    snapshot.dependencies.libraries[libraryKey(item)] = item;
    snapshot.bundles[libraryKey(item)] = {
      sha256: hashBytes(bytes),
      base64: bytes.toString('base64'),
    };
  }
  try {
    const first = await buildRegistry(snapshot, workspace);
    const code = await readFile(first.entry, 'utf8');
    expect(code).toContain(JSON.stringify(libraryKey(entry)));
    expect(code).toContain(JSON.stringify(libraryKey(second)));
    expect(
      await readFile(join(workspace, 'registry/templates', hashBytes(bytes) + '.tsx'))
    ).toEqual(bytes);
    expect((await buildRegistry(snapshot, workspace)).hash).toBe(first.hash);
    const other = Buffer.from('contenido distinto');
    snapshot.bundles[libraryKey(second)] = {
      sha256: hashBytes(other),
      base64: other.toString('base64'),
    };
    await expect(buildRegistry(snapshot, workspace)).rejects.toThrow('preset verificado');
    snapshot.dependencies.libraries[libraryKey(entry)] = {
      ...entry,
      engine: 'hyperframes',
      manifest: { version: 1, props: {} },
    };
    await expect(buildRegistry(snapshot, workspace)).rejects.toThrow('incompatible');
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
