import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';

import { db } from '@/server/db';
import { jobs, queueTasks, taskQueues } from '@/server/db/schema';
import { ServiceError } from '@/server/lib/utils';

import type { Job } from './job-history-service';

export type QueueTask = typeof queueTasks.$inferSelect;
export type TaskQueue = typeof taskQueues.$inferSelect;

interface EnqueueInput {
  jobId: string;
  queueName: string;
  /** Lower runs earlier within the same queue. Defaults to 0. */
  position?: number;
  /** Per-task override. Defaults to the column default (3). */
  maxRetries?: number;
}

export interface ClaimedTask {
  task: QueueTask;
  job: Job;
}

interface FailResult {
  /** True if a retry was scheduled, false if the task gave up. */
  retrying: boolean;
  /** When the task is eligible to run again (null when exhausted). */
  nextRetryAt: Date | null;
}

/**
 * Initial retry delay in milliseconds. Doubles on each subsequent attempt.
 * attempt 1 fail → wait 5s
 * attempt 2 fail → wait 10s
 * attempt 3 fail → wait 20s, etc.
 */
const RETRY_BASE_DELAY_MS = 5_000;

function computeNextRetry(attempts: number): Date {
  const delay = RETRY_BASE_DELAY_MS * 2 ** Math.max(0, attempts - 1);
  return new Date(Date.now() + delay);
}

/**
 * Task-queue service.
 *
 * Backed by the `task_queues` and `queue_tasks` tables. Uses Postgres
 * `SELECT ... FOR UPDATE SKIP LOCKED` inside a transaction so multiple
 * worker processes can claim tasks concurrently without ever picking up
 * the same row twice.
 *
 * Failure handling: when a task fails and `attempts < maxRetries`, the
 * row is moved back to `pending` with `nextRetryAt` set via exponential
 * backoff. When retries are exhausted, the row is marked `failed` and
 * the linked job in `jobs` is also marked `failed`.
 */
class QueueService {
  /**
   * Idempotently fetch (or create) a queue by name.
   */
  async ensureQueue(name: string, config?: unknown): Promise<TaskQueue> {
    const [existing] = await db.select().from(taskQueues).where(eq(taskQueues.name, name)).limit(1);

    if (existing) return existing;

    const [created] = await db
      .insert(taskQueues)
      .values({ name, config: config as never })
      .onConflictDoNothing({ target: taskQueues.name })
      .returning();

    if (created) return created;

    // Lost a race with another caller; re-read.
    const [racedExisting] = await db
      .select()
      .from(taskQueues)
      .where(eq(taskQueues.name, name))
      .limit(1);

    if (!racedExisting) {
      throw new ServiceError(`Failed to ensure queue "${name}"`);
    }
    return racedExisting;
  }

  /**
   * Enqueue an existing job (must already exist in `jobs`).
   * Updates the job status to `queued` so the user-facing list shows
   * the right state.
   */
  async enqueue({ jobId, queueName, position = 0, maxRetries }: EnqueueInput): Promise<QueueTask> {
    const queue = await this.ensureQueue(queueName);

    const [task] = await db
      .insert(queueTasks)
      .values({
        jobId,
        queueId: queue.id,
        status: 'pending',
        position,
        ...(maxRetries !== undefined ? { maxRetries } : {}),
      })
      .returning();

    if (!task) throw new ServiceError('Failed to enqueue task');

    await db.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, jobId));

    return task;
  }

  /**
   * Atomically claim the next runnable task on a queue. Returns null when
   * the queue is empty or no task is currently eligible (e.g. all pending
   * tasks have a future `nextRetryAt`).
   *
   * Concurrency-safe via FOR UPDATE SKIP LOCKED inside a transaction —
   * multiple workers polling the same queue never claim the same row.
   */
  async claimNext(queueName: string): Promise<ClaimedTask | null> {
    const [queue] = await db
      .select({ id: taskQueues.id, status: taskQueues.status })
      .from(taskQueues)
      .where(eq(taskQueues.name, queueName))
      .limit(1);

    if (!queue || queue.status !== 'active') return null;

    return await db.transaction(async (tx) => {
      const [candidate] = await tx
        .select({ id: queueTasks.id })
        .from(queueTasks)
        .where(
          and(
            eq(queueTasks.queueId, queue.id),
            eq(queueTasks.status, 'pending'),
            or(isNull(queueTasks.nextRetryAt), lte(queueTasks.nextRetryAt, new Date()))
          )
        )
        .orderBy(asc(queueTasks.position), asc(queueTasks.createdAt))
        .limit(1)
        .for('update', { skipLocked: true });

      if (!candidate) return null;

      const [claimedTask] = await tx
        .update(queueTasks)
        .set({
          status: 'processing',
          attempts: sql`${queueTasks.attempts} + 1`,
          nextRetryAt: null,
        })
        .where(eq(queueTasks.id, candidate.id))
        .returning();

      if (!claimedTask) return null;

      const [linkedJob] = await tx
        .update(jobs)
        .set({ status: 'processing', startedAt: new Date() })
        .where(eq(jobs.id, claimedTask.jobId))
        .returning();

      if (!linkedJob) {
        // The linked job was deleted between enqueue and claim. Mark task
        // failed so we don't keep re-claiming a phantom.
        await tx
          .update(queueTasks)
          .set({ status: 'failed' })
          .where(eq(queueTasks.id, claimedTask.id));
        return null;
      }

      return { task: claimedTask, job: linkedJob };
    });
  }

  /**
   * Mark a task (and its underlying job) as completed.
   */
  async complete(taskId: string, jobId: string, resultData: unknown): Promise<void> {
    await db.transaction(async (tx) => {
      await tx.update(queueTasks).set({ status: 'completed' }).where(eq(queueTasks.id, taskId));

      await tx
        .update(jobs)
        .set({
          status: 'completed',
          progress: 100,
          resultData: resultData as never,
          completedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));
    });
  }

  /**
   * Record a failure. Schedules a retry (status back to `pending`,
   * `nextRetryAt` set via exponential backoff) when attempts remain;
   * otherwise marks both task and job as `failed`.
   */
  async fail(taskId: string, jobId: string, errorMessage: string): Promise<FailResult> {
    return await db.transaction(async (tx) => {
      const [current] = await tx
        .select({ attempts: queueTasks.attempts, maxRetries: queueTasks.maxRetries })
        .from(queueTasks)
        .where(eq(queueTasks.id, taskId))
        .limit(1);

      if (!current) {
        throw new ServiceError(`Queue task ${taskId} disappeared mid-failure`);
      }

      if (current.attempts < current.maxRetries) {
        const nextRetryAt = computeNextRetry(current.attempts);

        await tx
          .update(queueTasks)
          .set({ status: 'pending', nextRetryAt })
          .where(eq(queueTasks.id, taskId));

        // Keep the job visible as `queued` while we wait for the retry
        // window. Don't overwrite errorMessage yet — the user only cares
        // about the final error if all attempts fail.
        await tx.update(jobs).set({ status: 'queued' }).where(eq(jobs.id, jobId));

        return { retrying: true, nextRetryAt };
      }

      // Out of retries. Surface the final error to the user.
      await tx.update(queueTasks).set({ status: 'failed' }).where(eq(queueTasks.id, taskId));

      await tx
        .update(jobs)
        .set({
          status: 'failed',
          errorMessage,
          completedAt: new Date(),
        })
        .where(eq(jobs.id, jobId));

      return { retrying: false, nextRetryAt: null };
    });
  }
}

export const queueService = new QueueService();
