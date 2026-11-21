import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { applyCommand, sceneStartMs, validateForExport } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { beforeAll, afterAll, expect, it, vi } from 'vitest';
import { requireAuth, UnauthorizedError } from '@/server/lib/auth';
import { openStudioTestDb } from '@/test/studio-db';
import { AssetService, AssetNotFoundError } from './asset-service';
import { ProjectService, ConflictError } from './project-service';
import { AudioService } from './audio-service';

vi.mock('@/server/lib/auth', () => ({
  requireAuth: vi.fn(),
  UnauthorizedError: class extends Error {},
}));
let db: Awaited<ReturnType<typeof openStudioTestDb>>;
let projects: ProjectService, assets: AssetService, service: AudioService;
let directory: string, owner: string, outsider: string, assetId: string, otherAsset: string;
beforeAll(async () => {
  db = await openStudioTestDb();
  owner = await db.createOwner();
  outsider = await db.createOwner();
  directory = await mkdtemp(join(tmpdir(), 'studio-d3-'));
  assets = new AssetService(db.db, directory);
  projects = new ProjectService(db.db);
  service = new AudioService(projects, assets);
  const path = join(directory, 'tono.wav');
  execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', 'sine=duration=4.8', path]);
  const bytes = await readFile(path);
  const ingest = (id: string) =>
    assets.ingest(id, {
      filename: 'tono.wav',
      mediaType: 'audio/wav',
      stream: Readable.from([bytes]),
    });
  assetId = (await ingest(owner)).id;
  otherAsset = (await ingest(outsider)).id;
});
afterAll(async () => {
  try {
    if (directory) await rm(directory, { recursive: true, force: true });
  } finally {
    await db?.close();
  }
});
async function seed() {
  const doc = exampleProject();
  const created = await projects.create(owner, {
    title: doc.title,
    engine: doc.engine,
    canvas: doc.canvas,
  });
  doc.id = created.document.id;
  const layers = doc.scenes[0]!.layers;
  layers[0]!.startMs = 500;
  layers[1]!.startMs = 200;
  layers.push({ ...layers[1]!, id: 'other-captions', startMs: 400 });
  return projects.save(owner, doc.id, { baseRevision: created.revision, document: doc });
}
const cue = {
  id: 'cue',
  startMs: 100,
  endMs: 700,
  text: 'Qué',
  words: [{ text: 'Qué', startMs: 25, endMs: 140 }],
};
it('commits one measured replacement and converts each linked layer once without ripple', async () => {
  const { document, revision } = await seed();
  const [scene] = document.scenes;
  const input = {
    baseRevision: revision,
    sceneId: 'intro',
    audioLayerId: 'speech',
    assetId,
    captions: [cue],
  };
  const replaced = await service.replace(owner, document.id, input);
  const next = replaced.document;
  expect(next.scenes[0]!.layers[0]).toMatchObject({
    startMs: 500,
    endMs: 5300,
    assetId,
    take: { durationMs: 4800, provider: 'upload', spokenText: 'Hola', stale: false },
  });
  for (const [i, startMs, endMs] of [
    [1, 400, 1000],
    [3, 200, 800],
  ] as const)
    expect(next.scenes[0]!.layers[i]).toMatchObject({ cues: [{ ...cue, startMs, endMs }] });
  expect(next.scenes[0]!.layers[2]).toEqual(scene!.layers[2]);
  expect(next.scenes[1]).toEqual(document.scenes[1]);
  expect(next.globalAudio).toEqual(document.globalAudio);
  expect(sceneStartMs(next, 'outro')).toBe(4200);
  expect(
    validateForExport(next).some((d) => d.code === 'layer-overflow' && d.severity === 'error')
  ).toBe(true);
  const history = await projects.history(owner, document.id);
  expect(history.items).toHaveLength(3);
  await expect(service.replace(owner, document.id, input)).rejects.toBeInstanceOf(ConflictError);
  expect((await projects.history(owner, document.id)).items).toHaveLength(3);
  const extended = applyCommand(next, { type: 'extend-scene', sceneId: 'intro', durationMs: 5300 });
  expect(sceneStartMs(extended, 'outro')).toBe(5300);
  expect(extended.scenes[0]!.layers[1]).toEqual(next.scenes[0]!.layers[1]);
  expect(extended.scenes[0]!.layers[2]!.endMs).toBe(5300);
  expect(extended.globalAudio).toEqual(next.globalAudio);
  expect(
    applyCommand(next, { type: 'set-headline', sceneId: 'intro', text: 'Nuevo' }).scenes[0]!
      .layers[0]
  ).toMatchObject({ take: { stale: false } });
  expect(
    applyCommand(next, { type: 'set-narration', sceneId: 'intro', text: 'Nuevo' }).scenes[0]!
      .layers[0]
  ).toMatchObject({ take: { stale: true } });
});
it('rejects invalid captions and foreign assets without committing a revision', async () => {
  const { document, revision } = await seed();
  const input = { baseRevision: revision, sceneId: 'intro', audioLayerId: 'speech', assetId };
  for (const captions of [
    [{ ...cue, endMs: 4801 }],
    [{ ...cue, words: [{ text: ' ', startMs: 10, endMs: 20 }] }],
    [{ ...cue, words: [{ text: 'qué', startMs: 0, endMs: 601 }] }],
  ])
    await expect(service.replace(owner, document.id, { ...input, captions })).rejects.toThrow();
  await expect(
    service.replace(owner, document.id, { ...input, assetId: otherAsset })
  ).rejects.toBeInstanceOf(AssetNotFoundError);
  expect((await projects.get(owner, document.id)).revision).toBe(revision);
  const moved = applyCommand(document, {
    type: 'update-layer',
    sceneId: 'intro',
    layerId: 'captions',
    patch: { startMs: 800 },
  });
  const saved = await projects.save(owner, document.id, {
    baseRevision: revision,
    document: moved,
  });
  await expect(
    service.replace(owner, document.id, { ...input, baseRevision: saved.revision, captions: [cue] })
  ).rejects.toThrow(/antes|adelanta/i);
  const kept = await service.replace(owner, document.id, {
    ...input,
    baseRevision: saved.revision,
  });
  expect(kept.document.scenes[0]!.layers[1]).toEqual(moved.scenes[0]!.layers[1]);
  const cleared = await service.replace(owner, document.id, {
    ...input,
    baseRevision: kept.revision,
    captions: [],
  });
  expect(cleared.document.scenes[0]!.layers[1]).toMatchObject({ cues: [] });
});
it('exposes authenticated 401, 404, 400 and 409 without an extra history entry', async () => {
  vi.doMock('@/server/db', () => ({ db: db.db }));
  const { POST } = await import('@/app/api/studio/projects/[id]/audio/route');
  const { document, revision } = await seed();
  const input = { sceneId: 'intro', audioLayerId: 'speech', assetId, baseRevision: revision };
  async function post(value: unknown) {
    return POST(new Request('http://localhost', { method: 'POST', body: JSON.stringify(value) }), {
      params: Promise.resolve({ id: document.id }),
    });
  }
  vi.mocked(requireAuth).mockRejectedValueOnce(new UnauthorizedError());
  expect((await post(input)).status).toBe(401);
  vi.mocked(requireAuth).mockResolvedValue({ id: owner, name: null, email: null, image: null });
  expect((await post({ ...input, assetId: otherAsset })).status).toBe(404);
  expect((await post({ ...input, durationMs: 1 })).status).toBe(400);
  expect(
    (await post({ ...input, captions: [{ ...cue, words: [{ text: '', startMs: 0, endMs: 10 }] }] }))
      .status
  ).toBe(400);
  expect((await post({ ...input, audioLayerId: 'missing' })).status).toBe(400);
  vi.mocked(requireAuth).mockResolvedValueOnce({
    id: outsider,
    name: null,
    email: null,
    image: null,
  });
  expect((await post(input)).status).toBe(404);
  const competing = await Promise.all([post(input), post(input)]);
  expect(competing.map((r) => r.status).sort()).toEqual([200, 409]);
  const conflict = await competing.find((r) => r.status === 409)!.json(),
    current = await projects.get(owner, document.id);
  expect(conflict.current.revision).toBe(current.revision);
  expect((await projects.history(owner, document.id)).items).toHaveLength(3);
});
it('accepts measured video with audio and rejects silent video or missing caption links atomically', async () => {
  const { document, revision } = await seed();
  let doc = applyCommand(document, { type: 'remove-layer', sceneId: 'intro', layerId: 'captions' });
  doc = applyCommand(doc, { type: 'remove-layer', sceneId: 'intro', layerId: 'other-captions' });
  const saved = await projects.save(owner, doc.id, { baseRevision: revision, document: doc });
  const input = { sceneId: 'intro', audioLayerId: 'speech', assetId, baseRevision: saved.revision };
  await expect(service.replace(owner, doc.id, { ...input, captions: [cue] })).rejects.toThrow(
    /vincula/i
  );
  async function video(sound: boolean) {
    const path = join(directory, sound ? 'voz.mp4' : 'silencio.mp4');
    execFileSync('ffmpeg', [
      '-v',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=size=16x16:duration=1',
      ...(sound ? ['-f', 'lavfi', '-i', 'sine=duration=1'] : []),
      '-c:v',
      'libx264',
      path,
    ]);
    return assets.ingest(owner, {
      filename: 'toma.mp4',
      mediaType: 'video/mp4',
      stream: Readable.from([await readFile(path)]),
    });
  }
  const silent = await video(false),
    voiced = await video(true);
  await expect(service.replace(owner, doc.id, { ...input, assetId: silent.id })).rejects.toThrow(
    /pista de audio/
  );
  expect((await projects.get(owner, doc.id)).revision).toBe(saved.revision);
  const changed = await service.replace(owner, doc.id, { ...input, assetId: voiced.id });
  expect(changed.document.scenes[0]!.layers[0]).toMatchObject({
    assetId: voiced.id,
    take: { durationMs: voiced.durationMs },
  });
});
