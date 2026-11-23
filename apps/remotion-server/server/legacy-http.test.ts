import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { AddressInfo } from 'node:net';

import { it, expect, vi } from 'vitest';
import { signServiceToken, type ServicePrincipal } from '@workspace/service-auth';
import { rendererApp } from './renderer-app';
import { exampleProject } from '@workspace/video-project/fixtures';
vi.mock('./project-adapter.js', () => ({
  RemotionProjectAdapter: class {
    async validate() {
      return [];
    }
    async prepare(_snapshot: unknown, workspace: string) {
      return workspace;
    }
    async render(workspace: string) {
      await writeFile(join(workspace, 'video.mp4'), 'technical');
    }
  },
  stageMedia: vi.fn(),
}));
import { makeRenderQueue } from './render-queue';

it('admits one job and limits status, cancellation and ranged artifacts to its two IDs and signed owner', async () => {
  const secret = randomBytes(40).toString('hex'),
    ownerId = randomUUID(),
    jobId = randomUUID(),
    id = randomUUID();
  const directory = await mkdtemp(join(tmpdir(), 'legacy-auth-'));
  const queue = makeRenderQueue({ serveUrl: '', rendersDir: directory });
  const create = vi.spyOn(queue, 'createJob').mockReturnValue(id);
  const { app, closeStudio } = rendererApp({
    queue,
    secret,
    rendersDir: directory,
    editorOrigin: 'http://localhost:3000',
    previewOrigin: 'http://preview.video-wizard.localhost:3001',
  });
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
  async function unsatisfiable(url: string, auth: HeadersInit) {
    for (const method of ['GET', 'HEAD']) {
      const res = await fetch(url, { method, headers: { ...auth, range: 'bytes=10-' } });
      expect(res.status).toBe(416);
      expect(res.headers.get('content-range')).toBe('bytes */9');
      expect(res.headers.get('cache-control')).toContain('no-store');
      expect(res.headers.get('accept-ranges')).toBe('bytes');
      expect(await res.text()).toBe('');
    }
  }
  try {
    const post = (h: HeadersInit, body: unknown = admission) =>
      fetch(base, { method: 'POST', headers: h, body: JSON.stringify(body) });
    expect(
      (
        await fetch(base, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: 'broken',
        })
      ).status
    ).toBe(401);
    expect((await post({})).status).toBe(401);
    expect(
      (await post(await headers('render.create', { audience: 'video-wizard-processing' }))).status
    ).toBe(401);
    expect(
      (await post({ ...(await headers('render.create')), 'x-studio-owner': ownerId })).status
    ).toBe(401);
    expect((await post(await headers('render.create', { jobId: randomUUID() }))).status).toBe(404);
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
      expect((await fetch(url)).status).toBe(401);
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
        await unsatisfiable(url, h);
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
    ).toBe(401);
    const origin = new URL(base).origin,
      projectId = randomUUID(),
      previewId = randomUUID();
    const studioHeaders = async (scope: string, refs: Partial<ServicePrincipal>) => ({
      'content-type': 'application/json',
      authorization:
        'Bearer ' +
        (await signServiceToken(
          { scope, audience: 'video-wizard-renderer', ownerId, ...refs },
          { secret }
        )),
    });
    const snapshot = {
      ownerId,
      revision: 'fixture',
      document: { ...exampleProject(), id: projectId },
      dependencies: { assets: {}, libraries: {} },
      bundles: {},
      diagnostics: [],
    };
    for (const [method, path] of [
      ['POST', '/renders'],
      ['POST', '/studio/previews'],
      ['DELETE', '/studio/previews/' + previewId],
      ['GET', '/studio/renders/' + id],
      ['GET', '/studio/renders/' + id + '/video'],
      ['DELETE', '/renders/' + id],
    ]) {
      const init = {
        method,
        ...(method === 'POST' && { body: 'broken' }),
        headers: { 'content-type': 'application/json' },
      };
      expect((await fetch(origin + path, init)).status).toBe(401);
      expect(
        (
          await fetch(origin + path, {
            ...init,
            headers: { ...init.headers, authorization: 'Bearer invalid' },
          })
        ).status
      ).toBe(401);
    }
    expect(
      (
        await fetch(base, {
          method: 'POST',
          headers: await studioHeaders('studio.create', { projectId }),
          body: 'broken',
        })
      ).status
    ).toBe(400);
    expect(
      (
        await fetch(origin + '/studio/previews/' + previewId, {
          method: 'DELETE',
          headers: await studioHeaders('preview.release', { projectId, previewId: randomUUID() }),
        })
      ).status
    ).toBe(404);
    const resp = await post(await studioHeaders('studio.create', { projectId }), {
      compositionId: 'StudioProject',
      snapshot,
    });
    expect(resp.status).toBe(202);
    const remote = (await resp.json()).jobId;
    const refs = { jobId: remote, projectId },
      resource = origin + '/studio/renders/' + remote;
    const statusHeaders = await studioHeaders('studio.read', refs);
    await expect
      .poll(async () => (await (await fetch(resource, { headers: statusHeaders })).json()).status)
      .toBe('completed');
    const artifact = resource + '/video';
    const artifactHeaders = await studioHeaders('studio.artifact', refs);
    expect(
      (await fetch(artifact, { headers: { ...artifactHeaders, range: 'bytes=2-4' } })).status
    ).toBe(206);
    await unsatisfiable(artifact, artifactHeaders);
    for (const [url, scope] of [
      [resource, 'studio.read'],
      [artifact, 'studio.artifact'],
    ]) {
      expect(
        (
          await fetch(url, {
            headers: await studioHeaders(scope, { ...refs, ownerId: randomUUID() }),
          })
        ).status
      ).toBe(404);
    }
  } finally {
    await closeStudio();
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
