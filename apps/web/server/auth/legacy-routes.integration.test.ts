import { execFileSync } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { NextRequest } from 'next/server';
import { afterAll, beforeAll, expect, it, vi } from 'vitest';
import { authFixture, authOptions, baseURL, protocol, responseCookie } from './auth-test-fixture';

let fixture: Awaited<ReturnType<typeof authFixture>>;
let directory: string;
let cookie: string, bearer: string, owner: string, otherCookie: string;
let sourceId: string, derivedId: string, cropId: string, staleId: string;
let bytes: Uint8Array<ArrayBuffer>;
beforeAll(async () => {
  fixture = await authFixture();
  vi.doMock('@/server/db', () => ({ db: fixture.db }));
  vi.stubEnv('BETTER_AUTH_URL', baseURL);
  vi.stubEnv('BETTER_AUTH_SECRET', authOptions.secret);
  const { betterAuthServer } = await import('@/auth');
  const signup = await betterAuthServer.handler(
    protocol('sign-up/email', {
      name: 'Persona',
      email: 'owner@example.test',
      password: randomUUID(),
    })
  );
  expect(signup.status).toBe(200);
  cookie = responseCookie(signup);
  owner = (await signup.json()).user.id;
  const other = await betterAuthServer.handler(
    protocol('sign-up/email', {
      name: 'Segunda',
      email: 'other@example.test',
      password: randomUUID(),
    })
  );
  otherCookie = responseCookie(other);
  directory = await mkdtemp(join(tmpdir(), 'legacy-owned-'));
  vi.stubEnv('STUDIO_DATA_DIR', directory);
  const { POST: upload } = await import('@/app/api/studio/assets/route');
  async function video(color: string) {
    const file = join(directory, color + '.mp4');
    execFileSync('ffmpeg', [
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=' + color + ':s=32x32:r=10:d=1',
      '-c:v',
      'libx264',
      file,
    ]);
    bytes = new Uint8Array(await readFile(file));
    const response = await upload(
      new Request(baseURL, {
        method: 'POST',
        body: bytes,
        headers: {
          cookie,
          origin: baseURL,
          'content-type': 'video/mp4',
          'x-studio-filename': color + '.mp4',
        },
      })
    );
    expect(response.status).toBe(201);
    return (await response.json()).data.id as string;
  }
  sourceId = await video('red');
  derivedId = await video('blue');
  const { jobHistoryService: jobs } = await import('@/server/services/job-history-service');
  const crop = await jobs.create({
    userId: owner,
    type: 'clip_creation',
    inputData: { sourceAssetId: sourceId, startMs: 100, endMs: 900 },
  });
  cropId = crop.id;
  await jobs.complete(crop.id, {
    sourceAssetId: sourceId,
    derivedAssetId: derivedId,
    output_path: 'output/old.mp4',
    output_url: 'http://engine/output/old.mp4',
    sourceDurationMs: 1000,
  });
  const stale = await jobs.create({
    userId: owner,
    type: 'clip_creation',
    inputData: { video_path: 'uploads/unproven.mp4' },
  });
  staleId = stale.id;
  await jobs.complete(stale.id, { output_url: 'http://engine/output/stale.mp4' });
  bearer =
    'Bearer ' +
    (await (await betterAuthServer.handler(protocol('token', undefined, cookie))).json()).token;
});
afterAll(async () => {
  vi.unstubAllEnvs();
  await fixture?.close();
  if (directory) await rm(directory, { recursive: true, force: true });
});

it('anonymousLegacyRoutesReturn401 before reading the body', async () => {
  const routes = [
    await import('@/app/api/transcribe/route'),
    await import('@/app/api/create-clip/route'),
    await import('@/app/api/generate-subtitles/route'),
    await import('@/app/api/render-with-subtitles/route'),
    await import('@/app/api/render-video-subtitles/route'),
    await import('@/app/api/render-final/route'),
  ];
  for (const { POST } of routes) {
    const req = new NextRequest(baseURL, { method: 'POST', body: 'malformed' });
    expect((await POST(req)).status).toBe(401);
    expect(req.bodyUsed).toBe(false);
  }
  const { GET } = await import('@/app/remotion/route');
  expect((await GET(new NextRequest(baseURL))).status).toBe(401);
});

it('cookieMutationOriginCheckedAcrossEveryApiWrapper', async () => {
  const { POST: asset } = await import('@/app/api/studio/assets/route');
  const { POST: project } = await import('@/app/api/studio/projects/route');
  const { POST: library } = await import('@/app/api/studio/libraries/[kind]/route');
  const { POST: engine } = await import('@/app/api/studio/projects/[id]/renders/route');
  const { POST: legacy } = await import('@/app/api/generate-subtitles/route');
  const context = { params: Promise.resolve({ kind: 'component', id: randomUUID() }) };
  for (const POST of [asset, project, library, engine, legacy]) {
    for (const origin of [undefined, 'https://another.example.test']) {
      const req = new NextRequest(baseURL, {
        method: 'POST',
        body: '{}',
        headers: origin ? { cookie, origin } : { cookie },
      });
      expect((await POST(req, context)).status).toBe(401);
      expect(req.bodyUsed).toBe(false);
    }
  }
  expect(
    (await asset(new Request(baseURL, { method: 'POST', headers: { authorization: bearer } })))
      .status
  ).toBe(400);
});

function request(body: unknown, identity = cookie) {
  return new NextRequest(baseURL, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { cookie: identity, origin: baseURL },
  });
}

it('otherOwnerPathOrJobCannotBeProcessed', async () => {
  const { POST: transcribe } = await import('@/app/api/transcribe/route');
  const { POST: render } = await import('@/app/api/render-with-subtitles/route');
  const { POST: clip } = await import('@/app/api/create-clip/route');
  expect((await transcribe(request({ sourceAssetId: sourceId }, otherCookie))).status).toBe(404);
  expect((await render(request({ jobId: cropId, subtitles: [] }, otherCookie))).status).toBe(404);
  expect(
    (await clip(request({ sourceAssetId: sourceId, startMs: 0, endMs: 500 }, otherCookie))).status
  ).toBe(404);
  const stale = await transcribe(request({ jobId: staleId }));
  expect(stale.status).toBe(400);
  expect(await stale.text()).toMatch(/vuelve a importar/i);
  for (const path of ['uploads/%2e%2e/output/other.mp4', 'http://engine/uploads/input.mp4']) {
    expect((await transcribe(request({ video_path: path }))).status).toBe(400);
    expect((await render(request({ jobId: cropId, clipPath: path, subtitles: [] }))).status).toBe(
      400
    );
    expect((await clip(request({ video_path: path, start_time: 0, end_time: 1 }))).status).toBe(
      400
    );
    expect(
      (await render(request({ jobId: cropId, subtitles: [], brandKit: { logoUrl: path } }))).status
    ).toBe(400);
  }
  const own = await transcribe(request({ jobId: cropId }));
  expect(own.status).toBe(200);
  expect(await own.json()).toMatchObject({
    data: { sourceAssetId: derivedId, sourceDurationMs: 1000, segments: [] },
  });
  const { GET } = await import('@/app/api/jobs/[id]/route');
  const read = (id: string) =>
    GET(new NextRequest(baseURL, { headers: { cookie } }), { params: Promise.resolve({ id }) });
  const current = await (await read(cropId)).json();
  expect(current.data.resultData.output_url).toBe('/api/studio/assets/' + derivedId);
  expect(JSON.stringify(current)).not.toMatch(/old.mp4|\/output\//);
  const historic = await (await read(staleId)).json();
  expect(historic.data.errorMessage).toMatch(/vuelve a importar/i);
  expect(JSON.stringify(historic)).not.toContain('unproven.mp4');
});

it('privateOutputRangeAndHead', async () => {
  const { GET } = await import('@/app/api/studio/assets/[id]/route');
  const media = (method: string, range: string, identity: string) =>
    GET(new Request(baseURL, { method, headers: { cookie: identity, range } }), {
      params: Promise.resolve({ id: derivedId }),
    });
  expect((await media('GET', 'bytes=1-3', '')).status).toBe(401);
  expect((await media('GET', 'bytes=1-3', otherCookie)).status).toBe(404);
  const part = await media('GET', 'bytes=1-3', cookie);
  expect(part.status).toBe(206);
  expect(part.headers.get('cache-control')).toBe('private, no-store');
  expect(new Uint8Array(await part.arrayBuffer())).toEqual(bytes.slice(1, 4));
  const head = await media('HEAD', 'bytes=1-3', cookie);
  expect(head.status).toBe(206);
  expect(head.body).toBeNull();
  expect(head.headers.get('content-range')).toBe('bytes 1-3/' + bytes.length);
  expect((await media('GET', 'bytes=' + bytes.length + '-', cookie)).status).toBe(416);
});

it('revalidates the stored parent job in the worker and persists its exact private artifact', async () => {
  const { POST: render } = await import('@/app/api/render-with-subtitles/route');
  const { jobHistoryService: jobs } = await import('@/server/services/job-history-service');
  const { handlers } = await import('@/server/worker/handlers');
  const { betterAuthServer } = await import('@/auth');
  const otherIdentity = await betterAuthServer.api.getSession({
    headers: new Headers({ cookie: otherCookie }),
  });
  const png = new Uint8Array(
    Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=',
      'base64'
    )
  );
  const { POST: upload } = await import('@/app/api/studio/assets/route');
  const uploadLogo = async (identity: string) =>
    (
      await (
        await upload(
          new Request(baseURL, {
            method: 'POST',
            body: png,
            headers: {
              cookie: identity,
              origin: baseURL,
              'content-type': 'image/png',
              'x-studio-filename': 'logo.png',
            },
          })
        )
      ).json()
    ).data.id as string;
  const otherLogo = await uploadLogo(otherCookie);
  expect(
    (await render(request({ jobId: cropId, subtitles: [], brandKit: { logoAssetId: otherLogo } })))
      .status
  ).toBe(404);
  const logoId = await uploadLogo(cookie);
  const subtitles = [
    {
      start: 0.05,
      end: 0.6,
      text: 'Edición manual',
      words: [{ word: 'manual', start: 0.3, end: 0.6 }],
    },
  ];
  const response = await render(
    request({ jobId: cropId, subtitles, brandKit: { logoAssetId: logoId } })
  );
  expect(response.status).toBe(202);
  const jobId = (await response.json()).data.jobId;
  const { queueService } = await import('@/server/services/queue-service');
  const claimed = await queueService.claimNext('default');
  const job = claimed!.job;
  expect(job.id).toBe(jobId);
  expect(job.inputData).toMatchObject({ jobId: cropId, subtitleClock: 'seconds', subtitles });
  const remoteId = randomUUID();
  const network = vi.spyOn(globalThis, 'fetch');
  try {
    network.mockRejectedValue(new Error('Solicitud inesperada'));
    await expect(handlers.render({ ...job, userId: otherIdentity!.user.id })).rejects.toThrow(
      /no encontrado/i
    );
    await expect(
      handlers.render({ ...job, inputData: { videoPath: 'uploads/historic.mp4' } })
    ).rejects.toThrow(/importar/i);
    expect(network).not.toHaveBeenCalled();
    network
      .mockResolvedValueOnce(Response.json({ jobId: remoteId }))
      .mockResolvedValueOnce(
        Response.json({ status: 'completed', videoUrl: 'http://wrong.test/renders/other.mp4' })
      )
      .mockResolvedValueOnce(new Response(bytes));
    const result = await handlers.render(job);
    await queueService.complete(claimed!.task.id, jobId, result);
    const admission = JSON.parse(String(network.mock.calls[0]![1]?.body));
    expect(admission.webJobId).toBe(jobId);
    expect(admission.sourceAsset).toMatchObject({
      assetId: derivedId,
      width: 32,
      height: 32,
      durationMs: 1000,
    });
    expect(admission.logoAsset).toMatchObject({
      assetId: logoId,
      mediaType: 'image/png',
      width: 1,
      height: 1,
    });
    expect(admission.inputProps.subtitles).toEqual([{ ...subtitles[0], id: 1 }]);
    expect(admission.inputProps.brandKit).not.toHaveProperty('logoUrl');
    expect(network.mock.calls[2]![0]).toBe('http://localhost:3001/renders/' + remoteId + '.mp4');
    const { GET } = await import('@/app/api/jobs/[id]/route');
    const receipt = await (
      await GET(new NextRequest(baseURL, { headers: { cookie } }), {
        params: Promise.resolve({ id: jobId }),
      })
    ).json();
    const outputId = receipt.data.resultData.outputAssetId;
    expect(receipt.data.resultData.videoUrl).toBe('/api/studio/assets/' + outputId);
    const { GET: media } = await import('@/app/api/studio/assets/[id]/route');
    const read = (identity: string) =>
      media(new Request(baseURL, { headers: { cookie: identity, range: 'bytes=3-8' } }), {
        params: Promise.resolve({ id: outputId }),
      });
    expect((await read(otherCookie)).status).toBe(404);
    const own = await read(cookie);
    expect(own.status).toBe(206);
    expect(new Uint8Array(await own.arrayBuffer())).toEqual(bytes.slice(3, 9));
  } finally {
    network.mockRestore();
  }
});

it('legacyEditorIgnoresRawQueryPaths and never transcribes on navigation', async () => {
  let identity = cookie;
  // auth.ts has already imported next/headers. Supply a real request so the
  // page policy resolves its usual cookie-backed identity outside a Next server.
  const authModule = await import('@/auth');
  const resolve = authModule.auth;
  const session = vi
    .spyOn(authModule, 'auth')
    .mockImplementation(() => resolve(new Request(baseURL, { headers: { cookie: identity } })));
  vi.doMock('@/features/auth/components/workspace-shell', () => ({ WorkspaceShell: () => null }));
  vi.doMock('@/features/video/containers/editor-container', () => ({
    VideoEditorContainer: () => null,
  }));
  const { default: page } = await import('@/app/editor/[id]/page');
  const fetcher = vi
    .spyOn(globalThis, 'fetch')
    .mockRejectedValue(new Error('No se debe transcribir'));
  const params = (id: string) => ({
    params: Promise.resolve({ id }),
    searchParams: Promise.resolve({
      clipPath: 'uploads/other.mp4',
      videoUrl: 'http://engine/output/other.mp4',
    }),
  });
  try {
    const shell = await page(params(cropId));
    expect(shell.props.children.props.children.props).toEqual({
      sourceAssetId: derivedId,
      sourceDurationMs: 1000,
      subtitles: [],
    });
    expect((await page(params(staleId))).props.children.props.children[0].props.children).toMatch(
      /importar/i
    );
    identity = otherCookie;
    await expect(page(params(cropId))).rejects.toThrow(/404/);
    expect(fetcher).not.toHaveBeenCalled();
  } finally {
    session.mockRestore();
    fetcher.mockRestore();
  }
});

it('proxies Studio artifact Range and HEAD after checking the project and job', async () => {
  const { ProjectService } = await import('@/server/services/studio/project-service');
  const project = await new ProjectService(fixture.db).create(owner, {
    title: 'Fixture',
    engine: 'remotion',
    canvas: { width: 320, height: 240, fps: 24 },
  });
  const id = project.document.id,
    jobId = randomUUID();
  const { GET } = await import('@/app/api/studio/projects/[id]/renders/[jobId]/route');
  vi.stubEnv('STUDIO_RENDER_SECRET', randomUUID());
  const path = baseURL + '/api/studio/projects/' + id + '/renders/' + jobId + '?artifact=video';
  const call = (method: string, range: string, identity = cookie) =>
    GET(
      new Request(path, {
        method,
        headers: { cookie: identity, range, 'if-range': '"stamp"', 'x-extra': 'client-only' },
      }),
      { params: Promise.resolve({ id, jobId }) }
    );
  const network = vi.spyOn(globalThis, 'fetch').mockImplementation(async (url, init) => {
    const u = new URL(String(url));
    if (!u.pathname.endsWith('/video')) {
      expect(init?.method).toBe('GET');
      return Response.json({ projectId: id });
    }
    const h = new Headers(init?.headers);
    expect(h.get('cookie')).toBeNull();
    expect(h.get('x-extra')).toBeNull();
    expect(h.get('if-range')).toBe('"stamp"');
    if (h.get('range') === 'bytes=9000-')
      return new Response('internal error detail', {
        status: 416,
        headers: { 'content-range': 'bytes */900', 'x-internal': 'secret' },
      });
    expect(h.get('range')).toBe('bytes=1-3');
    return new Response(init?.method === 'HEAD' ? null : 'abc', {
      status: 206,
      headers: {
        'content-range': 'bytes 1-3/900',
        'accept-ranges': 'bytes',
        'content-length': '3',
        'content-type': 'video/mp4',
        etag: '"stamp"',
        'x-internal': 'secret',
      },
    });
  });
  try {
    expect((await call('GET', 'bytes=1-3', otherCookie)).status).toBe(404);
    expect(network).not.toHaveBeenCalled();
    const response = await call('GET', 'bytes=1-3');
    expect(response.status).toBe(206);
    expect(await response.text()).toBe('abc');
    expect(response.headers.get('content-range')).toBe('bytes 1-3/900');
    expect(response.headers.get('cache-control')).toBe('private, no-store');
    expect(response.headers.get('x-internal')).toBeNull();
    const head = await call('HEAD', 'bytes=1-3');
    expect(network.mock.calls.at(-1)?.[1]?.method).toBe('HEAD');
    expect(head.status).toBe(206);
    expect(head.body).toBeNull();
    expect(head.headers.get('content-length')).toBe('3');
    const invalid = await call('GET', 'bytes=9000-');
    expect(invalid.status).toBe(416);
    expect(invalid.headers.get('content-range')).toBe('bytes */900');
    expect(await invalid.text()).toBe('');
  } finally {
    network.mockRestore();
  }
});
