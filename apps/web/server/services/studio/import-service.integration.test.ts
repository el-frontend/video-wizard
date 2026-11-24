import { execFileSync } from 'node:child_process';
import { cp, readFile } from 'node:fs/promises';
import { packagesDirectory } from './catalog-source';
import { provisionCatalog } from './provision-catalog';
import { Readable } from 'node:stream';
import { importDiagnostics } from '@workspace/video-project';
import { AssetService } from './asset-service';
import { randomUUID } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm, realpath, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
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
    vi.stubEnv('STUDIO_DATA_DIR', join(root, 'managed'));
    vi.doMock('@/server/db', () => ({ db: fixture.db }));
    service = new ImportService(fixture.db, {
      sources: [{ ownerId: owner, sourceId: 'fixture', root, slug: 'demo', fps: 30 }],
      dataDir: join(root, 'managed'),
    });
  });
  afterAll(async () => {
    vi.unstubAllEnvs();
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
  async function source(slug: string, episode: object) {
    const video = join(root, 'videos', slug);
    await mkdir(join(video, 'assets'), { recursive: true });
    await writeFile(join(video, 'episode.json'), JSON.stringify(episode));
    await writeFile(join(video, 'captions.json'), '[]');
    const imports = new ImportService(fixture.db, {
      sources: [{ ownerId: owner, sourceId: slug, slug, root, fps: 30 }],
      dataDir: join(root, 'managed'),
    });
    return { video, run: () => imports.import(owner, { kind: 'motion-studio', sourceId: slug }) };
  }
  it('preserves the alternate headline independently of narration and keeps the episode header', async () => {
    const fixture = await source('headline', {
      title: 'Project',
      series: 'Noticias',
      date: '2026-11-11',
      dateLabel: 'Miércoles',
      scenes: [{ duration: 2, headline: 'Titular alternativo' }],
    });
    const { project } = await fixture.run();
    expect(project.document.title).toBe('Project');
    expect(project.importContext).toMatchObject({
      editorial: { series: 'Noticias', date: '2026-11-11', dateLabel: 'Miércoles' },
    });
    expect(project.document.scenes[0]?.editorial?.headline).toBe('Titular alternativo');
    expect(project.document.scenes[0]?.layers.find((l) => l.type === 'text')?.text).toBe(
      'Titular alternativo'
    );
    expect(project.document.scenes[0]?.editorial?.narration).toBeUndefined();
  });
  it('fingerprints and verifies the inferred source style fonts', async () => {
    const fixtureSource = await source('infer', { scenes: [{ duration: 2 }] });
    const archive = join(packagesDirectory(), 'style-packs/packs'),
      style = 'noticias-liquid-glass',
      installed = join(root, 'styles', style);
    await mkdir(join(installed, 'assets'), { recursive: true });
    await cp(join(archive, style, 'frame.md'), join(installed, 'frame.md'));
    await cp(join(archive, style, 'frame.md'), join(fixtureSource.video, 'frame.md'));
    await cp(join(archive, 'fonts'), join(installed, 'assets/fonts'), { recursive: true });
    await provisionCatalog(fixture.db, owner);
    const original = (await fixtureSource.run()).project;
    expect(original.document.styleRef?.id).toBe(style);
    await writeFile(join(installed, 'assets/fonts/ArchivoBlack-400.woff2'), 'changed');
    const changed = (await fixtureSource.run()).project;
    expect(changed.importContext?.hash).not.toBe(original.importContext?.hash);
    expect(changed.document.styleRef).toBeNull();
    expect(changed.importContext?.slots).toContainEqual(
      expect.objectContaining({ kind: 'style', resolution: 'pending' })
    );
  });
  it.each(['master', 'fallback', 'reordered', 'retimed', 'edited', 'repaired'] as const)(
    'repairs a missing master and preserves approved timing and manual audio (%s)',
    async (mode) => {
      const fallback = mode !== 'master';
      const f = await source('repair-' + mode, {
        audioMaster: 'assets/master.wav',
        scenes: [
          { duration: 2, ...(fallback && { audio: 'assets/voice.wav', narration: 'Toma' }) },
          { duration: 3 },
        ],
      });
      const wav = (length: number) =>
        execFileSync('ffmpeg', [
          '-loglevel',
          'error',
          '-f',
          'lavfi',
          '-i',
          'anullsrc=r=8000:cl=mono',
          '-t',
          String(length),
          '-f',
          'wav',
          'pipe:1',
        ]);
      if (fallback && mode !== 'repaired')
        await writeFile(join(f.video, 'assets/voice.wav'), wav(1));
      let { project } = await f.run();
      const id = project.document.id;
      const masterSlot = project.importContext?.slots.find((s) => s.kind === 'audio' && !s.sceneId);
      expect(masterSlot).toBeDefined();
      const projects = new ProjectService(fixture.db, join(root, 'managed'));
      const asset = await new AssetService(fixture.db, join(root, 'managed')).ingest(owner, {
        filename: 'replacement.wav',
        mediaType: 'audio/wav',
        stream: Readable.from(wav(8)),
      });
      if (mode === 'repaired') {
        const take = await new AssetService(fixture.db, join(root, 'managed')).ingest(owner, {
          filename: 'scene.wav',
          mediaType: 'audio/wav',
          stream: Readable.from(wav(1)),
        });
        const slot = project.importContext!.slots.find((s) => s.sceneId)!;
        project = await projects.repairImport(owner, id, {
          baseRevision: project.revision,
          slotId: slot.id,
          repair: { action: 'replace', assetId: take.id },
        });
      }
      const doc = structuredClone(project.document),
        music = {
          id: randomUUID(),
          type: 'audio' as const,
          assetId: asset.id,
          startMs: 0,
          endMs: 500,
          endAnchor: 'fixed' as const,
          volume: 0.2,
          visible: true,
          zIndex: 0,
          sourceInMs: 0,
        };
      doc.globalAudio.push(music);
      if (!doc.assetIds.includes(asset.id)) doc.assetIds.push(asset.id);
      if (mode === 'reordered') doc.scenes.reverse();
      if (mode === 'retimed') {
        doc.scenes[0]!.durationMs += 100;
        doc.scenes[1]!.durationMs -= 100;
      }
      if (mode === 'edited') {
        const take = doc.scenes[0]!.layers.find((l) => l.type === 'audio')!;
        take.volume = 0.4;
      }
      const saved = await projects.save(owner, id, {
        baseRevision: project.revision,
        document: doc,
      });
      const repaired = await projects.repairImport(owner, id, {
        baseRevision: saved.revision,
        slotId: masterSlot!.id,
        repair: { action: 'replace', assetId: asset.id },
      });
      const activate = mode === 'master' || mode === 'fallback';
      expect(repaired.document.durationMs).toBe(5000);
      expect(repaired.document.globalAudio).toContainEqual(music);
      expect(repaired.importContext?.narration).toMatchObject({
        playback: activate ? 'master' : 'scenes',
        masterAssetId: asset.id,
      });
      expect(
        repaired.document.scenes.flatMap((s) => s.layers.filter((l) => l.type === 'audio'))
      ).toEqual(
        activate ? [] : doc.scenes.flatMap((s) => s.layers.filter((l) => l.type === 'audio'))
      );
      if (activate) {
        expect(repaired.document.globalAudio).toContainEqual(
          expect.objectContaining({ endMs: 5000, assetId: asset.id })
        );
        expect(repaired.importContext?.diagnostics.map((d) => d.code)).toContain('master-tail');
      } else expect(repaired.document.globalAudio).toEqual([music]);
    }
  );
  it('reopens an accredited transcript with missing bytes and repairs its exact asset after reingestion', async () => {
    const { jobHistoryService: jobs } = await import('../job-history-service');
    const file = join(root, 'owned.mp4');
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=s=32x32:r=10:d=1',
      '-c:v',
      'libx264',
      file,
    ]);
    const bytes = await readFile(file),
      assets = new AssetService(fixture.db, join(root, 'managed'));
    const ingest = () =>
      assets.ingest(owner, {
        filename: 'owned.mp4',
        mediaType: 'video/mp4',
        stream: Readable.from(bytes),
      });
    const asset = await ingest();
    const job = await jobs.create({
      userId: owner,
      type: 'transcription',
      inputData: { sourceAssetId: asset.id },
    });
    await jobs.complete(job.id, {
      sourceAssetId: asset.id,
      subtitles: [{ id: 1, text: 'Palabra', start: 100, end: 300 }],
      language: 'es',
      videoDuration: 1,
      sourceDurationMs: 1000,
      totalSegments: 1,
    });
    await rm(await assets.resolveFile(owner, asset.id));
    const request = { kind: 'legacy-job', sourceId: job.id };
    const { project } = await service.import(owner, request);
    const slot = project.importContext!.slots.find((s) => s.kind === 'video')!;
    expect(slot).toMatchObject({ resolution: 'pending', assetId: asset.id });
    expect(project.document.scenes[0]?.durationMs).toBe(1000);
    expect(
      project.document.scenes[0]?.layers.find((l) => l.type === 'captions')?.cues
    ).toContainEqual(expect.objectContaining({ text: 'Palabra', startMs: 100, endMs: 300 }));
    expect((await service.import(owner, request)).project).toEqual(project);
    const projects = new ProjectService(fixture.db, join(root, 'managed'));
    const edit = await projects.save(owner, project.document.id, {
      baseRevision: project.revision,
      document: { ...project.document, title: 'Edición conservada' },
    });
    const repair = { slotId: slot.id, baseRevision: edit.revision, repair: { action: 'recheck' } };
    await expect(projects.repairImport(owner, project.document.id, repair)).rejects.toThrow();
    expect((await ingest()).id).toBe(asset.id);
    const fixed = await projects.repairImport(owner, project.document.id, repair);
    expect(fixed.document).toEqual(edit.document);
    expect(fixed.importContext?.slots[0]?.resolution).toBe('replaced');
    const unproven = await jobs.create({
      userId: owner,
      type: 'transcription',
      inputData: { video_path: 'uploads/historical.mp4' },
    });
    await jobs.complete(unproven.id, { output_url: 'http://engine/old.mp4' });
    await expect(service.import(owner, { ...request, sourceId: unproven.id })).rejects.toThrow(
      /verificar el origen/
    );
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
