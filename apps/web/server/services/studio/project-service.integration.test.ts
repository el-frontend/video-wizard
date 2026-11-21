import { randomUUID } from 'node:crypto';
import { validateForExport, type LibraryEntry } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { eq, sql } from 'drizzle-orm';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';

import { studioProjectRevisions } from '@/server/db/schema';
import { openStudioTestDb } from '@/test/studio-db';
import { ValidationError } from '@/server/lib/utils';

import { ConflictError, ProjectNotFoundError, ProjectService } from './project-service';

describe('ProjectService with PostgreSQL', () => {
  let fixture: Awaited<ReturnType<typeof openStudioTestDb>>;
  let service: ProjectService;
  let owner: string;
  let otherOwner: string;

  beforeAll(async () => {
    fixture = await openStudioTestDb();
    owner = await fixture.createOwner();
    otherOwner = await fixture.createOwner();
    service = new ProjectService(fixture.db);
  }, 15_000);

  afterAll(async () => fixture?.close());

  function create() {
    return service.create(owner, {
      title: 'Proyecto editorial',
      engine: 'remotion',
      canvas: { width: 1920, height: 1080, fps: 24 },
    });
  }

  it('creates a blank project with a server-issued revision and authenticated owner', async () => {
    const created = await create();
    expect(created.ownerId).toBe(owner);
    expect(created.document).toMatchObject({
      schemaVersion: 1,
      title: 'Proyecto editorial',
      engine: 'remotion',
      canvas: { width: 1920, height: 1080, fps: 24 },
      scenes: [],
      globalAudio: [],
      durationMs: 0,
    });
    expect(await service.get(owner, created.document.id)).toEqual(created);
    const page = await service.history(owner, created.document.id);
    expect(page).toEqual({
      items: [
        {
          revision: created.revision,
          authorId: owner,
          createdAt: created.updatedAt,
          operation: 'create',
        },
      ],
      nextCursor: null,
    });
  });

  it('rolls back the entire prepared project batch and history when the second insert fails', async () => {
    const first = { ...exampleProject(), id: randomUUID() };
    await expect(service.createFromDocuments(owner, [first, first])).rejects.toThrow();
    await expect(service.get(owner, first.id)).rejects.toThrow(ProjectNotFoundError);
    const history = await fixture.db
      .select()
      .from(studioProjectRevisions)
      .where(eq(studioProjectRevisions.projectId, first.id));
    expect(history).toEqual([]);
  });

  it('commits one competing save and reports the winning document to the other writer', async () => {
    const created = await create();
    const variants = ['Titular editado a mano', 'Propuesta del asistente'].map((headline) => {
      const document = exampleProject();
      document.id = created.document.id;
      document.scenes[0].editorial = { headline, narration: 'Hola' };
      return document;
    });
    const saves = await Promise.allSettled(
      variants.map((document) =>
        service.save(owner, created.document.id, { baseRevision: created.revision, document })
      )
    );
    const winner = saves.find((save) => save.status === 'fulfilled');
    const loser = saves.find((save) => save.status === 'rejected');

    expect(saves.filter((save) => save.status === 'fulfilled')).toHaveLength(1);
    expect(loser?.reason).toBeInstanceOf(ConflictError);
    expect(loser?.reason.current).toEqual(winner?.value);
    const current = await service.get(owner, created.document.id);
    expect(current).toEqual(winner?.value);
    expect(current.document).toEqual(saves[0].status === 'fulfilled' ? variants[0] : variants[1]);
    const page = await service.history(owner, created.document.id);
    expect(page.items.map(({ revision, operation }) => ({ revision, operation }))).toEqual([
      { revision: current.revision, operation: 'save' },
      { revision: created.revision, operation: 'create' },
    ]);
  });

  it('hides projects and their operations from another authenticated owner', async () => {
    const { document, revision } = await create();
    const operations = [
      () => service.get(otherOwner, document.id),
      () => service.save(otherOwner, document.id, { baseRevision: revision, document }),
      () => service.history(otherOwner, document.id),
      () =>
        service.restore(otherOwner, document.id, {
          baseRevision: revision,
          targetRevision: revision,
        }),
      () => service.duplicate(otherOwner, document.id, { baseRevision: revision }),
    ];

    for (const operation of operations)
      await expect(operation()).rejects.toBeInstanceOf(ProjectNotFoundError);
    expect((await service.history(owner, document.id)).items).toHaveLength(1);
  });

  it('restores into a new head and keeps both original snapshots available', async () => {
    const initial = await create();
    const id = initial.document.id;
    const saved = await service.save(owner, id, {
      baseRevision: initial.revision,
      document: { ...exampleProject(), id },
    });

    await expect(
      service.restore(owner, id, {
        baseRevision: initial.revision,
        targetRevision: saved.revision,
      })
    ).rejects.toMatchObject({ current: saved });

    const foreignProject = await create();
    await expect(
      service.restore(owner, id, {
        baseRevision: saved.revision,
        targetRevision: foreignProject.revision,
      })
    ).rejects.toBeInstanceOf(ProjectNotFoundError);

    const restored = await service.restore(owner, id, {
      baseRevision: saved.revision,
      targetRevision: initial.revision,
    });
    expect(restored.revision).not.toBe(initial.revision);
    expect(restored.revision).not.toBe(saved.revision);
    expect(restored.document).toEqual(initial.document);
    expect(await service.get(owner, id)).toEqual(restored);
    const page = await service.history(owner, id);
    expect(page.items.map(({ revision, operation }) => ({ revision, operation }))).toEqual([
      { revision: restored.revision, operation: 'restore' },
      { revision: saved.revision, operation: 'save' },
      { revision: initial.revision, operation: 'create' },
    ]);

    const recovered = await service.restore(owner, id, {
      baseRevision: restored.revision,
      targetRevision: saved.revision,
    });
    expect(recovered.document).toEqual(saved.document);
  });

  it.each([
    ['título vacío', { title: '  ' }],
    ['duración incoherente', { durationMs: 1 }],
    ['motor distinto', { engine: 'hyperframes' }],
    ['identificador distinto', { id: 'otro-proyecto' }],
    ['propietario en el documento', { ownerId: 'otro-propietario' }],
  ])('rejects a save with %s before writing a revision', async (_name, patch) => {
    const created = await create();
    const id = created.document.id;
    await expect(
      service.save(owner, id, {
        baseRevision: created.revision,
        document: { ...created.document, ...patch },
      })
    ).rejects.toBeInstanceOf(ValidationError);
    expect(await service.get(owner, id)).toEqual(created);
    expect((await service.history(owner, id)).items).toHaveLength(1);
  });

  it('rejects a forged owner when creating a project', async () => {
    await expect(
      service.create(owner, { title: 'Proyecto', engine: 'remotion', ownerId: otherOwner })
    ).rejects.toBeInstanceOf(ValidationError);
  });

  it('duplicates the snapshot for another engine while keeping incompatible references editable', async () => {
    const initial = await create();
    const id = initial.document.id;
    const document = { ...exampleProject(), id };
    document.scenes[0].templateRef = { id: 'opener', version: 1 };
    const saved = await service.save(owner, id, { baseRevision: initial.revision, document });

    await expect(
      service.duplicate(owner, id, { baseRevision: initial.revision, engine: 'hyperframes' })
    ).rejects.toMatchObject({ current: saved });

    const duplicate = await service.duplicate(owner, id, {
      baseRevision: saved.revision,
      engine: 'hyperframes',
    });
    const duplicateId = duplicate.document.id;
    expect(duplicateId).not.toBe(id);
    expect(duplicate.revision).not.toBe(saved.revision);
    expect(duplicate.ownerId).toBe(owner);
    expect(duplicate.document).toEqual({ ...document, id: duplicateId, engine: 'hyperframes' });
    expect(await service.get(owner, id)).toEqual(saved);
    expect(await service.get(owner, duplicateId)).toEqual(duplicate);
    const history = await service.history(owner, duplicateId);
    expect(history.items.map(({ operation }) => operation)).toEqual(['duplicate']);

    const manifest = { version: 1 as const, props: {} };
    const library: LibraryEntry[] = [
      { kind: 'style', id: 'estilo', version: 2, name: 'Estilo', assetIds: [], tokens: {} },
      { kind: 'brand', id: 'marca', version: 1, name: 'Marca', assetIds: [], values: {} },
      {
        kind: 'template',
        id: 'opener',
        version: 1,
        name: 'Inicio',
        assetIds: [],
        engine: 'remotion',
        manifest,
      },
      {
        kind: 'template',
        id: 'sub',
        version: 3,
        name: 'Subtítulos',
        assetIds: [],
        engine: 'remotion',
        manifest,
      },
      {
        kind: 'component',
        id: 'card',
        version: 1,
        name: 'Tarjeta',
        assetIds: [],
        engine: 'remotion',
        manifest: { version: 1, props: { headline: { type: 'string' } } },
      },
    ];
    expect(validateForExport(document, { library })).toEqual([]);
    expect(
      validateForExport(duplicate.document, { library }).map(({ code, sceneId, layerId }) => ({
        code,
        sceneId,
        layerId,
      }))
    ).toEqual([
      { code: 'engine-mismatch', sceneId: 'intro', layerId: undefined },
      { code: 'engine-mismatch', sceneId: 'intro', layerId: 'captions' },
      { code: 'engine-mismatch', sceneId: 'intro', layerId: 'card' },
    ]);
  });

  it('paginates newest-first using a revision cursor scoped to the project', async () => {
    const initial = await create();
    const id = initial.document.id;
    let current = initial;
    const revisions = [initial.revision];
    for (let index = 0; index < 25; index++) {
      current = await service.save(owner, id, {
        document: { ...current.document, title: `Edición ${index}` },
        baseRevision: current.revision,
      });
      revisions.unshift(current.revision);
    }

    const page = await service.history(owner, id);
    expect(page.items.map(({ revision }) => revision)).toEqual(revisions.slice(0, 25));
    expect(page.nextCursor).toBe(revisions[24]);
    const nextPage = await service.history(owner, id, page.nextCursor!);
    expect(nextPage.items.map(({ revision }) => revision)).toEqual([initial.revision]);
    expect(nextPage.nextCursor).toBeNull();
    await expect(service.history(owner, id, randomUUID())).rejects.toBeInstanceOf(ValidationError);
  });

  it('lists no projects when the owner has none', async () => {
    const listOwner = await fixture.createOwner();
    await create();
    expect(await service.list(listOwner)).toEqual({ items: [], nextCursor: null });
  });

  it('paginates the owner’s summaries by timestamp and ID without writing revisions', async () => {
    const listOwner = await fixture.createOwner();
    const projects = [];
    for (let index = 0; index < 26; index++) {
      projects.push(
        await service.create(listOwner, { title: `Proyecto ${index}`, engine: 'remotion' })
      );
    }
    await create();
    const tiedTime = '2025-01-01T00:00:00.000Z';
    const ordered = [...projects].sort((first, second) =>
      second.document.id.localeCompare(first.document.id)
    );
    await fixture.db
      .update(studioProjectRevisions)
      .set({ createdAt: new Date(tiedTime) })
      .where(eq(studioProjectRevisions.authorId, listOwner));
    await fixture.db
      .update(studioProjectRevisions)
      .set({ createdAt: sql`${tiedTime}::timestamptz + interval '500 microseconds'` })
      .where(eq(studioProjectRevisions.revision, ordered[25].revision));

    const page = await service.list(listOwner);
    expect(page.items).toEqual(
      ordered.slice(0, 25).map(({ document, revision }) => ({
        id: document.id,
        revision,
        title: document.title,
        engine: 'remotion',
        canvas: { width: 1080, height: 1920, fps: 30 },
        durationMs: 0,
        updatedAt: tiedTime,
      }))
    );
    expect(page.nextCursor).toBeTypeOf('string');
    const nextPage = await service.list(listOwner, page.nextCursor ?? undefined);
    expect(nextPage.items.map(({ id }) => id)).toEqual([ordered[25].document.id]);
    expect(nextPage.nextCursor).toBeNull();
    expect(
      await fixture.db.$count(
        studioProjectRevisions,
        eq(studioProjectRevisions.authorId, listOwner)
      )
    ).toBe(26);

    const anchor = ordered[24];
    const updated = await service.save(listOwner, anchor.document.id, {
      baseRevision: anchor.revision,
      document: { ...anchor.document, title: 'Proyecto editado' },
    });
    const latestPage = await service.list(listOwner);
    expect(latestPage.items[0]).toMatchObject({
      id: updated.document.id,
      title: 'Proyecto editado',
      revision: updated.revision,
      updatedAt: updated.updatedAt,
    });
    expect(await service.list(listOwner, page.nextCursor ?? undefined)).toEqual(nextPage);
  });

  it('lists persisted titles containing valid JSON escapes', async () => {
    const listOwner = await fixture.createOwner();
    const title = 'Proyecto con \u0000 en el título';
    const project = await service.create(listOwner, { title, engine: 'remotion' });
    expect((await service.list(listOwner)).items).toMatchObject([
      { id: project.document.id, title },
    ]);
  });

  it('rejects malformed, unknown and foreign collection cursors', async () => {
    const foreign = await create();
    for (const cursor of ['', 'cursor inválido', randomUUID(), foreign.revision]) {
      await expect(service.list(otherOwner, cursor)).rejects.toBeInstanceOf(ValidationError);
    }
  });

  it('returns authenticated summaries and reports invalid cursors as HTTP 400', async () => {
    const listOwner = await fixture.createOwner();
    const initial = await service.create(listOwner, {
      title: 'Proyecto de la sesión',
      engine: 'hyperframes',
    });
    const { document, revision, updatedAt } = await service.save(listOwner, initial.document.id, {
      baseRevision: initial.revision,
      document: {
        ...exampleProject(),
        id: initial.document.id,
        title: initial.document.title,
        engine: initial.document.engine,
      },
    });
    await create();
    vi.doMock('@/server/db', () => ({ db: fixture.db }));
    vi.doMock('@/server/lib/auth', () => ({
      requireAuth: async () => ({ id: listOwner }),
      UnauthorizedError: class UnauthorizedError extends Error {},
    }));

    try {
      const route = await import('@/app/api/studio/projects/route');
      expect(route.GET).toBeTypeOf('function');
      const response = await route.GET(new NextRequest('http://localhost/api/studio/projects'));
      expect(response.status).toBe(200);
      expect(await response.json()).toEqual({
        success: true,
        data: {
          items: [
            {
              id: document.id,
              revision,
              title: 'Proyecto de la sesión',
              engine: 'hyperframes',
              canvas: { width: 1080, height: 1920, fps: 30 },
              durationMs: 7200,
              updatedAt,
            },
          ],
          nextCursor: null,
        },
      });
      const bad = await route.GET(
        new NextRequest('http://localhost/api/studio/projects?cursor=mal')
      );
      expect(bad.status).toBe(400);
      expect(await bad.json()).toMatchObject({ success: false, error: expect.any(String) });
    } finally {
      vi.doUnmock('@/server/db');
      vi.doUnmock('@/server/lib/auth');
    }
  });
});
