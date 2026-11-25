import { and, desc, eq, gt, sql } from 'drizzle-orm';
import { z } from 'zod';
import { snapshotDigest } from '@workspace/render-contract/export';
import {
  validateSnapshot,
  type ExportSnapshot,
  type RenderResult,
} from '@workspace/render-contract';
import { db } from '@/server/db';
import { jobs, queueTasks, studioProjects } from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';
import { leaseDeadline, queueService, type ClaimedTask } from '../queue-service';
import type { Job } from '../job-history-service';
import { ProjectNotFoundError, readBaseRevision, toRecord } from './project-service';
import { AssetService } from './asset-service';
import { LibraryService } from './library-service';
import { snapshotBuilder } from './snapshot-service';

const request = z.strictObject({
  baseRevision: z.uuid(),
  idempotencyKey: z.string().min(1).max(128),
});
export class ExportKeyCollision extends Error {}
export class LostExportAttempt extends Error {}
export class InvalidExport extends Error {}
export class ExportAttemptFailure extends Error {}
type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
interface ExportInput {
  kind: 'studio-export-v1';
  projectId: string;
  idempotencyKey: string;
  snapshot: ExportSnapshot;
  snapshotHash: string;
}
export function storedExport(job: Job): ExportInput {
  const input = job.inputData as ExportInput | null;
  if (
    job.type !== 'studio_export' ||
    input?.kind !== 'studio-export-v1' ||
    input.snapshot.ownerId !== job.userId ||
    input.snapshot.document.id !== input.projectId
  )
    throw Error('La instantánea de exportación no es válida.');
  return input;
}
export interface ExportJob {
  id: string;
  projectId: string;
  revision: string;
  engine: ExportSnapshot['document']['engine'];
  snapshotHash: string;
  status: 'queued' | 'running' | 'cancelling' | 'cancelled' | 'completed' | 'failed';
  attemptId: string | null;
  progress: number;
  artifacts: { name: string; url: string; sha256: string }[];
  error: string | null;
}
interface Published {
  result: RenderResult;
  manifestHash: string;
}
type ExportSummary = Awaited<ReturnType<typeof query>>[number];
function project(job: ExportSummary): ExportJob {
  const published = job.status === 'completed' ? job.published : null;
  const files = published
    ? [
        ...published.result.artifacts,
        { relativePath: 'manifest.json', sha256: published.manifestHash },
      ]
    : [];
  return {
    id: job.id,
    projectId: job.projectId,
    revision: job.revision,
    engine: job.engine,
    snapshotHash: job.snapshotHash,
    status:
      job.status === 'processing' ? 'running' : job.status === 'pending' ? 'queued' : job.status,
    attemptId: job.attemptId,
    progress: job.progress,
    error: job.errorMessage,
    artifacts: files.map((file) => ({
      name: file.relativePath,
      sha256: file.sha256,
      url: '/api/studio/exports/' + job.id + '/artifacts/' + file.relativePath,
    })),
  };
}
const owned = (owner: string) => and(eq(jobs.type, 'studio_export'), eq(jobs.userId, owner));
const projectMatch = (id: string) => sql`${jobs.inputData}->>'projectId' = ${id}`;
function query(tx: Pick<Tx, 'select'>) {
  return tx
    .select({
      id: jobs.id,
      projectId: sql<string>`${jobs.inputData}->>'projectId'`,
      revision: sql<string>`${jobs.inputData}#>>'{snapshot,revision}'`,
      engine: sql<ExportJob['engine']>`${jobs.inputData}#>>'{snapshot,document,engine}'`,
      snapshotHash: sql<string>`${jobs.inputData}->>'snapshotHash'`,
      attemptId: queueTasks.attemptId,
      progress: jobs.progress,
      status: jobs.status,
      errorMessage: jobs.errorMessage,
      published: sql<Published | null>`${jobs.resultData}`,
    })
    .from(jobs)
    .innerJoin(queueTasks, eq(queueTasks.jobId, jobs.id));
}
const missing = () => new ProjectNotFoundError('Exportación no encontrada.');
async function fenced(tx: Tx, claim: ClaimedTask) {
  const { task, job } = claim;
  if (job.type !== 'studio_export' || !task.attemptId) throw new LostExportAttempt();
  // Read the database clock after acquiring the lock, including when another transaction held it.
  await tx
    .select({ id: queueTasks.id })
    .from(queueTasks)
    .where(eq(queueTasks.id, task.id))
    .for('update');
  const [row] = await tx
    .select({ task: queueTasks })
    .from(queueTasks)
    .innerJoin(jobs, eq(jobs.id, queueTasks.jobId))
    .where(
      and(
        eq(queueTasks.id, task.id),
        eq(queueTasks.jobId, job.id),
        eq(queueTasks.attemptId, task.attemptId),
        sql`${jobs.resultData}->>'cancelLeaseId' is not distinct from ${claim.cancelLeaseId ?? null}::text`,
        gt(queueTasks.leaseUntil, sql`clock_timestamp()`),
        sql`${queueTasks.status} in ('processing','cancelling')`
      )
    );
  if (!row) throw new LostExportAttempt();
  return row.task;
}

export class ExportService {
  async enqueue(owner: string, id: string, body: unknown): Promise<ExportJob> {
    const parsed = request.safeParse(body);
    if (!parsed.success)
      throw new ValidationError('La revisión o la clave de exportación no es válida.');
    if (!z.uuid().safeParse(id).success) throw new ProjectNotFoundError();
    id = id.toLowerCase();
    const { baseRevision, idempotencyKey } = parsed.data;
    const queue = await queueService.ensureQueue(process.env.WORKER_QUEUE_NAME ?? 'default');
    return db.transaction(async (tx) => {
      // Serialize admissions with edits and other admissions for this project.
      const [lock] = await tx
        .select({ id: studioProjects.id })
        .from(studioProjects)
        .where(and(eq(studioProjects.id, id), eq(studioProjects.ownerId, owner)))
        .for('update');
      if (!lock) throw new ProjectNotFoundError();
      const [existing] = await query(tx).where(
        and(
          owned(owner),
          projectMatch(id),
          sql`${jobs.inputData}->>'idempotencyKey' = ${idempotencyKey}`
        )
      );
      if (existing) {
        const job = project(existing);
        if (job.revision !== baseRevision)
          throw new ExportKeyCollision('La clave ya corresponde a otra revisión.');
        return job;
      }
      const row = await readBaseRevision(tx, owner, id, baseRevision);
      const build = snapshotBuilder(
        new AssetService(tx),
        new LibraryService(tx),
        async (jobId, ownerId) => {
          const [job] = await tx
            .select()
            .from(jobs)
            .where(and(eq(jobs.id, jobId), eq(jobs.userId, ownerId)));
          return job ?? null;
        }
      );
      const snapshot = await build(owner, toRecord(owner, row));
      const diagnostic = validateSnapshot(snapshot).find((d) => d.severity === 'error');
      if (diagnostic) throw new ValidationError(diagnostic.message);
      const input: ExportInput = {
        kind: 'studio-export-v1',
        projectId: id,
        idempotencyKey,
        snapshot,
        snapshotHash: snapshotDigest(snapshot),
      };
      const job = await queueService.enqueueInTransaction(tx, queue.id, {
        userId: owner,
        type: 'studio_export',
        inputData: input,
      });
      const [created] = await query(tx).where(eq(jobs.id, job.id));
      return project(created!);
    });
  }
  async list(owner: string, id: string) {
    const rows = await query(db)
      .where(and(owned(owner), projectMatch(id)))
      .orderBy(desc(jobs.createdAt))
      .limit(100);
    return rows.map(project);
  }
  async get(owner: string, id: string): Promise<ExportJob> {
    if (!z.uuid().safeParse(id).success) throw missing();
    const [row] = await query(db).where(and(owned(owner), eq(jobs.id, id)));
    if (!row) throw missing();
    return project(row);
  }
  async cancel(owner: string, id: string): Promise<ExportJob> {
    if (!z.uuid().safeParse(id).success) throw missing();
    return db.transaction(async (tx) => {
      const [row] = await query(tx)
        .where(and(owned(owner), eq(jobs.id, id)))
        .for('update', { of: queueTasks });
      if (!row) throw missing();
      const [fresh] = await query(tx).where(eq(jobs.id, id));
      const prev = project(fresh!);
      if (!['queued', 'running'].includes(prev.status)) return prev;
      // Even without a POST acknowledgement or valid lease, the renderer may be executing this UUID.
      const status = prev.attemptId ? 'cancelling' : 'cancelled';
      await tx
        .update(queueTasks)
        .set({
          status,
          leaseUntil: prev.attemptId
            ? sql`coalesce(${queueTasks.leaseUntil}, clock_timestamp())`
            : null,
        })
        .where(eq(queueTasks.jobId, id));
      await tx
        .update(jobs)
        .set({ status, completedAt: prev.attemptId ? null : sql`clock_timestamp()` })
        .where(eq(jobs.id, id));
      return { ...prev, status };
    });
  }
  async heartbeat(claim: ClaimedTask, progress?: number) {
    return db.transaction(async (tx) => {
      const row = await fenced(tx, claim);
      if (row.status === 'cancelling') throw new LostExportAttempt('Cancelación solicitada.');
      await tx
        .update(queueTasks)
        .set({ leaseUntil: leaseDeadline })
        .where(eq(queueTasks.id, row.id));
      if (progress !== undefined)
        await tx
          .update(jobs)
          .set({ progress: Math.min(99, Math.max(0, Math.round(progress))) })
          .where(eq(jobs.id, row.jobId));
    });
  }
  async receipt(claim: ClaimedTask) {
    return db.transaction(async (tx) => {
      const row = await fenced(tx, claim);
      if (row.status !== 'processing') throw new LostExportAttempt();
      await tx
        .update(jobs)
        .set({ resultData: { remoteAttemptId: row.attemptId } })
        .where(eq(jobs.id, row.jobId));
    });
  }
  async promote(claim: ClaimedTask, published: Published, rename: () => Promise<void>) {
    await db.transaction(async (tx) => {
      const row = await fenced(tx, claim);
      if (row.status !== 'processing') throw new LostExportAttempt();
      await rename();
      // A stalled filesystem rename may have outlived the lease. Roll back the receipt.
      await fenced(tx, claim);
      await tx
        .update(queueTasks)
        .set({ status: 'completed', leaseUntil: null })
        .where(eq(queueTasks.id, row.id));
      await tx
        .update(jobs)
        .set({
          status: 'completed',
          progress: 100,
          resultData: published,
          completedAt: sql`clock_timestamp()`,
        })
        .where(eq(jobs.id, row.jobId));
    });
  }
  async finishAttempt(claim: ClaimedTask, cause: unknown, remoteStopped = false) {
    await db
      .transaction(async (tx) => {
        const row = await fenced(tx, claim);
        const cancelled = row.status === 'cancelling';
        if (cancelled && !remoteStopped) {
          // The renderer may be unavailable. Let another worker repeat only the authenticated DELETE.
          await tx
            .update(queueTasks)
            .set({ leaseUntil: sql`clock_timestamp()+interval '2 seconds'` })
            .where(eq(queueTasks.id, row.id));
          return;
        }
        const retry =
          !cancelled && !(cause instanceof InvalidExport) && row.attempts < row.maxRetries;
        const status = cancelled ? 'cancelled' : retry ? 'queued' : 'failed';
        await tx
          .update(queueTasks)
          .set({
            status: retry ? 'pending' : status,
            leaseUntil: null,
            nextRetryAt: retry ? sql`clock_timestamp()+interval '5 seconds'` : null,
          })
          .where(eq(queueTasks.id, row.id));
        await tx
          .update(jobs)
          .set({
            status,
            resultData: null,
            completedAt: retry ? null : sql`clock_timestamp()`,
            errorMessage:
              status === 'failed'
                ? cause instanceof InvalidExport || cause instanceof ExportAttemptFailure
                  ? cause.message
                  : 'No se pudo completar la exportación.'
                : null,
          })
          .where(eq(jobs.id, row.jobId));
      })
      .catch((e) => {
        if (!(e instanceof LostExportAttempt)) throw e;
      });
  }
}
export const exportsService = new ExportService();
