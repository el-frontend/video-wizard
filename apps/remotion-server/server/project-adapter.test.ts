import { randomUUID } from 'node:crypto';
import { createReadStream, watch } from 'node:fs';
import { assetPath } from '@workspace/render-contract/storage';
import { mkdir, mkdtemp, readFile, rm, stat, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { buildRegistry, compositionsDirectory, hashBytes } from './registry-builder';
import { expect, it, vi } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { libraryKey, validateSnapshot, type ExportSnapshot } from '@workspace/render-contract';
import { fileHash, stageMedia, RemotionProjectAdapter } from './project-adapter';

vi.mock('node:fs', async (importOriginal) => {
  const fs = await importOriginal<typeof import('node:fs')>();
  return { ...fs, createReadStream: vi.fn(fs.createReadStream) };
});

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

it('aborts artifact hashing while its file is being read', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'studio-hash-')),
    path = join(dir, 'large.mp4');
  try {
    await writeFile(path, '');
    await truncate(path, 32 * 1024 * 1024);
    const controller = new AbortController();
    const fs = await vi.importActual<typeof import('node:fs')>('node:fs');
    let bytesAtAbort = 0;
    vi.mocked(createReadStream).mockImplementationOnce((...args) => {
      const stream = fs.createReadStream(...args);
      stream.once('data', () => {
        bytesAtAbort = stream.bytesRead;
        controller.abort();
      });
      return stream;
    });
    await expect(fileHash(path, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(bytesAtAbort).toBeGreaterThan(0);
    expect(bytesAtAbort).toBeLessThan(32 * 1024 * 1024);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('interrupts a media copy before the entire original reaches a superseded workspace', async () => {
  const root = await mkdtemp(join(tmpdir(), 'studio-source-'));
  const target = join(root, 'preview');
  const s = fixture(),
    hash = 'f'.repeat(64),
    size = 64 * 1024 * 1024;
  s.ownerId = randomUUID();
  s.dependencies.assets.clip = {
    id: 'clip',
    name: 'clip',
    hash,
    mediaType: 'video/mp4',
    url: 'media/' + hash,
  };
  const controller = new AbortController();
  try {
    const original = await assetPath(root, s.ownerId, hash, true);
    await writeFile(original, '');
    await truncate(original, size);
    await mkdir(target);
    const changes = watch(target, () => controller.abort());
    try {
      await expect(stageMedia(s, target, root, controller.signal)).rejects.toMatchObject({
        name: 'AbortError',
      });
      expect((await stat(join(target, hash))).size).toBeLessThan(size);
    } finally {
      changes.close();
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
it('reports a cue with no sample inside its half-open interval without changing its timing', async () => {
  const snapshot = fixture();
  snapshot.document.canvas.fps = 25;
  const layer = snapshot.document.scenes[0]!.layers[1];
  if (layer?.type !== 'captions') throw new Error('fixture');
  layer.startMs = 300;
  layer.cues = [{ id: 'short', text: 'Breve', startMs: 2360, endMs: 2380 }];
  const adapter = new RemotionProjectAdapter();
  expect(await adapter.validate(snapshot)).toContainEqual(
    expect.objectContaining({ code: 'cue-no-frame', layerId: layer.id, severity: 'warning' })
  );
  expect(layer.cues[0]!.endMs).toBe(2380);
  layer.cues[0]!.endMs = 2381;
  expect((await adapter.validate(snapshot)).some((d) => d.code === 'cue-no-frame')).toBe(false);
});
it('uses the rendered frame at 200 ms for a caption layer at 167 ms and excludes a cue ending at that frame', async () => {
  const snapshot = fixture();
  snapshot.document.canvas.fps = 30;
  const layer = snapshot.document.scenes[0]!.layers.find((l) => l.type === 'captions')!;
  layer.startMs = 167;
  layer.cues = [{ id: 'short', startMs: 33, endMs: 34, text: 'Primer cuadro' }];
  const adapter = new RemotionProjectAdapter();
  const missing = async () =>
    (await adapter.validate(snapshot)).some((d) => d.code === 'cue-no-frame');
  expect(await missing()).toBe(false);
  layer.cues[0]!.startMs = 32;
  layer.cues[0]!.endMs = 33;
  expect(await missing()).toBe(true);
});
