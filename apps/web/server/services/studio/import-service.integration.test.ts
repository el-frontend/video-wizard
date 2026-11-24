import { Readable } from 'node:stream';
import { importDiagnostics } from '@workspace/video-project';
import { AssetService } from './asset-service';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { authFixture } from '@/server/auth/auth-test-fixture';
import { users } from '@/server/db/schema';
import { ProjectService } from './project-service';
import { ImportService } from './import-service';

describe('registered Motion Studio imports', () => {
  let fixture: Awaited<ReturnType<typeof authFixture>>;
  let root: string;
  let service: ImportService;
  const owner = randomUUID(),
    stranger = randomUUID();
  const request = { kind: 'motion-studio', sourceId: 'fixture' } as const;
  const episode = {
    title: 'Edición',
    scenes: [
      {
        duration: 2,
        titleLines: ['Uno', 'Dos'],
        narration: 'Texto hablado',
        audio: 'assets/missing.wav',
        audioOffset: 0.2,
      },
      { duration: 3, titleLines: ['Final'] },
    ],
  };
  beforeAll(async () => {
    fixture = await authFixture(9);
    root = await realpath(await mkdtemp(join(tmpdir(), 'd6-import-')));
    await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
    await mkdir(join(root, 'videos', 'demo', 'assets'), { recursive: true });
    await writeFile(join(root, 'videos/demo/episode.json'), JSON.stringify(episode));
    await writeFile(
      join(root, 'videos/demo/captions.json'),
      JSON.stringify([{ start: 1.8, end: 2.2, text: 'Cruce' }])
    );
    service = new ImportService(fixture.db, {
      sources: [{ ownerId: owner, sourceId: 'fixture', root, slug: 'demo', fps: 30 }],
      dataDir: join(root, 'managed'),
    });
  });
  afterAll(async () => {
    await fixture?.close();
    if (root) await rm(root, { recursive: true, force: true });
  });
  it('converges racing imports and reopens the edited head with persistent resource diagnostics', async () => {
    const [a, b] = await Promise.all([
      service.import(owner, request),
      service.import(owner, request),
    ]);
    expect(a.project).toEqual(b.project);
    const projects = new ProjectService(fixture.db);
    const doc = a.project.document;
    expect(doc.scenes.map((s) => s.durationMs)).toEqual([2000, 3000]);
    expect(doc.scenes[0]?.editorial).toMatchObject({
      headline: 'Uno\nDos',
      narration: 'Texto hablado',
    });
    expect(
      doc.scenes.map((s) =>
        s.layers.find((l) => l.type === 'captions')?.cues.map((c) => [c.startMs, c.endMs])
      )
    ).toEqual([[[1800, 2000]], [[0, 200]]]);
    expect(a.diagnostics.some((d) => d.severity === 'error')).toBe(true);
    const edit = await projects.save(owner, doc.id, {
      baseRevision: a.project.revision,
      document: { ...doc, title: 'Editado' },
    });
    expect((await service.import(owner, request)).project).toEqual(edit);
    expect(await projects.get(owner, doc.id)).toEqual(edit);
    await writeFile(
      join(root, 'videos/demo/episode.json'),
      JSON.stringify({ ...episode, title: 'Nueva edición' })
    );
    expect((await service.import(owner, request)).project.document.id).not.toBe(doc.id);
    expect(await projects.get(owner, doc.id)).toEqual(edit);
  });
  it('repairs one missing take in the same revision history, preserves edits, and restores the trusted error', async () => {
    const imported = (await service.import(owner, request)).project;
    const projects = new ProjectService(fixture.db, join(root, 'managed')),
      id = imported.document.id;
    const slot = imported.importContext!.slots.find((s) => s.kind === 'audio')!;
    const manual = await projects.save(owner, id, {
      baseRevision: imported.revision,
      document: { ...imported.document, title: 'Edición manual' },
    });
    const wav = Buffer.alloc(44 + 16000);
    wav.write('RIFF');
    wav.writeUInt32LE(wav.length - 8, 4);
    wav.write('WAVEfmt ', 8);
    wav.writeUInt32LE(16, 16);
    wav.writeUInt16LE(1, 20);
    wav.writeUInt16LE(1, 22);
    wav.writeUInt32LE(8000, 24);
    wav.writeUInt32LE(16000, 28);
    wav.writeUInt16LE(2, 32);
    wav.writeUInt16LE(16, 34);
    wav.write('data', 36);
    wav.writeUInt32LE(16000, 40);
    const asset = await new AssetService(fixture.db, join(root, 'managed')).ingest(owner, {
      stream: Readable.from(wav),
      filename: 'fixture.wav',
      mediaType: 'audio/wav',
    });
    const repair = { slotId: slot.id, repair: { action: 'replace', assetId: asset.id } };
    await expect(
      projects.repairImport(owner, id, { ...repair, baseRevision: imported.revision })
    ).rejects.toMatchObject({ current: manual });
    const fixed = await projects.repairImport(owner, id, {
      ...repair,
      baseRevision: manual.revision,
    });
    expect(fixed.document.title).toBe(manual.document.title);
    expect(fixed.document.scenes[0]?.layers.find((l) => l.type === 'audio')).toMatchObject({
      assetId: asset.id,
      startMs: 200,
      endMs: 1200,
    });
    expect(fixed.document.scenes.map((s) => s.durationMs)).toEqual([2000, 3000]);
    expect(importDiagnostics(fixed.importContext).some((d) => d.code === 'import-slot')).toBe(
      false
    );
    const copy = await projects.copyDraft(owner, id, {
      baseRevision: manual.revision,
      document: { ...manual.document, title: 'Mi copia local' },
    });
    expect(copy.document.id).not.toBe(id);
    expect(copy.importContext).toEqual(manual.importContext);
    expect((await projects.get(owner, id)).revision).toBe(fixed.revision);
    const restored = await projects.restore(owner, id, {
      baseRevision: fixed.revision,
      targetRevision: manual.revision,
    });
    expect(restored.importContext!.slots[0]?.resolution).toBe('pending');
    const omitted = await projects.repairImport(owner, id, {
      baseRevision: restored.revision,
      slotId: slot.id,
      repair: { action: 'omit' },
    });
    expect(omitted.importContext!.slots[0]?.resolution).toBe('omitted');
    await expect(
      projects.save(owner, id, {
        baseRevision: omitted.revision,
        document: omitted.document,
        importContext: {},
      })
    ).rejects.toThrow();
    await expect(
      projects.copyDraft(stranger, id, { baseRevision: manual.revision, document: manual.document })
    ).rejects.toThrow();
    await expect(
      projects.copyDraft(owner, id, { baseRevision: copy.revision, document: manual.document })
    ).rejects.toThrow();
  });
  it('surfaces an original without a model as read-only and refuses document writes or fabricated metadata', async () => {
    await mkdir(join(root, 'videos', 'archive'));
    const archive = new ImportService(fixture.db, {
      sources: [{ ownerId: owner, sourceId: 'archive', slug: 'archive', root, fps: 30 }],
      dataDir: join(root, 'managed'),
    });
    const { project, diagnostics } = await archive.import(owner, {
      kind: 'motion-studio',
      sourceId: 'archive',
    });
    expect(project.importContext?.mode).toBe('original');
    expect(project.document.scenes).toEqual([]);
    expect(diagnostics.map((d) => d.code)).toContain('import-original');
    const projects = new ProjectService(fixture.db);
    await expect(
      projects.save(owner, project.document.id, {
        baseRevision: project.revision,
        document: { ...project.document, title: 'Manipulado' },
      })
    ).rejects.toThrow();
    await expect(
      projects.copyDraft(owner, project.document.id, {
        baseRevision: project.revision,
        document: project.document,
      })
    ).rejects.toThrow();
  });
  it('rejects unregistered sources, browser-selected paths and linked dependency files', async () => {
    await expect(service.import(stranger, request)).rejects.toThrow();
    await expect(service.import(owner, { ...request, path: '/tmp' })).rejects.toThrow();
    await symlink(
      join(root, 'videos/demo/episode.json'),
      join(root, 'videos/demo/assets/missing.wav')
    );
    await expect(service.import(owner, request)).rejects.toThrow();
  });
});
