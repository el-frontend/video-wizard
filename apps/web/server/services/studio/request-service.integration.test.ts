import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { execFileSync } from 'node:child_process';
import { exampleProject } from '@workspace/video-project/fixtures';
import { AssetService } from './asset-service';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it } from 'vitest';
import { authFixture } from '@/server/auth/auth-test-fixture';
import { users } from '@/server/db/schema';
import { ProjectService } from './project-service';
import { RequestService } from './request-service';

let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture();
});
afterAll(async () => {
  await fixture?.close();
});
async function setup() {
  const owner = randomUUID();
  await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
  const projects = new ProjectService(fixture.db);
  const project = await projects.create(owner, { title: 'Base', engine: 'remotion' });
  const id = project.document.id;
  const service = new RequestService(fixture.db);
  const bindingId = randomUUID();
  const intent = await service.pairing(owner, id);
  const bound = await service.bind(intent.token, { bindingId, provider: 'codex' });
  const input = {
    provider: 'codex' as const,
    bindingId,
    baseRevision: project.revision,
    engine: 'remotion' as const,
    kind: 'feedback' as const,
    message: 'Cambiar título',
    selection: { sceneId: null, layerId: null, captionId: null, timeMs: 0 },
    idempotencyKey: randomUUID(),
  };
  return { owner, id, project, projects, service, bound, input, intent };
}
it('persists one exact request and claims only once under concurrency', async () => {
  const { service, id, owner, input, bound, intent, projects, project } = await setup();
  await expect(
    service.bind(intent.token, { bindingId: randomUUID(), provider: 'codex' })
  ).rejects.toThrow();
  const [a, b] = await Promise.all([
    service.create(owner, id, input),
    service.create(owner, id, input),
  ]);
  expect(a).toEqual(b);
  const claims = await Promise.all([
    service.claim(bound.token, id, input.bindingId, a.id),
    service.claim(bound.token, id, input.bindingId, a.id),
  ]);
  expect(claims.filter(Boolean)).toHaveLength(1);
  await projects.save(owner, id, {
    baseRevision: project.revision,
    document: { ...project.document, title: 'Manual' },
  });
  expect((await service.create(owner, id, input)).id).toBe(a.id);
  await expect(service.create(owner, id, { ...input, message: 'Different' })).rejects.toThrow();
  const grant = claims.find(Boolean)!;
  await expect(
    service.feedback(grant.token, id, { baseRevision: input.baseRevision, text: 'Change' })
  ).rejects.toThrow(/revisión/i);
});
it('records the exact mutation before callback, survives replay and ignores late ACK', async () => {
  const { service, id, owner, input, bound, projects } = await setup();
  const receipt = await service.create(owner, id, input);
  const claim = (await service.claim(bound.token, id, input.bindingId, receipt.id))!;
  await expect(
    service.feedback(claim.token, randomUUID(), {
      baseRevision: input.baseRevision,
      text: 'Edited',
    })
  ).rejects.toThrow();
  const edit = { baseRevision: input.baseRevision, text: 'Edited' };
  const record = await service.feedback(claim.token, id, edit);
  await projects.save(owner, id, {
    baseRevision: record.revision,
    document: { ...record.document, title: 'Later' },
  });
  expect((await service.feedback(claim.token, id, edit)).revision).toBe(record.revision);
  await expect(service.feedback(claim.token, id, { ...edit, text: 'Other' })).rejects.toThrow();
  const done = { status: 'completed' as const, resultRevision: record.revision };
  await expect(
    service.report(claim.token, id, receipt.id, { ...done, resultRevision: input.baseRevision })
  ).rejects.toThrow();
  expect((await service.report(claim.token, id, receipt.id, done)).status).toBe('completed');
  expect((await service.report(claim.token, id, receipt.id, done)).status).toBe('completed');
  expect(
    (
      await service.ack(bound.token, id, input.bindingId, receipt.id, claim.attemptId, {
        status: 'sent',
      })
    ).status
  ).toBe('completed');
  expect((await service.list(owner, id))[0].resultRevision).toBe(record.revision);
});

it.each(['waiting', 'delivery-unknown'] as const)(
  'does not redeliver a claimed %s attempt',
  async (status) => {
    const { service, id, input, bound, owner } = await setup(),
      r = await service.create(owner, id, input);
    const c = (await service.claim(bound.token, id, input.bindingId, r.id))!;
    await expect(
      service.ack(bound.token, id, input.bindingId, r.id, randomUUID(), { status })
    ).rejects.toThrow();
    expect(
      (
        await service.ack(bound.token, id, input.bindingId, r.id, c.attemptId, {
          status,
          deliveryId: 'queue-id',
        })
      ).delivery
    ).toEqual({ status, id: 'queue-id' });
    expect(await service.claim(bound.token, id, input.bindingId, r.id)).toBeNull();
    expect((await service.list(owner, id))[0].status).toBe(status);
  }
);
it('treats invalid proposals as recoverable and never applies from an ACK', async () => {
  const { service, id, input, bound, owner, projects, project } = await setup();
  const r = await service.create(owner, id, { ...input, kind: 'component' }),
    c = (await service.claim(bound.token, id, input.bindingId, r.id))!;
  const proposal = {
    kind: 'component',
    requestId: r.id,
    engine: 'remotion',
    baseRevision: input.baseRevision,
    manifest: { engine: 'remotion' },
    files: { 'main.tsx': 'export default 1' },
    commands: [{ type: 'set-headline', sceneId: 'scene', text: 'A' }],
  };
  await expect(
    service.stage(c.token, id, { ...proposal, requestId: randomUUID() })
  ).rejects.toThrow();
  const invalid = await service.stage(c.token, id, proposal);
  expect(invalid.diagnostics[0].severity).toBe('error');
  await expect(service.report(c.token, id, r.id, { status: 'completed' })).rejects.toThrow();
  const revised = await service.stage(c.token, id, { ...proposal, name: 'Nueva entrega' });
  expect(revised.proposalId).not.toBe(invalid.proposalId);
  await service.ack(bound.token, id, input.bindingId, r.id, c.attemptId, { status: 'sent' });
  expect((await projects.get(owner, id)).revision).toBe(project.revision);
  expect((await service.list(owner, id))[0].proposalId).toBe(revised.proposalId);
});

it('activates only imported narration and commits one measured take with observed cues and evidence', async () => {
  const { owner } = await setup(),
    dir = await mkdtemp(join(tmpdir(), 'r4-audio-test-'));
  const assets = new AssetService(fixture.db, dir),
    projects = new ProjectService(fixture.db, dir),
    service = new RequestService(fixture.db, dir);
  const tone = execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'sine=duration=1',
    '-f',
    'mp3',
    'pipe:1',
  ]);
  const bytes = () => ({
    filename: 'audio-tecnico.mp3',
    mediaType: 'audio/mpeg',
    stream: Readable.from([tone]),
  });
  const asset = await assets.ingest(owner, bytes()),
    draft = exampleProject();
  draft.id = randomUUID();
  draft.assetIds.push(asset.id);
  const master = { ...draft.globalAudio[0]!, id: 'master', assetId: asset.id, startMs: 0 };
  draft.globalAudio.push(master);
  draft.scenes[0].layers = draft.scenes[0].layers.filter((l) => l.type !== 'audio');
  for (const l of draft.scenes[0].layers)
    if (l.type === 'captions') l.sourceAudioLayerId = master.id;
  const imported = await projects.importDocument(owner, draft, {
    version: 1,
    kind: 'motion-studio',
    mode: 'editable',
    sourceId: 'test',
    hash: 'a'.repeat(64),
    slots: [],
    diagnostics: [],
    narration: {
      masterAssetId: asset.id,
      playback: 'master',
      takes: draft.scenes.map((s) => ({
        sceneId: s.id,
        assetId: asset.id,
        startMs: 100,
        durationMs: asset.durationMs!,
        stale: true,
      })),
    },
  });
  const activated = await projects.activateSceneTakes(owner, draft.id, imported.revision);
  expect(activated.document.globalAudio).toEqual([draft.globalAudio[0]]);
  expect(activated.document.durationMs).toBe(draft.durationMs);
  expect(activated.importContext?.narration).toEqual({
    ...imported.importContext!.narration,
    playback: 'scenes',
  });
  const audio = activated.document.scenes[0].layers.find((l) => l.type === 'audio')!;
  const before = draft.scenes[0].layers.find((l) => l.type === 'captions')!;
  expect(activated.document.scenes[0].layers.find((l) => l.type === 'captions')).toEqual({
    ...before,
    sourceAudioLayerId: audio.id,
  });
  const bindingId = randomUUID(),
    pair = await service.bind((await service.pairing(owner, draft.id)).token, {
      bindingId,
      provider: 'codex',
    });
  const r = await service.create(owner, draft.id, {
    kind: 'voice',
    provider: 'codex',
    engine: 'remotion',
    bindingId,
    selection: { sceneId: 'intro', layerId: audio.id, captionId: null, timeMs: 230 },
    baseRevision: activated.revision,
    message: 'Verificar una toma',
    idempotencyKey: randomUUID(),
  });
  const c = (await service.claim(pair.token, draft.id, bindingId, r.id))!;
  await service.beginVoice(c.token, draft.id, r.id);
  await expect(service.beginVoice(c.token, draft.id, r.id)).rejects.toThrow(/inició/);
  await expect(service.report(c.token, draft.id, r.id, { status: 'completed' })).rejects.toThrow();
  const uploaded = await service.upload(c.token, bytes());
  expect(uploaded.id).toBe(asset.id);
  const input = {
    baseRevision: activated.revision,
    sceneId: 'intro',
    audioLayerId: audio.id,
    assetId: asset.id,
    provider: 'upload',
    spokenText: 'Texto de prueba atestiguado',
    captionSource: 'transcription',
    captions: [
      { id: 'cue-reemplazo', startMs: 10, endMs: 200, text: 'Texto de prueba atestiguado' },
    ],
  };
  const final = await service.audio(c.token, draft.id, input);
  expect((await service.audio(c.token, draft.id, input)).revision).toBe(final.revision);
  expect(final.document.scenes[0].layers.find((l) => l.type === 'audio')).toMatchObject({
    take: { durationMs: asset.durationMs, spokenText: input.spokenText, stale: true },
  });
  expect(final.document.scenes[0].layers.find((l) => l.type === 'captions')).toMatchObject({
    cues: [{ startMs: 110, endMs: 300 }],
  });
  expect(final.document.globalAudio).toEqual(activated.document.globalAudio);
  expect(final.document.durationMs).toBe(draft.durationMs);
  const done = await service.report(c.token, draft.id, r.id, { status: 'completed' });
  expect(done.voice).toEqual({
    durationMs: asset.durationMs,
    provider: 'upload',
    captionSource: 'transcription',
  });
});

it('returns the measured Shorts source and validates suggestions before explicit D5 creation', async () => {
  const { owner, id, input, bound, projects } = await setup(),
    dir = await mkdtemp(join(tmpdir(), 'r4-shorts-test-'));
  const assets = new AssetService(fixture.db, dir),
    service = new RequestService(fixture.db, dir);
  // Persist a seekable source so ffprobe can read its measured duration.
  const file = join(dir, 'short.mp4');
  execFileSync('ffmpeg', [
    '-v',
    'error',
    '-f',
    'lavfi',
    '-i',
    'color=s=16x16:r=10:d=1',
    '-c:v',
    'libx264',
    file,
  ]);
  const asset = await assets.ingest(owner, {
    filename: 'short.mp4',
    mediaType: 'video/mp4',
    stream: (await import('node:fs')).createReadStream(file),
  });
  const captions = [{ id: 'cue', text: 'Prueba', startMs: 100, endMs: 400 }];
  const r = await service.create(owner, id, {
    ...input,
    kind: 'shorts',
    sourceAssetId: asset.id,
    sourceCaptions: captions,
  });
  const c = (await service.claim(bound.token, id, input.bindingId, r.id))!;
  expect(await service.source(c.token, id, r.id)).toMatchObject({
    asset: { id: asset.id, durationMs: 1000 },
    captions,
  });
  await expect(
    service.suggestions(c.token, id, r.id, [{ startMs: 0, endMs: 1001 }])
  ).rejects.toThrow();
  const ranges = [{ startMs: 100, endMs: 600 }];
  expect((await service.suggestions(c.token, id, r.id, ranges)).ranges).toEqual(ranges);
  expect((await service.report(c.token, id, r.id, { status: 'completed' })).ranges).toEqual(ranges);
  expect((await projects.get(owner, id)).revision).toBe(input.baseRevision);
});
