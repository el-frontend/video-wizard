import { signServiceToken } from '@workspace/service-auth';
import express from 'express';
import { once } from 'node:events';
import { dirname } from 'node:path';
import { access } from 'node:fs/promises';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { expect, it, vi } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import type { ExportSnapshot } from '@workspace/render-contract';
import { installStudioRoutes } from './studio-http';
import { stageMedia } from './project-adapter';

vi.mock('./preview-builder.js', () => ({ buildPreview: vi.fn() }));
vi.mock('./project-adapter.js', () => ({
  RemotionProjectAdapter: class {
    async validate() {
      return [];
    }
  },
  stageMedia: vi.fn(),
}));

it('retires one overlapping preview, then cancels an unmounted preview while staging', async () => {
  const app = express();
  app.use(express.json());
  const http = app.listen(0, '127.0.0.1');
  await once(http, 'listening');
  const origin = 'http://127.0.0.1:' + (http.address() as AddressInfo).port;
  const secret = randomBytes(40).toString('hex'),
    ownerId = randomUUID(),
    projectId = randomUUID(),
    otherOwner = randomUUID(),
    otherProject = randomUUID();
  const api = installStudioRoutes(app, {
    secret,
    previewOrigin: origin,
    editorOrigin: 'http://localhost:3000',
  });
  const snap: ExportSnapshot = {
    ownerId,
    revision: 'v',
    document: { ...exampleProject(), id: projectId },
    dependencies: { assets: {}, libraries: {} },
    bundles: {},
    diagnostics: [],
  };
  const headers = async (
    scope: string,
    previewId: string,
    project = projectId,
    owner = ownerId
  ) => ({
    authorization:
      'Bearer ' +
      (await signServiceToken(
        { scope, previewId, projectId: project, ownerId: owner, audience: 'video-wizard-renderer' },
        { secret }
      )),
    'content-type': 'application/json',
  });
  const start = async (instance: string, signal?: AbortSignal) =>
    fetch(origin + '/studio/previews', {
      method: 'POST',
      headers: await headers('preview.create', instance),
      body: JSON.stringify({ snapshot: snap, instance }),
      signal,
    });
  const release = async (id: string, project = projectId, owner = ownerId) =>
    fetch(origin + '/studio/previews/' + id, {
      method: 'DELETE',
      headers: await headers('preview.release', id, project, owner),
    });
  const staged: { directory: string; signal?: AbortSignal; finish: () => void }[] = [];
  vi.mocked(stageMedia).mockImplementation(async (_s, directory, _config, signal) => {
    await new Promise<void>((resolve) => {
      staged.push({ directory, signal, finish: resolve });
      signal?.addEventListener('abort', resolve.bind(null, undefined), { once: true });
    });
  });
  const id1 = randomUUID(),
    id2 = randomUUID(),
    unmount = new AbortController();
  try {
    const retired = randomUUID(),
      other = randomUUID();
    expect((await release(retired)).status).toBe(204);
    expect((await release(retired)).status).toBe(204);
    expect((await start(retired)).status).toBe(404);
    expect(staged).toHaveLength(0);
    expect((await release(other, otherProject)).status).toBe(204);
    expect((await release(other, projectId, otherOwner)).status).toBe(204);
    const valid = start(other);
    await vi.waitFor(() => expect(staged).toHaveLength(1));
    expect((await release(other, otherProject)).status).toBe(404);
    expect((await release(other, projectId, otherOwner)).status).toBe(404);
    const finished = staged.pop()!;
    finished.finish();
    const response = await valid;
    expect(response.status).toBe(200);
    expect((await response.json()).instance).toBe(other);
    expect(finished.signal?.aborted).toBe(false);
    expect((await release(other)).status).toBe(204);
    await expect(access(dirname(finished.directory))).rejects.toThrow();
    const a = start(id1),
      b = start(id2, unmount.signal);
    a.catch(() => {});
    b.catch(() => {});
    await vi.waitFor(() => expect(staged).toHaveLength(2));
    expect((await release(id1)).status).toBe(204);
    expect((await a).ok).toBe(false);
    unmount.abort();
    await expect(b).rejects.toThrow();
    await vi.waitFor(() => expect(staged.every((x) => x.signal?.aborted)).toBe(true));
    for (const item of staged)
      await vi.waitFor(async () =>
        expect(
          await access(dirname(item.directory)).then(
            () => true,
            () => false
          )
        ).toBe(false)
      );
  } finally {
    staged.forEach((i) => i.finish());
    await api.close();
    http.closeAllConnections();
    http.close();
  }
});
