import { NextRequest } from 'next/server';
import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { eq } from 'drizzle-orm';
import { authFixture, authOptions, baseURL, protocol, responseCookie } from './auth-test-fixture';
import { studioRequests } from '@/server/db/schema';
import { ProjectService } from '@/server/services/studio/project-service';
import { RequestService } from '@/server/services/studio/request-service';
let fixture: Awaited<ReturnType<typeof authFixture>>,
  owner: string,
  cookie: string,
  project: string,
  receipt: string,
  secret: string,
  binding: string,
  dispatch: string;
const context = (id = project, requestId = receipt) => ({
  params: Promise.resolve({ id, requestId }),
});
const local = (method: string, token: string, body?: string, extra?: Record<string, string>) =>
  new Request(baseURL, { method, headers: { authorization: 'Bearer ' + token, ...extra }, body });
beforeAll(async () => {
  fixture = await authFixture();
  vi.doMock('@/server/db', () => ({ db: fixture.db }));
  vi.stubEnv('BETTER_AUTH_URL', baseURL);
  vi.stubEnv('BETTER_AUTH_SECRET', authOptions.secret);
  const { betterAuthServer } = await import('@/auth');
  const signup = await betterAuthServer.handler(
    protocol('sign-up/email', {
      name: 'Propietario',
      email: 'r4@example.test',
      password: randomUUID(),
    })
  );
  expect(signup.status).toBe(200);
  cookie = responseCookie(signup);
  owner = (await signup.json()).user.id;
  const p = await new ProjectService(fixture.db).create(owner, { title: 'R4', engine: 'remotion' });
  project = p.document.id;
  const service = new RequestService(fixture.db);
  const intent = await service.pairing(owner, project);
  binding = randomUUID();
  dispatch = (await service.bind(intent.token, { bindingId: binding, provider: 'codex' })).token;
  receipt = (
    await service.create(owner, project, {
      kind: 'feedback',
      message: 'Título',
      engine: 'remotion',
      bindingId: binding,
      provider: 'codex',
      baseRevision: p.revision,
      selection: { sceneId: null, layerId: null, captionId: null, timeMs: 0 },
      idempotencyKey: randomUUID(),
    })
  ).id;
  secret = (await service.claim(dispatch, project, binding, receipt))!.token;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
});
it('permits only the scoped operations and never falls back to a human cookie', async () => {
  const { GET, PUT } = await import('@/app/api/studio/projects/[id]/route');
  const { POST: audio } = await import('@/app/api/studio/projects/[id]/audio/route');
  const { POST: report } =
    await import('@/app/api/studio/projects/[id]/requests/[requestId]/status/route');
  const catalog = await import('@/app/api/studio/projects/route');
  expect((await GET(local('GET', secret), context())).status).toBe(200);
  expect((await GET(local('GET', secret), context(randomUUID()))).status).toBe(401);
  expect(
    (await catalog.GET(new NextRequest(local('GET', secret, undefined, { cookie })))).status
  ).toBe(401);
  for (const token of ['invalid', dispatch, secret + 'x']) {
    const request = local('PUT', token, 'malformed', { cookie, origin: baseURL });
    expect((await PUT(request, context())).status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  }
  for (const [handler, ctx] of [
    [audio, context()],
    [report, context(project, randomUUID())],
  ] as const) {
    const request = local('POST', secret, 'malformed');
    expect((await handler(request, ctx)).status).toBe(401);
    expect(request.bodyUsed).toBe(false);
  }
  const wrong = new Request(baseURL, {
    method: 'PUT',
    headers: { cookie, origin: 'https://wrong.example' },
    body: 'bad',
  });
  expect((await PUT(wrong, context())).status).toBe(401);
  expect(wrong.bodyUsed).toBe(false);
  const service = new RequestService(fixture.db);
  await expect(
    service.transition(randomUUID(), receipt, { status: 'cancelled' })
  ).rejects.toThrow();
  const invalid = await service.pairing(owner, project);
  const bind = await import('@/app/api/studio/companion/bind/route');
  const browser = local('POST', invalid.token, 'bad', { origin: baseURL });
  expect((await bind.POST(browser)).status).toBe(401);
  expect(browser.bodyUsed).toBe(false);
});
it('rejects human attempts at a real receipt origin and verifies expiry and revocation', async () => {
  const { requests } = await import('@/app/api/studio/companion/http');
  const { GET } = await import('@/app/api/studio/projects/[id]/route');
  const read = () => GET(local('GET', secret, undefined, { cookie }), context());
  const head = await new ProjectService(fixture.db).get(owner, project);
  await expect(
    requests.assertHumanDelivery({
      requestId: receipt,
      baseRevision: head.revision,
      engine: 'remotion',
      kind: 'storyboard',
      commands: [{ type: 'set-headline', sceneId: 'scene', text: 'A' }],
    })
  ).rejects.toThrow();
  await fixture.db
    .update(studioRequests)
    .set({ attemptExpires: new Date(0) })
    .where(eq(studioRequests.id, receipt));
  expect((await read()).status).toBe(401);
  await fixture.db
    .update(studioRequests)
    .set({ attemptExpires: new Date(Date.now() + 100000) })
    .where(eq(studioRequests.id, receipt));
  await requests.revoke(owner, project, binding);
  expect((await read()).status).toBe(401);
});
it('loads the studio without a legacy key and reports a configuration error only on use', async () => {
  vi.stubEnv('OPENAI_API_KEY', '');
  const { AI_MODELS } = await import('@/server/config/ai');
  expect(() => AI_MODELS.contentAnalysis).toThrow(/OPENAI_API_KEY/);
});
