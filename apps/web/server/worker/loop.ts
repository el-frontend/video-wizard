import { logger } from '@/server/lib/utils';
import { type ClaimedTask, queueService } from '@/server/services/queue-service';

import type { JobHandler } from './handlers';

export interface WorkerOptions {
  /** Queue name to drain. */
  queueName: string;
  /** Polling interval when the queue is empty (ms). Default 1000. */
  pollIntervalMs?: number;
  /** Maximum tasks running in parallel. Default 2. */
  concurrency?: number;
  /** Map of job-type → handler. */
  handlers: Record<string, JobHandler>;
}

interface WorkerHandle {
  /** Resolves once the loop has fully drained and exited. */
  done: Promise<void>;
  /** Request a graceful shutdown — finishes in-flight tasks, then exits. */
  stop(): void;
}

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

async function processOne(
  claimed: ClaimedTask,
  handlers: Record<string, JobHandler>
): Promise<void> {
  const { task, job } = claimed;
  const handler = handlers[job.type];

  if (!handler) {
    const message = `No handler registered for job type "${job.type}"`;
    logger.error(message, undefined, { taskId: task.id, jobId: job.id });
    await queueService.fail(task.id, job.id, message);
    return;
  }

  logger.info('Worker claimed task', {
    taskId: task.id,
    jobId: job.id,
    jobType: job.type,
    attempt: task.attempts,
  });

  try {
    const result = await handler(job);
    await queueService.complete(task.id, job.id, result);
    logger.info('Worker completed task', { taskId: task.id, jobId: job.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown handler error';
    const outcome = await queueService.fail(task.id, job.id, message);

    logger.error('Worker handler failed', error, {
      taskId: task.id,
      jobId: job.id,
      retrying: outcome.retrying,
      nextRetryAt: outcome.nextRetryAt?.toISOString(),
    });
  }
}

/**
 * Start the worker loop. Polls `queueName` and dispatches up to
 * `concurrency` tasks in parallel. Returns a handle whose `done` promise
 * resolves after `stop()` is called and all in-flight tasks have settled.
 *
 * Designed to be wrapped by an entrypoint script that wires SIGINT /
 * SIGTERM to `stop()` for clean container shutdowns.
 */
export function startWorker(options: WorkerOptions): WorkerHandle {
  const { queueName, pollIntervalMs = 1000, concurrency = 2, handlers } = options;

  let stopping = false;
  const inflight = new Set<Promise<void>>();

  async function loop() {
    logger.info('Worker started', { queueName, concurrency, pollIntervalMs });

    while (!stopping) {
      if (inflight.size >= concurrency) {
        await Promise.race(inflight);
        continue;
      }

      let claimed: ClaimedTask | null = null;
      try {
        claimed = await queueService.claimNext(queueName);
      } catch (error) {
        logger.error('Worker claim error', error, { queueName });
        await sleep(pollIntervalMs);
        continue;
      }

      if (!claimed) {
        await sleep(pollIntervalMs);
        continue;
      }

      const task = processOne(claimed, handlers).finally(() => {
        inflight.delete(task);
      });
      inflight.add(task);
    }

    logger.info('Worker draining', { inflight: inflight.size });
    await Promise.allSettled(Array.from(inflight));
    logger.info('Worker stopped');
  }

  const done = loop();

  return {
    done,
    stop() {
      stopping = true;
    },
  };
}
