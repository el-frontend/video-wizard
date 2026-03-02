import { sql } from 'drizzle-orm';
import { pgEnum, pgTable, index, check } from 'drizzle-orm/pg-core';
import * as t from 'drizzle-orm/pg-core';

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

export const jobTypeEnum = pgEnum('job_type', [
  'transcription',
  'render',
  'clip_creation',
  'analysis',
]);

export const jobStatusEnum = pgEnum('job_status', [
  'pending',
  'queued',
  'processing',
  'completed',
  'failed',
  'cancelled',
]);

export const queueStatusEnum = pgEnum('queue_status', ['active', 'paused']);

// ---------------------------------------------------------------------------
// Jobs
// ---------------------------------------------------------------------------

export const jobs = pgTable(
  'jobs',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    // TODO: Add foreign key constraint once users table is created (ticket TBD)
    userId: t.uuid('user_id').notNull(),

    type: jobTypeEnum('type').notNull(),
    status: jobStatusEnum('status').notNull().default('pending'),

    /** Flexible input payload depending on job type (video path, YouTube URL, etc.) */
    inputData: t.jsonb('input_data'),

    /** Result payload after job completion (transcription, analysis, render URL, etc.) */
    resultData: t.jsonb('result_data'),

    /** Error message when status is 'failed' */
    errorMessage: t.text('error_message'),

    /** Processing progress from 0 to 100 */
    progress: t.integer('progress').notNull().default(0),

    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
    startedAt: t.timestamp('started_at', { withTimezone: true }),
    completedAt: t.timestamp('completed_at', { withTimezone: true }),
  },
  (table) => [
    index('jobs_status_idx').on(table.status),
    index('jobs_user_id_status_idx').on(table.userId, table.status),
    check('jobs_progress_range', sql`${table.progress} >= 0 AND ${table.progress} <= 100`),
  ]
);

// ---------------------------------------------------------------------------
// Task Queues
// ---------------------------------------------------------------------------

export const taskQueues = pgTable('task_queues', {
  id: t.uuid().primaryKey().defaultRandom(),

  /** Queue name, e.g. 'video-processing', 'rendering' */
  name: t.varchar('name', { length: 255 }).notNull().unique(),

  /** Higher number = higher priority */
  priority: t.integer('priority').notNull().default(0),

  status: queueStatusEnum('status').notNull().default('active'),

  /** Configuration: concurrency limits, timeouts, etc. */
  config: t.jsonb('config'),

  createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: t
    .timestamp('updated_at', { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

// ---------------------------------------------------------------------------
// Queue Tasks (join table between jobs and queues)
// ---------------------------------------------------------------------------

export const queueTasks = pgTable(
  'queue_tasks',
  {
    id: t.uuid().primaryKey().defaultRandom(),

    jobId: t
      .uuid('job_id')
      .notNull()
      .references(() => jobs.id, { onDelete: 'cascade' }),

    queueId: t
      .uuid('queue_id')
      .notNull()
      .references(() => taskQueues.id, { onDelete: 'cascade' }),

    status: jobStatusEnum('status').notNull().default('pending'),

    /** Position in the queue (lower = earlier) */
    position: t.integer('position').notNull().default(0),

    /** Number of times this task has been attempted */
    attempts: t.integer('attempts').notNull().default(0),

    /** Maximum retries before marking as failed */
    maxRetries: t.integer('max_retries').notNull().default(3),

    /** Timestamp for next retry attempt (for exponential backoff) */
    nextRetryAt: t.timestamp('next_retry_at', { withTimezone: true }),

    createdAt: t.timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: t
      .timestamp('updated_at', { withTimezone: true })
      .notNull()
      .defaultNow()
      .$onUpdate(() => new Date()),
  },
  (table) => [
    index('queue_tasks_job_id_idx').on(table.jobId),
    index('queue_tasks_status_idx').on(table.status),
    index('queue_tasks_queue_id_idx').on(table.queueId),
    index('queue_tasks_queue_id_position_idx').on(table.queueId, table.position),
  ]
);
