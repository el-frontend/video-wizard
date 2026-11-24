import { validateSnapshot } from '@workspace/render-contract';
import { repairMaster } from './import-narration';
import { AssetService } from './asset-service';
import { LibraryService } from './library-service';
import { randomUUID } from 'node:crypto';
import {
  validComponentProps,
  EngineIdSchema,
  IdSchema,
  ImportContextSchema,
  type ImportContext,
  LibraryRefSchema,
  projectDurationMs,
  ProjectDraftSchema,
  type ProjectDraft,
  type ProjectPage,
  type ProjectRecord,
  type ProjectSummary,
} from '@workspace/video-project';
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import { z } from 'zod';

import type { db } from '@/server/db';
import {
  studioLibraries,
  studioImports,
  studioProjectRevisions,
  studioProjects,
  studioRevisionOperation,
} from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';

const HISTORY_PAGE_SIZE = 25;
const PROJECT_PAGE_SIZE = 25;
const READ_COMMITTED = { isolationLevel: 'read committed' } as const;
const uuidSchema = z.uuid();
const currentRevisionJoin = and(
  eq(studioProjectRevisions.projectId, studioProjects.id),
  eq(studioProjectRevisions.revision, studioProjects.revision)
);
const createInput = z.strictObject({
  title: IdSchema.trim(),
  engine: EngineIdSchema,
  canvas: ProjectDraftSchema.shape.canvas.default({ width: 1080, height: 1920, fps: 30 }),
});
const saveInput = z.strictObject({ baseRevision: IdSchema, document: ProjectDraftSchema });
const restoreInput = z.strictObject({ baseRevision: IdSchema, targetRevision: uuidSchema });
const duplicateInput = z.strictObject({
  baseRevision: IdSchema,
  engine: EngineIdSchema.optional(),
});

type Database = typeof db;
type ProjectDb = Pick<Database, 'select' | 'insert' | 'update'>;
type RevisionOperation = (typeof studioRevisionOperation.enumValues)[number];

export interface RevisionSummary {
  revision: string;
  authorId: string;
  createdAt: string;
  operation: RevisionOperation;
}

export interface RevisionPage {
  items: RevisionSummary[];
  nextCursor: string | null;
}

export class ConflictError extends Error {
  constructor(public readonly current: ProjectRecord) {
    super('Hay una revisión más reciente del proyecto.');
    this.name = 'ConflictError';
  }
}

export class ProjectNotFoundError extends Error {
  constructor(message = 'Proyecto no encontrado.') {
    super(message);
    this.name = 'ProjectNotFoundError';
  }
}

function parseInput<T>(schema: z.ZodType<T>, input: unknown, message: string): T {
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw new ValidationError(message);
  return parsed.data;
}

function ownedProject(ownerId: string, id: string) {
  if (!uuidSchema.safeParse(id).success) throw new ProjectNotFoundError();
  return and(eq(studioProjects.id, id), eq(studioProjects.ownerId, ownerId));
}

export function toRecord(
  ownerId: string,
  revision: {
    revision: string;
    document: ProjectDraft;
    createdAt: Date;
    importContext?: ImportContext | null;
  }
): ProjectRecord {
  return {
    ownerId,
    revision: revision.revision,
    document: revision.document,
    ...(revision.importContext && { importContext: revision.importContext }),
    updatedAt: revision.createdAt.toISOString(),
  };
}

export async function currentRevision(db: ProjectDb, ownerId: string, id: string) {
  const [current] = await db
    .select({
      engine: studioProjects.engine,
      revision: studioProjectRevisions.revision,
      document: studioProjectRevisions.document,
      importContext: studioProjectRevisions.importContext,
      sequence: studioProjectRevisions.sequence,
      createdAt: studioProjectRevisions.createdAt,
    })
    .from(studioProjects)
    .innerJoin(studioProjectRevisions, currentRevisionJoin)
    .where(ownedProject(ownerId, id));

  if (!current) throw new ProjectNotFoundError();
  return current;
}

export async function revisionForProject(db: ProjectDb, projectId: string, revision: string) {
  const [snapshot] = await db
    .select()
    .from(studioProjectRevisions)
    .where(
      and(
        eq(studioProjectRevisions.projectId, projectId),
        eq(studioProjectRevisions.revision, revision)
      )
    );
  return snapshot;
}

export async function readBaseRevision(
  db: ProjectDb,
  ownerId: string,
  id: string,
  baseRevision: string
) {
  const current = await currentRevision(db, ownerId, id);
  if (current.revision !== baseRevision) throw new ConflictError(toRecord(ownerId, current));
  return current;
}

async function insertRevision(
  db: ProjectDb,
  ownerId: string,
  document: ProjectDraft,
  revision: string,
  sequence: number,
  operation: RevisionOperation,
  importContext?: ImportContext | null
): Promise<ProjectRecord> {
  const [snapshot] = await db
    .insert(studioProjectRevisions)
    .values({
      projectId: document.id,
      authorId: ownerId,
      revision,
      sequence,
      document,
      operation,
      importContext,
    })
    .returning();
  return toRecord(ownerId, snapshot);
}

async function insertProject(
  db: ProjectDb,
  ownerId: string,
  document: ProjectDraft,
  operation: 'create' | 'duplicate' | 'import',
  importContext?: ImportContext | null
): Promise<ProjectRecord> {
  const revision = randomUUID();
  await db
    .insert(studioProjects)
    .values({ id: document.id, engine: document.engine, ownerId, revision });
  return insertRevision(db, ownerId, document, revision, 1, operation, importContext);
}

export async function advanceRevision(
  db: ProjectDb,
  ownerId: string,
  base: { revision: string; sequence: number },
  document: ProjectDraft,
  operation: 'save' | 'restore' | 'repair',
  importContext?: ImportContext | null
): Promise<ProjectRecord> {
  const revision = randomUUID();
  const [updated] = await db
    .update(studioProjects)
    .set({ revision })
    .where(and(ownedProject(ownerId, document.id), eq(studioProjects.revision, base.revision)))
    .returning({ id: studioProjects.id });

  if (!updated) {
    const current = await currentRevision(db, ownerId, document.id);
    throw new ConflictError(toRecord(ownerId, current));
  }
  return insertRevision(
    db,
    ownerId,
    document,
    revision,
    base.sequence + 1,
    operation,
    importContext
  );
}

export class ProjectService {
  constructor(
    private readonly db: Database,
    private readonly dataDir?: string
  ) {}

  async create(ownerId: string, input: unknown): Promise<ProjectRecord> {
    const { title, engine, canvas } = parseInput(
      createInput,
      input,
      'Los datos del proyecto no son válidos.'
    );
    const document: ProjectDraft = {
      schemaVersion: 1,
      id: randomUUID(),
      title,
      engine,
      canvas,
      durationMs: 0,
      scenes: [],
      globalAudio: [],
      assetIds: [],
      styleRef: null,
      brandSnapshot: null,
    };
    return this.createFromDocument(ownerId, document);
  }

  async createFromDocument(ownerId: string, input: ProjectDraft): Promise<ProjectRecord> {
    const [record] = await this.createFromDocuments(ownerId, [input]);
    return record!;
  }

  async createFromDocuments(ownerId: string, inputs: ProjectDraft[]): Promise<ProjectRecord[]> {
    const documents = inputs.map((input) =>
      parseInput(ProjectDraftSchema, input, 'El documento del proyecto no es válido.')
    );
    return this.db.transaction(async (tx) => {
      const records: ProjectRecord[] = [];
      for (const document of documents)
        records.push(await insertProject(tx, ownerId, document, 'create'));
      return records;
    });
  }

  async get(ownerId: string, id: string): Promise<ProjectRecord> {
    return toRecord(ownerId, await currentRevision(this.db, ownerId, id));
  }

  async list(ownerId: string, cursor?: string): Promise<ProjectPage> {
    const { authorId, createdAt, document, projectId, revision } = studioProjectRevisions;
    // Use the precision of the ISO timestamp exposed in ProjectSummary.
    const updatedAt = sql`date_trunc('milliseconds', ${createdAt})`;
    let before;
    if (cursor !== undefined) {
      const message = 'El cursor de proyectos no es válido.';
      const parsed = parseInput(uuidSchema, cursor, message);
      // Resolve the page boundary from the immutable revision even after the project is edited.
      const [anchor] = await this.db
        .select({ projectId, createdAt })
        .from(studioProjectRevisions)
        .where(and(eq(authorId, ownerId), eq(revision, parsed)));
      if (!anchor) throw new ValidationError(message);
      before = sql`(${updatedAt}, ${studioProjects.id}) < (${anchor.createdAt.toISOString()}::timestamptz, ${anchor.projectId}::uuid)`;
    }

    const rows = await this.db
      .select({ document, revision, createdAt })
      .from(studioProjects)
      .innerJoin(studioProjectRevisions, currentRevisionJoin)
      .where(and(eq(studioProjects.ownerId, ownerId), before))
      .orderBy(desc(updatedAt), desc(studioProjects.id))
      .limit(PROJECT_PAGE_SIZE + 1);
    const items = rows.slice(0, PROJECT_PAGE_SIZE).map(
      ({ document, revision, createdAt }): ProjectSummary => ({
        id: document.id,
        title: document.title,
        engine: document.engine,
        canvas: document.canvas,
        durationMs: document.durationMs,
        revision,
        updatedAt: createdAt.toISOString(),
      })
    );
    return {
      items,
      nextCursor: rows.length > PROJECT_PAGE_SIZE ? items[PROJECT_PAGE_SIZE - 1].revision : null,
    };
  }

  async save(ownerId: string, id: string, input: unknown): Promise<ProjectRecord> {
    const { baseRevision, document } = parseInput(
      saveInput,
      input,
      'El documento o la revisión base no son válidos.'
    );
    return this.db.transaction(async (tx) => {
      const base = await readBaseRevision(tx, ownerId, id, baseRevision);
      if (document.id !== base.document.id) {
        throw new ValidationError('El identificador del proyecto no se puede cambiar.');
      }
      if (document.engine !== base.engine) {
        throw new ValidationError('Para cambiar de motor, duplica el proyecto.');
      }
      if (base.importContext?.mode === 'original')
        throw new ValidationError('Este original es de solo lectura.');
      for (const scene of document.scenes)
        for (const layer of scene.layers) {
          if (layer.type !== 'component') continue;
          const [pin] = await tx
            .select({ entry: studioLibraries.entry })
            .from(studioLibraries)
            .where(
              and(
                eq(studioLibraries.ownerId, ownerId),
                eq(studioLibraries.id, layer.componentRef.id),
                eq(studioLibraries.version, layer.componentRef.version)
              )
            );
          if (
            pin?.entry.kind === 'component' &&
            'schemaVersion' in pin.entry.manifest &&
            (pin.entry.engine !== document.engine ||
              !validComponentProps(layer.props, pin.entry.manifest))
          )
            throw new ValidationError('Las propiedades no coinciden con el componente fijado.');
        }
      return advanceRevision(tx, ownerId, base, document, 'save', base.importContext);
    }, READ_COMMITTED);
  }

  async history(ownerId: string, id: string, cursor?: string): Promise<RevisionPage> {
    const [project] = await this.db
      .select({ id: studioProjects.id })
      .from(studioProjects)
      .where(ownedProject(ownerId, id));
    if (!project) throw new ProjectNotFoundError();

    let before;
    if (cursor !== undefined) {
      const revision = parseInput(uuidSchema, cursor, 'El cursor del historial no es válido.');
      const snapshot = await revisionForProject(this.db, id, revision);
      if (!snapshot) throw new ValidationError('El cursor del historial no es válido.');
      before = lt(studioProjectRevisions.sequence, snapshot.sequence);
    }
    const rows = await this.db
      .select({
        revision: studioProjectRevisions.revision,
        authorId: studioProjectRevisions.authorId,
        createdAt: studioProjectRevisions.createdAt,
        operation: studioProjectRevisions.operation,
      })
      .from(studioProjectRevisions)
      .where(and(eq(studioProjectRevisions.projectId, id), before))
      .orderBy(desc(studioProjectRevisions.sequence))
      .limit(HISTORY_PAGE_SIZE + 1);
    const items = rows.slice(0, HISTORY_PAGE_SIZE).map((row) => ({
      ...row,
      createdAt: row.createdAt.toISOString(),
    }));
    return {
      items,
      nextCursor: rows.length > HISTORY_PAGE_SIZE ? items[HISTORY_PAGE_SIZE - 1].revision : null,
    };
  }

  async restore(ownerId: string, id: string, input: unknown): Promise<ProjectRecord> {
    const { baseRevision, targetRevision } = parseInput(
      restoreInput,
      input,
      'La revisión solicitada no es válida.'
    );
    return this.db.transaction(async (tx) => {
      const base = await readBaseRevision(tx, ownerId, id, baseRevision);
      const target = await revisionForProject(tx, id, targetRevision);
      if (!target) throw new ProjectNotFoundError('Revisión no encontrada.');
      if (base.importContext?.mode === 'original')
        throw new ValidationError('Este original es de solo lectura.');
      return advanceRevision(tx, ownerId, base, target.document, 'restore', target.importContext);
    }, READ_COMMITTED);
  }

  async importDocument(ownerId: string, input: ProjectDraft, metadata: ImportContext) {
    const document = parseInput(ProjectDraftSchema, input, 'Documento de importación no válido.');
    const context = ImportContextSchema.parse(metadata);
    const { kind, sourceId, hash } = context;
    return this.db.transaction(async (tx) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${JSON.stringify([ownerId, kind, sourceId, hash])}, 0))`
      );
      const [existing] = await tx
        .select()
        .from(studioImports)
        .where(
          and(
            eq(studioImports.ownerId, ownerId),
            eq(studioImports.kind, kind),
            eq(studioImports.sourceId, sourceId),
            eq(studioImports.hash, hash)
          )
        );
      if (existing)
        return toRecord(ownerId, await currentRevision(tx, ownerId, existing.projectId));
      const project = await insertProject(tx, ownerId, document, 'import', context);
      await tx
        .insert(studioImports)
        .values({ projectId: document.id, ownerId, kind, sourceId, hash });
      return project;
    }, READ_COMMITTED);
  }

  async copyDraft(ownerId: string, id: string, input: unknown) {
    const { baseRevision, document } = parseInput(saveInput, input, 'Borrador no válido.');
    return this.db.transaction(async (tx) => {
      await currentRevision(tx, ownerId, id);
      const base = await revisionForProject(
        tx,
        id,
        parseInput(uuidSchema, baseRevision, 'Revisión no válida.')
      );
      if (!base) throw new ProjectNotFoundError();
      if (
        document.id !== id ||
        document.engine !== base.document.engine ||
        base.importContext?.mode === 'original'
      )
        throw new ValidationError('Este borrador no corresponde al proyecto editable.');
      const { snapshotBuilder } = await import('./snapshot-service');
      const build = snapshotBuilder(
        new AssetService(tx, this.dataDir),
        new LibraryService(this.db, this.dataDir)
      );
      const snapshot = await build(ownerId, { ...toRecord(ownerId, base), document });
      // Incomplete timing and missing import slots are valid reasons to keep a draft copy.
      const editableIssues = new Set([
        'empty-project',
        'layer-overflow',
        'cue-overflow',
        'word-overflow',
        'scene-no-frame',
        'text-overflow',
        'import-slot',
      ]);
      const issue = validateSnapshot(snapshot).find(
        (d) => d.severity === 'error' && !editableIssues.has(d.code)
      );
      if (issue) throw new ValidationError(issue.message);
      return insertProject(
        tx,
        ownerId,
        { ...document, id: randomUUID() },
        'duplicate',
        base.importContext
      );
    });
  }

  async repairImport(ownerId: string, id: string, input: unknown) {
    const request = parseInput(
      z.strictObject({
        baseRevision: IdSchema,
        slotId: IdSchema,
        repair: z.discriminatedUnion('action', [
          z.strictObject({ action: z.literal('omit') }),
          z.strictObject({ action: z.literal('recheck') }),
          z.strictObject({ action: z.literal('replace'), assetId: z.uuid() }),
          z.strictObject({ action: z.literal('select-style'), ref: LibraryRefSchema }),
        ]),
      }),
      input,
      'Reparación no válida.'
    );
    return this.db.transaction(async (tx) => {
      const base = await readBaseRevision(tx, ownerId, id, request.baseRevision);
      const context = base.importContext;
      const slot = context?.slots.find(
        (s) => s.id === request.slotId && s.resolution === 'pending'
      );
      if (!context || context.mode !== 'editable' || !slot)
        throw new ValidationError('El recurso pendiente ya no está disponible.');
      const { repair } = request,
        doc = structuredClone(base.document);
      if (repair.action === 'recheck') {
        if (
          slot.kind !== 'video' ||
          !slot.assetId ||
          (await new AssetService(tx, this.dataDir).verify(ownerId, [slot.assetId])).length
        )
          throw new ValidationError('Vuelve a subir el mismo archivo de video en Recursos.');
      } else if (repair.action === 'omit' && slot.kind === 'video' && slot.assetId) {
        throw new ValidationError('Repón el video para conservar el fragmento acreditado.');
      } else if (repair.action === 'select-style') {
        const entry = await new LibraryService(this.db).get(ownerId, repair.ref);
        if (slot.kind !== 'style' || entry.kind !== 'style' || !entry.engines?.includes(doc.engine))
          throw new ValidationError('Elige un estilo compatible.');
        doc.styleRef = repair.ref;
      } else if (repair.action === 'replace') {
        const assets = new AssetService(tx, this.dataDir);
        const asset = await assets.get(ownerId, repair.assetId);
        if (
          slot.kind !== 'audio' ||
          !asset.hasAudio ||
          !asset.durationMs ||
          (await assets.verify(ownerId, [asset.id])).length
        )
          throw new ValidationError('Selecciona una toma disponible con audio y duración medida.');
        const audio = {
          id: randomUUID(),
          type: 'audio' as const,
          assetId: asset.id,
          startMs: slot.startMs,
          endMs: slot.startMs + asset.durationMs,
          endAnchor: 'fixed' as const,
          visible: true,
          zIndex: 0,
          volume: 1,
          sourceInMs: 0,
        };
        const scene = doc.scenes.find((s) => s.id === slot.sceneId);
        if (slot.sceneId && !scene)
          throw new ValidationError('La escena ya no existe. Puedes omitir la toma.');
        if (scene && context.narration) {
          context.narration.takes.push({
            sceneId: scene.id,
            assetId: asset.id,
            startMs: slot.startMs,
            durationMs: asset.durationMs,
            stale: true,
          });
        }
        if (!slot.sceneId && context.narration) {
          // The immutable first import is also the source of truth for historical draft copies.
          const [original] = await tx
            .select({ document: studioProjectRevisions.document })
            .from(studioImports)
            .innerJoin(
              studioProjectRevisions,
              and(
                eq(studioImports.projectId, studioProjectRevisions.projectId),
                eq(studioProjectRevisions.sequence, 1)
              )
            )
            .where(
              and(
                eq(studioImports.ownerId, ownerId),
                eq(studioImports.kind, context.kind),
                eq(studioImports.sourceId, context.sourceId),
                eq(studioImports.hash, context.hash)
              )
            );
          repairMaster(
            doc,
            context,
            audio,
            asset.durationMs,
            original?.document,
            !!slot.inactiveTake
          );
        } else if (scene && !slot.inactiveTake) scene.layers.push(audio);
        if (!doc.assetIds.includes(asset.id)) doc.assetIds.push(asset.id);
        doc.durationMs = projectDurationMs(doc);
      }
      slot.resolution = repair.action === 'omit' ? 'omitted' : 'replaced';
      return advanceRevision(tx, ownerId, base, ProjectDraftSchema.parse(doc), 'repair', context);
    }, READ_COMMITTED);
  }

  async duplicate(ownerId: string, id: string, input: unknown): Promise<ProjectRecord> {
    const { baseRevision, engine } = parseInput(
      duplicateInput,
      input,
      'Los datos de la copia no son válidos.'
    );
    return this.db.transaction(async (tx) => {
      const base = await readBaseRevision(tx, ownerId, id, baseRevision);
      const document = { ...base.document, id: randomUUID(), engine: engine ?? base.engine };
      return insertProject(tx, ownerId, document, 'duplicate', base.importContext);
    });
  }
}
