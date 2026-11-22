import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { it, expect, vi } from 'vitest';
import { signServiceToken, type ServicePrincipal } from '@workspace/service-auth';
import { installLegacyRoutes } from './legacy-http';
import { makeRenderQueue } from './render-queue';

it('admits one job and limits status, cancellation and ranged artifacts to its two IDs and signed owner', async () => {
  const secret = randomBytes(40).toString('hex'),
    ownerId = randomUUID(),
    jobId = randomUUID(),
    id = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), 'legacy-auth-'));
  const queue = makeRenderQueue({ serveUrl: '', rendersDir: directory });
  const create = vi.spyOn(queue, 'createJob').mockReturnValue(id);
  const app = express();
  app.use(express.json());
  installLegacyRoutes(app, queue, secret, directory);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port + '/renders';
  const admission = {
    webJobId: jobId,
    compositionId: 'VideoWithSubtitles' as const,
    sourceAsset: {
      assetId: randomUUID(),
      hash: 'a'.repeat(64),
      mediaType: 'video/mp4',
      durationMs: 1000,
    },
    inputProps: {
      subtitles: [],
      template: 'viral' as const,
      language: 'es',
      aspectRatio: '1:1' as const,
      backgroundColor: '#000000',
      durationInFrames: 30,
    },
  };
  const headers = async (scope: string, extra: Partial<ServicePrincipal> = {}) => ({
    authorization:
      'Bearer ' +
      (await signServiceToken(
        { ownerId, jobId, audience: 'video-wizard-renderer', scope, ...extra },
        { secret }
      )),
    'content-type': 'application/json',
  });
  try {
    const post = (h: HeadersInit, body: unknown = admission) =>
      fetch(base, { method: 'POST', headers: h, body: JSON.stringify(body) });
    expect((await post({})).status).toBe(401);
    expect(
      (await post(await headers('render.create', { audience: 'video-wizard-processing' }))).status
    ).toBe(401);
    expect(
      (await post({ ...(await headers('render.create')), 'x-studio-owner': ownerId })).status
    ).toBe(401);
    expect((await post(await headers('render.create', { jobId: randomUUID() }))).status).toBe(400);
    expect(
      (
        await post(await headers('render.create'), {
          ...admission,
          inputProps: { ...admission.inputProps, videoUrl: 'extra' },
        })
      ).status
    ).toBe(400);
    expect(create).not.toHaveBeenCalled();
    expect((await post(await headers('render.create'))).status).toBe(202);
    queue.jobs.set(id, {
      data: { ownerId, admission },
      status: 'completed',
      cancel: () => {},
      progress: 1,
    });
    await writeFile(join(directory, id + '.mp4'), 'technical');
    for (const [suffix, scope] of [
      ['', 'render.read'],
      ['.mp4', 'render.artifact'],
    ] as const) {
      const url = base + '/' + id + suffix;
      expect((await fetch(url)).status).toBe(404);
      for (const extra of [
        { jobId: randomUUID() },
        { ownerId: randomUUID() },
        { rendererJobId: randomUUID() },
      ])
        expect(
          (await fetch(url, { headers: await headers(scope, { rendererJobId: id, ...extra }) }))
            .status
        ).toBe(404);
      const h = await headers(scope, { rendererJobId: id });
      const response = await fetch(url, { headers: { ...h, range: 'bytes=0-2' } });
      if (suffix) {
        expect(response.status).toBe(206);
        expect(await response.text()).toBe('tec');
        expect((await fetch(url, { method: 'HEAD', headers: h })).status).toBe(200);
      } else expect(await response.json()).toEqual({ progress: 1, status: 'completed' });
    }
    expect(
      (
        await fetch(base + '/' + id, {
          method: 'DELETE',
          headers: await headers('render.read', { rendererJobId: id }),
        })
      ).status
    ).toBe(404);
  } finally {
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
