/**
 * Worker entrypoint.
 *
 * Run from the repo root:
 *   pnpm --filter web worker
 *
 * Required env (loaded from .env.local automatically below):
 *   - DATABASE_URL
 *   - REMOTION_SERVER_URL                (for render handler)
 *   - NEXT_PUBLIC_PYTHON_ENGINE_URL      (for handlers that proxy Python)
 *
 * Tune via env (all optional):
 *   - WORKER_QUEUE_NAME      default: "default"
 *   - WORKER_CONCURRENCY     default: "2"
 *   - WORKER_POLL_INTERVAL   default: "1000" (ms)
 */
import { config as loadEnv } from 'dotenv';

loadEnv({ path: '.env.local' });
loadEnv({ path: '.env' });

async function main() {
  // Dynamic imports so the env above is in place before any module that
  // touches process.env (e.g. the db pool) gets evaluated.
  const { handlers } = await import('../server/worker/handlers');
  const { startWorker } = await import('../server/worker/loop');

  const queueName = process.env.WORKER_QUEUE_NAME ?? 'default';
  const concurrency = Number(process.env.WORKER_CONCURRENCY ?? '2');
  const pollIntervalMs = Number(process.env.WORKER_POLL_INTERVAL ?? '1000');

  const worker = startWorker({
    queueName,
    concurrency,
    pollIntervalMs,
    handlers,
  });

  const shutdown = (signal: string) => {
    console.log(`Received ${signal}, draining...`);
    worker.stop();
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await worker.done;
  process.exit(0);
}

main().catch((error) => {
  console.error('Worker crashed:', error);
  process.exit(1);
});
