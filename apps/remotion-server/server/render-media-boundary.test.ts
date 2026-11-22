import { encodeLegacy } from './legacy-encoder';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { once } from 'node:events';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { afterEach, expect, it, vi } from 'vitest';
import { selectComposition, renderMedia } from '@remotion/renderer';
import { assetPath } from '@workspace/render-contract/storage';
import { signServiceToken } from '@workspace/service-auth';
import { installLegacyRoutes } from './legacy-http';
import { makeRenderQueue } from './render-queue';

vi.mock('@remotion/renderer', () => ({
  makeCancelSignal: () => ({ cancel: () => {}, cancelSignal: () => {} }),
  selectComposition: vi.fn(),
  renderMedia: vi.fn(),
}));
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

it('executes an admitted job after expiry and closes the staged media host', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'legacy-media-'));
  vi.stubEnv('STUDIO_DATA_DIR', directory);
  const ownerId = randomUUID(),
    jobId = randomUUID(),
    secret = randomBytes(40).toString('hex');
  const bytes = Buffer.from('technical-media');
  const hash = createHash('sha256').update(bytes).digest('hex');
  await writeFile(await assetPath(directory, ownerId, hash, true), bytes);
  const queue = makeRenderQueue({
    rendersDir: directory,
    serveUrl: 'fixture',
    encode: encodeLegacy,
  });
  let release!: () => void;
  const blocker = new Promise<void>((resolve) => {
    release = resolve;
  });
  queue.schedule('block', () => blocker);
  const app = express();
  installLegacyRoutes(app, queue, secret, directory);
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
  const body = {
    webJobId: jobId,
    compositionId: 'VideoWithSubtitles',
    sourceAsset: { assetId: randomUUID(), hash, mediaType: 'video/mp4', durationMs: 100 },
    inputProps: {
      subtitles: [],
      template: 'viral',
      backgroundColor: '#000000',
      durationInFrames: 3,
      aspectRatio: '1:1',
      language: 'es',
    },
  };
  let videoUrl = '';
  vi.mocked(selectComposition).mockImplementation(async (options) => {
    videoUrl = String(options.inputProps?.videoUrl);
    const head = await fetch(videoUrl, { method: 'HEAD' });
    expect(head.headers.get('content-length')).toBe(String(bytes.length));
    const range = await fetch(videoUrl, { headers: { range: 'bytes=0-2' } });
    expect(range.status).toBe(206);
    expect(await range.text()).toBe('tec');
    return {} as Awaited<ReturnType<typeof selectComposition>>;
  });
  vi.mocked(renderMedia).mockImplementation(async (options) => {
    expect(options.inputProps?.videoUrl).toBe(videoUrl);
    expect(await (await fetch(videoUrl)).text()).toBe('technical-media');
    return {} as Awaited<ReturnType<typeof renderMedia>>;
  });
  try {
    vi.useFakeTimers({ toFake: ['Date'] });
    const token = await signServiceToken(
      { ownerId, jobId, scope: 'render.create', audience: 'video-wizard-renderer' },
      { secret }
    );
    const create = () =>
      fetch(base + '/renders', {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + token },
        body: JSON.stringify(body),
      });
    const response = await create();
    expect(response.status).toBe(202);
    const { jobId: id } = await response.json();
    expect(queue.jobs.get(id)?.status).toBe('queued');
    vi.setSystemTime(Date.now() + 301000);
    expect((await create()).status).toBe(401);
    release();
    await vi.waitFor(() => expect(queue.jobs.get(id)?.status).toBe('completed'));
    expect(videoUrl.startsWith('http://127.0.0.1:')).toBe(true);
    await expect(fetch(videoUrl)).rejects.toThrow();
  } finally {
    release();
    server.closeAllConnections();
    server.close();
    await rm(directory, { recursive: true, force: true });
  }
});
