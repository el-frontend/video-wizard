import { randomUUID } from 'node:crypto';
import {
  EngineIdSchema,
  IdSchema,
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

function toRecord(
  ownerId: string,
  revision: { revision: string; document: ProjectDraft; createdAt: Date }
): ProjectRecord {
  return {
    ownerId,
    revision: revision.revision,
    document: revision.document,
    updatedAt: revision.createdAt.toISOString(),
  };
}

async function currentRevision(db: ProjectDb, ownerId: string, id: string) {
  const [current] = await db
    .select({
      engine: studioProjects.engine,
      revision: studioProjectRevisions.revision,
      document: studioProjectRevisions.document,
      sequence: studioProjectRevisions.sequence,
      createdAt: studioProjectRevisions.createdAt,
    })
    .from(studioProjects)
    .innerJoin(studioProjectRevisions, currentRevisionJoin)
    .where(ownedProject(ownerId, id));

  if (!current) throw new ProjectNotFoundError();
  return current;
}

async function revisionForProject(db: ProjectDb, projectId: string, revision: string) {
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

async function readBaseRevision(db: ProjectDb, ownerId: string, id: string, baseRevision: string) {
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
  operation: RevisionOperation
): Promise<ProjectRecord> {
  const [snapshot] = await db
    .insert(studioProjectRevisions)
    .values({ projectId: document.id, authorId: ownerId, revision, sequence, document, operation })
    .returning();
  return toRecord(ownerId, snapshot);
}

async function insertProject(
  db: ProjectDb,
  ownerId: string,
  document: ProjectDraft,
  operation: 'create' | 'duplicate'
): Promise<ProjectRecord> {
  const revision = randomUUID();
  await db
    .insert(studioProjects)
    .values({ id: document.id, engine: document.engine, ownerId, revision });
  return insertRevision(db, ownerId, document, revision, 1, operation);
}

async function advanceRevision(
  db: ProjectDb,
  ownerId: string,
  base: { revision: string; sequence: number },
  document: ProjectDraft,
  operation: 'save' | 'restore'
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
  return insertRevision(db, ownerId, document, revision, base.sequence + 1, operation);
}

export class ProjectService {
  constructor(private readonly db: Database) {}

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
    const document = parseInput(
      ProjectDraftSchema,
      input,
      'El documento de la plantilla no es válido.'
    );
    return this.db.transaction((tx) => insertProject(tx, ownerId, document, 'create'));
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
      return advanceRevision(tx, ownerId, base, document, 'save');
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
      return advanceRevision(tx, ownerId, base, target.document, 'restore');
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
      return insertProject(tx, ownerId, document, 'duplicate');
    });
  }
}
