import type { ProjectRecord } from '@workspace/video-project';
import { randomUUID } from 'node:crypto';
import { mkdtemp, rm, mkdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';
import { snapshotBuilder } from './snapshot-service';
import { AssetService } from './asset-service';
import { componentExample, applyCommand } from '@workspace/video-project';
import { openStudioTestDb } from '@/test/studio-db';
import { ProposalService } from './proposal-service';
import { ProjectService } from './project-service';
import { LibraryService } from './library-service';
import { compileComponent } from '../../../../remotion-server/server/component-compiler';

it('stages privately, applies once under CAS and lists only after explicit approval', async () => {
  const fixture = await openStudioTestDb();
  const dir = await mkdtemp(join(tmpdir(), 'r3-stage-'));
  try {
    const owner = await fixture.createOwner(),
      stranger = await fixture.createOwner();
    const projects = new ProjectService(fixture.db, dir),
      library = new LibraryService(fixture.db, dir);
    const service = new ProposalService(
      fixture.db,
      dir,
      async (_owner, _project, _proposal, input) => compileComponent(input),
      async () => ({ diagnostics: [] })
    );
    const project = await projects.create(owner, { title: 'Prueba', engine: 'remotion' });
    const example = componentExample('remotion');
    const input = {
      ...example,
      kind: 'component',
      requestId: randomUUID(),
      baseRevision: project.revision,
      commands: [
        {
          type: 'add-scene',
          scene: {
            id: 'scene',
            durationMs: 1000,
            layers: [
              {
                type: 'component',
                id: 'counter',
                componentRef: { id: '$candidate', version: 1 },
                props: example.manifest.initialProps,
                visible: true,
                zIndex: 0,
                box: { x: 0, y: 0, width: 300, height: 100 },
                startMs: 0,
                endMs: 1000,
                endAnchor: 'fixed',
              },
            ],
          },
        },
      ],
    };
    const id = project.document.id;
    const staged = await service.stage(owner, id, input);
    expect(staged.diagnostics).toEqual([]);
    expect((await service.stage(owner, id, input)).proposalId).toBe(staged.proposalId);
    expect(await projects.get(owner, id)).toEqual(project);
    expect(await library.list(owner, { kind: 'component' })).toEqual([]);
    await expect(service.get(stranger, id, staged.proposalId)).rejects.toThrow();
    const manifestError = {
      ...input,
      requestId: randomUUID(),
      manifest: { ...example.manifest, dependencies: ['gsap'] },
    };
    for (const bad of [
      { ...manifestError, files: { '../outside.ts': 'x' } },
      { ...manifestError, manifest: { ...manifestError.manifest, assetIds: Array(65).fill('a') } },
      { ...manifestError, manifest: { ...manifestError.manifest, comment: 'x'.repeat(65537) } },
      { ...manifestError, manifest: JSON.parse('{"__proto__":{}}') },
    ])
      await expect(service.stage(owner, id, bad)).rejects.toThrow();
    expect(await service.list(owner, id)).toHaveLength(1);
    const invalid = await service.stage(owner, id, manifestError);
    expect(invalid.diagnostics).toContainEqual(
      expect.objectContaining({ message: expect.stringContaining('manifest.dependencies') })
    );
    const invalidRow = await service.get(owner, id, invalid.proposalId);
    expect(invalidRow).toMatchObject({
      status: 'invalid',
      input: { manifest: manifestError.manifest, files: manifestError.files },
      candidate: null,
    });
    expect((await service.stage(owner, id, manifestError)).proposalId).toBe(invalid.proposalId);
    await expect(service.get(stranger, id, invalid.proposalId)).rejects.toThrow();
    await expect(service.apply(owner, id, invalid.proposalId, project.revision)).rejects.toThrow();
    expect(await projects.get(owner, id)).toEqual(project);
    expect(await library.list(owner, { kind: 'component' })).toEqual([]);
    expect((await service.get(owner, id, staged.proposalId)).status).toBe('ready');
    const rejected = await service.stage(owner, id, {
      ...input,
      requestId: randomUUID(),
      files: { 'title.tsx': 'export default function Title(){ return Date.now(); }' },
    });
    expect(rejected.diagnostics[0]?.severity).toBe('error');
    expect((await service.get(owner, id, staged.proposalId)).status).toBe('ready');
    await expect(service.apply(owner, id, rejected.proposalId, project.revision)).rejects.toThrow();
    const competing = await service.stage(owner, id, { ...input, requestId: randomUUID() });
    const decisions = await Promise.allSettled(
      [staged, competing].map((p) => service.apply(owner, id, p.proposalId, project.revision))
    );
    expect(decisions.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    const winner = decisions[0].status === 'fulfilled' ? staged : competing;
    const applied = await service.apply(owner, id, winner.proposalId, project.revision);
    const layer = applied.document.scenes[0]!.layers[0]!;
    if (layer.type !== 'component') throw Error('expected generated layer');
    const entry = await library.get(owner, layer.componentRef);
    expect(await library.list(owner, { kind: 'component' })).toEqual([]);
    await expect(library.publish(owner, entry)).rejects.toThrow();
    const changed = structuredClone(applied.document);
    Object.assign(changed.scenes[0]!.layers[0]!, { props: { title: 55 } });
    await expect(
      projects.save(owner, id, { baseRevision: applied.revision, document: changed })
    ).rejects.toThrow();
    await service.listVersion(owner, id, winner.proposalId);
    await service.listVersion(owner, id, winner.proposalId);
    expect(await library.list(owner, { kind: 'component' })).toEqual([entry]);
  } finally {
    await fixture.close();
    await rm(dir, { recursive: true, force: true });
  }
}, 30000);

it.each(['remotion', 'hyperframes'] as const)(
  'retains the reviewed %s pin when reused and when v2 is applied',
  async (engine) => {
    const db = await openStudioTestDb(),
      dir = await mkdtemp(join(tmpdir(), 'r3-reuse-'));
    try {
      const owner = await db.createOwner(),
        projects = new ProjectService(db.db, dir),
        library = new LibraryService(db.db, dir),
        assets = new AssetService(db.db, dir);
      const service = new ProposalService(
        db.db,
        dir,
        async (_o, _p, _id, i) => compileComponent(i),
        async () => ({ diagnostics: [] })
      );
      const base = await projects.create(owner, {
        title: 'Título',
        engine,
        canvas: { width: 320, height: 180, fps: 25 },
      });
      const ex = componentExample(engine),
        layer = {
          id: 'overlay',
          type: 'component' as const,
          componentRef: { id: '$candidate', version: 1 },
          props: ex.manifest.initialProps,
          visible: true,
          zIndex: 1,
          startMs: 57,
          endMs: 880,
          endAnchor: 'fixed' as const,
          box: { x: 10, y: 20, width: 300, height: 110 },
        };
      const source = {
        ...ex,
        requestId: randomUUID(),
        kind: 'component',
        engine,
        baseRevision: base.revision,
        commands: [
          { type: 'add-scene', scene: { id: 'intro', durationMs: 1017, layers: [layer] } },
          { type: 'add-scene', scene: { id: 'outro', durationMs: 183, layers: [] } },
        ],
      };
      const id = base.document.id,
        first = await service.stage(owner, id, source);
      expect(first.diagnostics).toEqual([]);
      const applied = await service.apply(owner, id, first.proposalId, base.revision);
      const pin = applied.document.scenes[0]!.layers[0]!;
      if (pin.type !== 'component') throw Error('fixture');
      const edit = applyCommand(applied.document, {
        type: 'update-layer',
        sceneId: 'intro',
        layerId: 'overlay',
        patch: { props: { title: 'Título editado' } },
      });
      const saved = await projects.save(owner, id, {
        baseRevision: applied.revision,
        document: edit,
      });
      await service.listVersion(owner, id, first.proposalId);
      const second = await projects.create(owner, {
        title: 'Segundo proyecto',
        engine,
        canvas: edit.canvas,
      });
      const reuse = applyCommand(second.document, {
        type: 'add-scene',
        scene: saved.document.scenes[0]!,
      });
      const reused = await projects.save(owner, second.document.id, {
        baseRevision: second.revision,
        document: applyCommand(reuse, { type: 'add-scene', scene: saved.document.scenes[1]! }),
      });
      const v2 = await service.stage(owner, id, {
        ...source,
        previous: pin.componentRef,
        baseRevision: saved.revision,
        requestId: randomUUID(),
        commands: [
          {
            type: 'update-layer',
            sceneId: 'intro',
            layerId: 'overlay',
            patch: { componentRef: layer.componentRef },
          },
        ],
      });
      const competingV2 = await service.stage(owner, second.document.id, {
        ...source,
        previous: pin.componentRef,
        requestId: randomUUID(),
        baseRevision: reused.revision,
        commands: [
          {
            type: 'update-layer',
            sceneId: 'intro',
            layerId: 'overlay',
            patch: { componentRef: layer.componentRef },
          },
        ],
      });
      const next = await service.apply(owner, id, v2.proposalId, saved.revision);
      await expect(
        service.apply(owner, second.document.id, competingV2.proposalId, reused.revision)
      ).rejects.toThrow('Ya existe esta versión');
      expect((await projects.get(owner, second.document.id)).revision).toBe(reused.revision);
      expect(next.document.scenes[0]!.layers[0]).toMatchObject({
        componentRef: { id: pin.componentRef.id, version: 2 },
      });
      const snapshot = await snapshotBuilder(assets, library)(owner, reused);
      expect(snapshot.document.scenes[0]!.layers[0]).toMatchObject({
        props: { title: 'Título editado' },
        componentRef: { id: pin.componentRef.id, version: 1 },
      });
      if ((import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'r3-fixture') {
        const evidence = join(tmpdir(), 'video-wizard-r3-fixtures-' + process.pid);
        await mkdir(evidence, { recursive: true });
        await writeFile(join(evidence, engine + '.json'), JSON.stringify(snapshot));
        console.info('R3 fixture', join(evidence, engine + '.json'));
      }
    } finally {
      await db.close();
      await rm(dir, { recursive: true, force: true });
    }
  },
  30000
);

it('preserves trusted editable import provenance, blocks originals and keeps missing caption slots', async () => {
  const fixture = await openStudioTestDb(),
    owner = await fixture.createOwner();
  try {
    const projects = new ProjectService(fixture.db),
      service = new ProposalService(fixture.db, undefined, undefined, async () => ({
        diagnostics: [],
      }));
    const base = await projects.create(owner, { title: 'Importación', engine: 'remotion' });
    const make = (
      mode: 'editable' | 'original',
      slots: NonNullable<ProjectRecord['importContext']>['slots'] = []
    ) =>
      projects.importDocument(
        owner,
        {
          ...base.document,
          id: randomUUID(),
          durationMs: 1000,
          scenes: [{ id: 'intro', durationMs: 1000, layers: [] }],
        },
        {
          version: 1,
          kind: 'legacy-job',
          mode,
          sourceId: randomUUID(),
          hash: '7'.repeat(64),
          editorial: { series: 'Serie' },
          narration: { takes: [], playback: 'scenes' },
          slots,
          diagnostics: [],
        }
      );
    const input = (record: ProjectRecord) => ({
      kind: 'storyboard',
      engine: 'remotion',
      baseRevision: record.revision,
      requestId: randomUUID(),
      commands: [{ type: 'set-title', title: 'Edición aprobada' }],
    });
    const editable = await make('editable'),
      stage = await service.stage(owner, editable.document.id, input(editable));
    const saved = await service.apply(
      owner,
      editable.document.id,
      stage.proposalId,
      editable.revision
    );
    expect(saved.importContext).toEqual(editable.importContext);
    const original = await make('original');
    await expect(service.stage(owner, original.document.id, input(original))).rejects.toThrow();
    const missing = await make('editable', [
      {
        id: 'captions',
        kind: 'captions',
        label: 'Subtítulos',
        sceneId: 'intro',
        resolution: 'pending',
        startMs: 0,
      },
    ]);
    const blocked = await service.stage(owner, missing.document.id, input(missing));
    expect(blocked.diagnostics).toContainEqual(expect.objectContaining({ code: 'import-slot' }));
    expect((await projects.get(owner, missing.document.id)).document.scenes).toEqual(
      missing.document.scenes
    );
    await expect(
      service.stage(owner, editable.document.id, {
        ...input(saved),
        importContext: missing.importContext,
      })
    ).rejects.toThrow();
  } finally {
    await fixture.close();
  }
});
