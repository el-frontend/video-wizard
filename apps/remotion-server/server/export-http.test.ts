import { once } from 'node:events';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import express from 'express';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { signServiceToken } from '@workspace/service-auth';
import { exampleProject } from '@workspace/video-project/fixtures';
import type { EngineAdapter } from '@workspace/render-contract';
import { exportTimes, snapshotDigest } from '@workspace/render-contract/export';
import { installExportRoutes } from './export-http';

const secret = randomBytes(40).toString('hex');
const ownerId = randomUUID(),
  jobId = randomUUID(),
  projectId = randomUUID();
const document = { ...exampleProject(), id: projectId };
const snapshot = {
  ownerId,
  document,
  revision: randomUUID(),
  diagnostics: [],
  bundles: {},
  dependencies: { assets: {}, libraries: {} },
};
const sha256 = 'a'.repeat(64);
const validate = vi.fn<EngineAdapter['validate']>();
const adapter = {
  validate,
  prepare: vi.fn(),
  snapshots: async () =>
    exportTimes(document.durationMs).map((t) => ({
      kind: 'snapshot',
      relativePath: 'frame-' + t + '.png',
      sha256,
    })),
  render: async () => ({
    width: document.canvas.width,
    height: document.canvas.height,
    durationMs: document.durationMs,
    hasAudio: true,
    artifacts: [{ kind: 'video', relativePath: 'video.mp4', sha256 }],
  }),
} satisfies EngineAdapter;
const pending = new Map<string, () => Promise<void>>();
let staging: string, base: string, close: () => Promise<void>;
async function start() {
  const app = express();
  const release = installExportRoutes(
    app,
    secret,
    { remotion: adapter, hyperframes: adapter },
    (id, run) => {
      pending.set(id, run);
      return () => {
        pending.delete(id);
      };
    }
  );
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  close = async () => {
    await release();
    await new Promise<void>((resolve) => server.close(() => resolve()));
  };
}
beforeEach(async () => {
  validate.mockReset().mockResolvedValue([]);
  pending.clear();
  staging = await mkdtemp(join(tmpdir(), 'studio-export-receipt-'));
  vi.stubEnv('STUDIO_EXPORT_STAGING', staging);
  await start();
});
afterEach(async () => {
  await close();
  await rm(staging, { force: true, recursive: true });
  vi.unstubAllEnvs();
});
async function request(attemptId: string, method: 'POST' | 'GET' | 'DELETE', owner = ownerId) {
  const scope = { POST: 'export.create', GET: 'export.read', DELETE: 'export.cancel' }[method];
  const token = await signServiceToken(
    { scope, audience: 'video-wizard-renderer', jobId, projectId, ownerId: owner, attemptId },
    { secret }
  );
  return fetch(base + '/studio/export-attempts/' + attemptId, {
    method,
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body:
      method === 'POST'
        ? JSON.stringify({ snapshot, snapshotHash: snapshotDigest(snapshot) })
        : undefined,
  });
}

it.each(['queued', 'before POST'])(
  'remembers cancellation %s across restart and replay',
  async (order) => {
    const id = randomUUID();
    if (order === 'queued') {
      expect((await request(id, 'POST')).status).toBe(202);
      expect(pending.has(id)).toBe(true);
    }
    expect((await request(id, 'DELETE')).status).toBe(204);
    expect(pending.has(id)).toBe(false);
    await close();
    await start();
    expect((await request(id, 'DELETE', randomUUID())).status).toBe(404);
    expect(await (await request(id, 'POST')).json()).toMatchObject({
      attemptId: id,
      status: 'cancelled',
    });
    expect((await request(id, 'DELETE')).status).toBe(204);
    expect((await (await request(id, 'GET')).json()).status).toBe('cancelled');
    expect(pending.has(id)).toBe(false);
    expect(validate).not.toHaveBeenCalled();
  }
);

it.each(['completed', 'failed'])(
  'preserves a %s receipt after repeated DELETE and restart',
  async (status) => {
    const id = randomUUID();
    if (status === 'failed') validate.mockRejectedValueOnce(Error('engine'));
    expect((await request(id, 'POST')).status).toBe(202);
    await pending.get(id)!();
    const original = await (await request(id, 'GET')).json();
    expect(original.status).toBe(status);
    expect(original[status === 'completed' ? 'result' : 'error']).toBeTruthy();
    expect((await request(id, 'DELETE')).status).toBe(204);
    expect(await (await request(id, 'GET')).json()).toEqual(original);
    await close();
    await start();
    expect((await request(id, 'DELETE')).status).toBe(204);
    expect(await (await request(id, 'POST')).json()).toEqual(original);
    expect(await (await request(id, 'GET')).json()).toEqual(original);
    expect(validate).toHaveBeenCalledTimes(1);
  }
);

it('keeps old digest-only admissions consumed after restart', async () => {
  const id = randomUUID(),
    directory = join(staging, jobId),
    digest = snapshotDigest(snapshot);
  await mkdir(directory);
  const marker = join(directory, id + '.admitted');
  await writeFile(marker, digest);
  expect((await request(id, 'POST')).status).toBe(409);
  expect((await request(id, 'GET')).status).toBe(404);
  expect((await request(id, 'DELETE')).status).toBe(204);
  expect(await readFile(marker, 'utf8')).toBe(digest);
  expect(pending.size).toBe(0);
});
