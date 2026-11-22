import { randomUUID } from 'node:crypto';
import { eq } from 'drizzle-orm';
import { afterAll, afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { authFixture, authOptions, baseURL } from '../auth/auth-test-fixture';
import { studioAssets, users } from '../db/schema';

let fixture: Awaited<ReturnType<typeof authFixture>>;
let owner: string, sourceId: string;
beforeAll(async () => {
  fixture = await authFixture();
  vi.doMock('@/server/db', () => ({ db: fixture.db }));
  vi.stubEnv('BETTER_AUTH_URL', baseURL);
  vi.stubEnv('BETTER_AUTH_SECRET', authOptions.secret);
});
beforeEach(async () => {
  owner = randomUUID();
  sourceId = randomUUID();
  await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
  await fixture.db.insert(studioAssets).values({
    ownerId: owner,
    id: sourceId,
    hash: 'a'.repeat(64),
    name: 'source.mp4',
    mediaType: 'video/mp4',
    sizeBytes: 512,
    durationMs: 25000,
    width: 32,
    height: 32,
    hasAudio: false,
  });
});
afterEach(async () => {
  vi.restoreAllMocks();
  await fixture.db.delete(users).where(eq(users.id, owner));
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
});

async function submit() {
  const { enqueue } = await import('@/app/api/legacy-media-http');
  return enqueue(owner, 'render', {
    sourceAssetId: sourceId,
    subtitles: [],
    template: 'modern',
    language: 'es',
    aspectRatio: '9:16',
    subtitleClock: 'seconds',
  });
}

it('rolls back the history row when the queue insert fails', async () => {
  await fixture.pool.query(`CREATE FUNCTION fail_queue() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'fixture admission failure'; END $$;
    CREATE TRIGGER fail_queue BEFORE INSERT ON queue_tasks FOR EACH ROW EXECUTE FUNCTION fail_queue()`);
  try {
    await expect(submit()).rejects.toThrow();
    expect(
      (await fixture.pool.query('SELECT id FROM jobs WHERE user_id=$1', [owner])).rowCount
    ).toBe(0);
  } finally {
    await fixture.pool.query('DROP TRIGGER fail_queue ON queue_tasks');
  }
});

it('keeps partially admitted work invisible to readers and workers until commit', async () => {
  const { queueService } = await import('../services/queue-service');
  const lock = await fixture.pool.connect();
  const key = Math.floor(Math.random() * 1000000000) + 1;
  await lock.query('SELECT pg_advisory_lock($1)', [key]);
  await fixture.pool.query(`CREATE FUNCTION wait_queue() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN PERFORM pg_advisory_xact_lock(${key}); RETURN NEW; END $$;
    CREATE TRIGGER wait_queue BEFORE INSERT ON queue_tasks FOR EACH ROW EXECUTE FUNCTION wait_queue()`);
  const pending = submit();
  let visible: number | null = null,
    claimed;
  try {
    await vi.waitFor(async () => {
      const waiting = await fixture.pool.query(
        'SELECT 1 FROM pg_locks WHERE locktype=$1 AND objid=$2 AND NOT granted',
        ['advisory', key]
      );
      expect(waiting.rowCount).toBe(1);
    });
    visible = (await fixture.pool.query('SELECT id FROM jobs WHERE user_id=$1', [owner])).rowCount;
    claimed = await queueService.claimNext('default');
  } finally {
    await lock.query('SELECT pg_advisory_unlock($1)', [key]);
    lock.release();
    await pending;
    await fixture.pool.query('DROP TRIGGER wait_queue ON queue_tasks');
  }
  expect(visible).toBe(0);
  expect(claimed).toBeNull();
  expect((await pending).status).toBe(202);
  expect((await queueService.claimNext('default'))?.job).toMatchObject({
    userId: owner,
    status: 'processing',
  });
});

it.each([
  'status',
  'artifact',
  'ingest',
  'completion',
  'completion-ack',
  'lost-admission',
  'receipt-save',
  'last-receipt-save',
  'receipt-ack',
] as const)(
  'uses the real worker retry path after %s without admitting another remote export',
  async (failure) => {
    const { queueService } = await import('../services/queue-service');
    const { AssetService } = await import('../services/studio/asset-service');
    const { jobHistoryService: history } = await import('../services/job-history-service');
    const { publicJob } = await import('../services/owned-media-service');
    const { handlers } = await import('./handlers');
    const { startWorker } = await import('./loop');
    const webId = (await (await submit()).json()).data.jobId;
    const remoteId = randomUUID();
    const output = await new AssetService(fixture.db).get(owner, sourceId);
    const ingest = vi.spyOn(AssetService.prototype, 'ingest').mockResolvedValue(output);
    if (failure === 'ingest') ingest.mockRejectedValueOnce(new Error('fixture ingest failure'));
    const { renderAdmission } = await import('../services/render-admission');
    const accept = renderAdmission.accept.bind(renderAdmission);
    if (failure === 'last-receipt-save') {
      vi.spyOn(AssetService.prototype, 'get')
        .mockRejectedValueOnce(new Error('fixture source unavailable'))
        .mockRejectedValueOnce(new Error('fixture source still unavailable'));
    }
    if (failure === 'receipt-save' || failure === 'last-receipt-save')
      vi.spyOn(renderAdmission, 'accept').mockRejectedValueOnce(
        new Error('fixture receipt write failure')
      );
    if (failure === 'receipt-ack')
      vi.spyOn(renderAdmission, 'accept').mockImplementationOnce(async (...args) => {
        await accept(...args);
        throw new Error('fixture lost receipt acknowledgement');
      });
    const complete = queueService.complete.bind(queueService);
    if (failure === 'completion')
      vi.spyOn(queueService, 'complete').mockRejectedValueOnce(new Error('fixture commit failure'));
    if (failure === 'completion-ack')
      vi.spyOn(queueService, 'complete').mockImplementationOnce(async (...args) => {
        await complete(...args);
        throw new Error('fixture lost completion acknowledgement');
      });
    const calls: string[] = [];
    let failed = false;
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
      const path = new URL(String(url)).pathname;
      calls.push((init?.method ?? 'GET') + ' ' + path);
      if (path === '/renders') {
        if (failure === 'lost-admission') throw new Error('fixture lost admission response');
        return Response.json({ jobId: remoteId });
      }
      if (path === '/renders/' + remoteId) {
        if (failure === 'status' && !failed) {
          failed = true;
          throw new Error('fixture status read failure');
        }
        return Response.json({ status: 'completed' });
      }
      expect(path).toBe('/renders/' + remoteId + '.mp4');
      if (failure === 'artifact' && !failed) {
        failed = true;
        return new Response(null, { status: 503 });
      }
      return new Response('mp4 fixture');
    });
    const worker = startWorker({
      queueName: 'default',
      pollIntervalMs: 10,
      concurrency: 1,
      handlers,
    });
    try {
      await vi.waitFor(
        async () => {
          // Skip only the real queue's backoff after a failed attempt.
          await fixture.pool.query(
            'UPDATE queue_tasks SET next_retry_at=now() WHERE job_id=$1 AND next_retry_at>now()',
            [webId]
          );
          const row = await history.getById(webId, owner);
          expect(['failed', 'completed']).toContain(row?.status);
        },
        { timeout: 12000, interval: 30 }
      );
    } finally {
      worker.stop();
      await worker.done;
    }
    const row = await history.getById(webId, owner);
    expect(calls.filter((c) => c === 'POST /renders')).toHaveLength(1);
    const uncertain = ['lost-admission', 'receipt-save', 'last-receipt-save'].includes(failure);
    expect(row?.status).toBe(uncertain ? 'failed' : 'completed');
    const task = await fixture.pool.query('SELECT attempts FROM queue_tasks WHERE job_id=$1', [
      webId,
    ]);
    if (failure === 'last-receipt-save') {
      expect(task.rows[0].attempts).toBe(3);
      expect(row).toMatchObject({
        resultData: { phase: 'submitting' },
        errorMessage: 'fixture receipt write failure',
      });
      expect(calls).toEqual(['POST /renders']);
      const auth = await import('../lib/auth');
      vi.spyOn(auth, 'requireAuth').mockResolvedValueOnce({
        id: owner,
        name: null,
        email: null,
        image: null,
      });
      const { GET } = await import('@/app/api/jobs/[id]/route');
      const { NextRequest } = await import('next/server');
      const response = await GET(new NextRequest(baseURL + '/api/jobs/' + webId), {
        params: Promise.resolve({ id: webId }),
      });
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.resultData).toBeNull();
      expect(data.errorMessage).toMatch(/confirmar.*admisión/i);
      expect(data.errorMessage).toContain(webId);
      expect(data.errorMessage).not.toMatch(/vuelve a intentarlo/i);
    } else {
      expect(task.rows[0].attempts).toBe(
        ['lost-admission', 'completion-ack'].includes(failure) ? 1 : 2
      );
    }
    if (uncertain) {
      expect(publicJob(row!).errorMessage).toMatch(/confirmar.*admisión/i);
      expect(publicJob(row!).errorMessage).toContain(webId);
    } else expect(row?.resultData).toMatchObject({ outputAssetId: sourceId });
  },
  16000
);
