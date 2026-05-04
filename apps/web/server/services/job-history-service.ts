import { and, desc, eq, sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { jobs } from '@/server/db/schema';
import { ServiceError } from '@/server/lib/utils';

export type JobType = (typeof jobs.type.enumValues)[number];
export type JobStatus = (typeof jobs.status.enumValues)[number];

export type Job = typeof jobs.$inferSelect;

interface CreateJobInput {
  userId: string;
  type: JobType;
  inputData?: unknown;
}

interface ListJobsOptions {
  limit?: number;
  offset?: number;
  type?: JobType;
  status?: JobStatus;
}

/**
 * Job history service.
 *
 * Owns the lifecycle of a `jobs` row: create → markProcessing → progress
 * updates → complete | fail. Used by the API routes to give users a
 * persistent record of every transcription / analysis / render they run.
 *
 * All "by user" queries scope by userId so users only ever see their own
 * jobs. Mutating methods that target an existing row also accept userId
 * to defend against accidental cross-user writes.
 */
class JobHistoryService {
  async create({ userId, type, inputData }: CreateJobInput): Promise<Job> {
    const [created] = await db
      .insert(jobs)
      .values({
        userId,
        type,
        status: 'pending',
        inputData: inputData as never,
      })
      .returning();

    if (!created) {
      throw new ServiceError('Failed to create job record');
    }

    return created;
  }

  async markProcessing(jobId: string): Promise<void> {
    await db
      .update(jobs)
      .set({ status: 'processing', startedAt: new Date() })
      .where(eq(jobs.id, jobId));
  }

  async updateProgress(jobId: string, progress: number): Promise<void> {
    const clamped = Math.max(0, Math.min(100, Math.round(progress)));
    await db.update(jobs).set({ progress: clamped }).where(eq(jobs.id, jobId));
  }

  async complete(jobId: string, resultData: unknown): Promise<void> {
    await db
      .update(jobs)
      .set({
        status: 'completed',
        progress: 100,
        resultData: resultData as never,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  }

  async fail(jobId: string, errorMessage: string): Promise<void> {
    await db
      .update(jobs)
      .set({
        status: 'failed',
        errorMessage,
        completedAt: new Date(),
      })
      .where(eq(jobs.id, jobId));
  }

  async listByUser(userId: string, options: ListJobsOptions = {}): Promise<Job[]> {
    const { limit = 50, offset = 0, type, status } = options;

    const conditions = [eq(jobs.userId, userId)];
    if (type) conditions.push(eq(jobs.type, type));
    if (status) conditions.push(eq(jobs.status, status));

    return db
      .select()
      .from(jobs)
      .where(and(...conditions))
      .orderBy(desc(jobs.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async countByUser(
    userId: string,
    options: Pick<ListJobsOptions, 'type' | 'status'> = {}
  ): Promise<number> {
    const { type, status } = options;

    const conditions = [eq(jobs.userId, userId)];
    if (type) conditions.push(eq(jobs.type, type));
    if (status) conditions.push(eq(jobs.status, status));

    const [row] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(and(...conditions));

    return row?.count ?? 0;
  }

  /**
   * Fetch a single job, scoped to its owner. Returns null when the job
   * doesn't exist OR belongs to a different user (prevents user enumeration).
   */
  async getById(jobId: string, userId: string): Promise<Job | null> {
    const [row] = await db
      .select()
      .from(jobs)
      .where(and(eq(jobs.id, jobId), eq(jobs.userId, userId)))
      .limit(1);

    return row ?? null;
  }
}

export const jobHistoryService = new JobHistoryService();
