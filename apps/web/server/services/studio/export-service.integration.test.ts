import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import {
  authFixture,
  authOptions,
  baseURL,
  protocol,
  responseCookie,
} from '@/server/auth/auth-test-fixture';
import { users } from '@/server/db/schema';
import { ProjectService } from './project-service';

let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeAll(async () => {
  fixture = await authFixture();
  vi.doMock('@/server/db', () => ({ db: fixture.db }));
});
afterAll(async () => {
  await fixture?.close();
});

async function setup() {
  const { exportsService: service } = await import('./export-service');
  const { queueService: queue } = await import('../queue-service');
  const owner = randomUUID();
  await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
  const projects = new ProjectService(fixture.db);
  const empty = await projects.create(owner, { title: 'Primera', engine: 'remotion' });
  const id = empty.document.id;
  const project = await projects.save(owner, id, {
    baseRevision: empty.revision,
    document: {
      ...empty.document,
      scenes: [{ id: 'scene', durationMs: 1000, layers: [] }],
      durationMs: 1000,
    },
  });
  const input = { baseRevision: project.revision, idempotencyKey: randomUUID() };
  return { service, queue, owner, projects, project, id, input };
}

it('seals one snapshot for concurrent admission and replays it after a head change', async () => {
  const { service, queue, owner, projects, project, id, input } = await setup();
  const [a, b] = await Promise.all([
    service.enqueue(owner, id, input),
    service.enqueue(owner, id, input),
  ]);
  expect(a).toEqual(b);
  const next = await projects.save(owner, id, {
    baseRevision: project.revision,
    document: { ...project.document, title: 'Segunda' },
  });
  expect(await service.enqueue(owner, id, input)).toEqual(a);
  await expect(
    service.enqueue(owner, id, { ...input, baseRevision: next.revision })
  ).rejects.toThrow(/clave/i);
  await expect(service.get(randomUUID(), a.id)).rejects.toThrow();
  await expect(service.cancel(randomUUID(), a.id)).rejects.toThrow();
  const claim = (await queue.claimNext('default'))!;
  expect(claim.job.inputData).toMatchObject({
    snapshot: { revision: project.revision, document: { title: 'Primera' } },
  });
  expect((await service.cancel(owner, a.id)).status).toBe('cancelling');
  await service.finishAttempt(claim, new Error('ack lost'));
  expect((await service.get(owner, a.id)).status).toBe('cancelling');
  await fixture.pool.query('UPDATE queue_tasks SET lease_until=clock_timestamp() WHERE job_id=$1', [
    a.id,
  ]);
  const cleanup = (await queue.claimNext('default'))!;
  expect(cleanup.task.attemptId).toBe(claim.task.attemptId);
  expect(cleanup.cancelLeaseId).toBeTruthy();
  await service.finishAttempt(claim, undefined, true);
  expect((await service.get(owner, a.id)).status).toBe('cancelling');
  await service.finishAttempt(cleanup, undefined, true);
  expect((await service.get(owner, a.id)).status).toBe('cancelled');
});

it('fences an expired worker, progress, receipt and publication; cancellation wins final handoff', async () => {
  const { service, queue, owner, id, input } = await setup();
  const job = await service.enqueue(owner, id, input);
  const first = (await queue.claimNext('default'))!;
  await service.heartbeat(first, 35);
  await fixture.pool.query(
    "UPDATE queue_tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
    [job.id]
  );
  const second = (await queue.claimNext('default'))!;
  expect(second.task.attemptId).not.toBe(first.task.attemptId);
  expect(second.job.inputData).toEqual(first.job.inputData);
  await expect(service.heartbeat(first, 99)).rejects.toThrow();
  await expect(service.receipt(first)).rejects.toThrow();
  const rename = vi.fn();
  await expect(service.promote(first, {} as never, rename)).rejects.toThrow();
  expect(rename).not.toHaveBeenCalled();
  await service.finishAttempt(first, new Error('stale'));
  expect((await service.get(owner, job.id)).attemptId).toBe(second.task.attemptId);
  await service.cancel(owner, job.id);
  await expect(service.promote(second, {} as never, rename)).rejects.toThrow();
  expect(rename).not.toHaveBeenCalled();
  await service.finishAttempt(second, undefined, true);
  expect((await service.cancel(owner, job.id)).status).toBe('cancelled');
});

it('cancels queued work without claiming it', async () => {
  const { service, queue, owner, id, input } = await setup();
  const job = await service.enqueue(owner, id, input);
  expect((await service.cancel(owner, job.id)).status).toBe('cancelled');
  expect(await queue.claimNext('default')).toBeNull();
});

it('authorizes human export and cancel routes and projects history without snapshot bytes', async () => {
  vi.stubEnv('BETTER_AUTH_URL', baseURL);
  vi.stubEnv('BETTER_AUTH_SECRET', authOptions.secret);
  try {
    const { betterAuthServer } = await import('@/auth');
    const signup = await betterAuthServer.handler(
      protocol('sign-up/email', { name: 'Owner', email: 'r5@example.test', password: randomUUID() })
    );
    const owner = (await signup.clone().json()).user.id,
      cookie = responseCookie(signup);
    const projects = new ProjectService(fixture.db);
    const p = await projects.create(owner, { title: 'Export', engine: 'remotion' });
    const { document, revision } = await projects.save(owner, p.document.id, {
      baseRevision: p.revision,
      document: {
        ...p.document,
        durationMs: 200,
        scenes: [{ id: 'one', durationMs: 200, layers: [] }],
      },
    });
    const { POST, GET } = await import('@/app/api/studio/projects/[id]/exports/route');
    const { POST: cancel } = await import('@/app/api/studio/exports/[id]/cancel/route');
    const { GET: download } = await import('@/app/api/studio/exports/[id]/artifacts/[name]/route');
    const params = (id: string) => ({ params: Promise.resolve({ id }) });
    const body = JSON.stringify({ baseRevision: revision, idempotencyKey: randomUUID() });
    const make = (origin: string, withCookie = true) =>
      new Request(baseURL, {
        method: 'POST',
        headers: { origin, ...(withCookie && { cookie }) },
        body,
      });
    expect((await POST(make('https://wrong.example.test'), params(document.id))).status).toBe(401);
    expect((await POST(make(baseURL, false), params(document.id))).status).toBe(401);
    const accepted = await POST(make(baseURL), params(document.id));
    expect(accepted.status).toBe(202);
    const job = (await accepted.json()).data;
    const listed = await GET(new Request(baseURL, { headers: { cookie } }), params(document.id));
    expect((await listed.json()).data).toEqual([job]);
    expect(
      (
        await download(new Request(baseURL, { headers: { cookie } }), {
          params: Promise.resolve({ id: job.id, name: 'video.mp4' }),
        })
      ).status
    ).toBe(404);
    expect((await cancel(make('https://wrong.example.test'), params(job.id))).status).toBe(401);
    expect((await (await cancel(make(baseURL), params(job.id))).json()).data.status).toBe(
      'cancelled'
    );
    const { jobHistoryService } = await import('../job-history-service');
    const { publicJob } = await import('../owned-media-service');
    const record = publicJob((await jobHistoryService.getById(job.id, owner))!);
    expect(record.inputData).toEqual({
      projectId: document.id,
      engine: 'remotion',
      revision,
      snapshotHash: job.snapshotHash,
    });
  } finally {
    vi.unstubAllEnvs();
  }
});
