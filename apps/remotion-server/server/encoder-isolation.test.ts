import { fork, type ChildProcess, type ForkOptions } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
import { access, mkdtemp, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { it, expect, vi, afterEach } from 'vitest';
import { assetPath } from '@workspace/render-contract/storage';
import { makeRenderQueue } from './render-queue';
import type { LegacyRenderAdmission } from '@workspace/render-contract';

vi.mock('node:child_process', async (original) => ({
  ...(await original<typeof import('node:child_process')>()),
  fork: vi.fn(),
}));
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

it.each(['failure', 'cancel'])(
  'discards encoder output and closes the private media host after %s',
  async (mode) => {
    const directory = await mkdtemp(join(tmpdir(), 'studio-encoder-'));
    const script = join(directory, 'fixture.mjs');
    vi.stubEnv('STUDIO_DATA_DIR', directory);
    vi.stubEnv('STUDIO_RENDER_SECRET', randomUUID());
    const ownerId = randomUUID(),
      hash = createHash('sha256').update('fixture').digest('hex');
    await writeFile(await assetPath(directory, ownerId, hash, true), 'fixture');
    await writeFile(
      script,
      `
    import { writeFileSync } from 'node:fs';
    process.on('message',m=>{
      if(typeof m!=='object')return;
      writeFileSync(m.outputLocation, 'partial');
      const url=m.inputProps.videoUrl;
      process.stdout.write(url);process.stderr.write(url);
      process.send(url);
      process.send(0.25,()=>{${mode === 'failure' ? 'process.exit(1)' : ''}});
    });
  `
    );
    const { fork: realFork } =
      await vi.importActual<typeof import('node:child_process')>('node:child_process');
    let worker: ChildProcess | undefined;
    let mediaUrl = '';
    vi.mocked(fork).mockImplementation((_path, _args, options) => {
      const config = options as ForkOptions;
      expect(config.stdio).toEqual(['ignore', 'ignore', 'ignore', 'ipc']);
      expect(config.env?.STUDIO_RENDER_SECRET === undefined).toBe(true);
      worker = realFork(script, [], { ...config, execArgv: [] });
      worker.on('message', (value) => {
        if (typeof value === 'string') mediaUrl = value;
      });
      return worker;
    });
    const logs = vi.spyOn(console, 'error').mockImplementation(() => {});
    const queue = makeRenderQueue({ rendersDir: directory, serveUrl: 'fixture' });
    const admission: LegacyRenderAdmission = {
      compositionId: 'VideoWithSubtitles',
      webJobId: randomUUID(),
      sourceAsset: { assetId: randomUUID(), hash, mediaType: 'video/mp4', durationMs: 100 },
      inputProps: {
        aspectRatio: '1:1',
        template: 'viral',
        language: 'es',
        subtitles: [],
        backgroundColor: '#000000',
        durationInFrames: 3,
      },
    };
    try {
      const id = queue.createJob({ ownerId, admission }),
        job = queue.jobs.get(id)!;
      await vi.waitFor(() => expect(job.progress).toBe(0.25));
      if (mode === 'cancel') job.cancel();
      await vi.waitFor(
        () => expect(worker?.exitCode === 1 || worker?.signalCode === 'SIGKILL').toBe(true),
        { timeout: 6000 }
      );
      await vi.waitFor(async () =>
        expect(
          await fetch(mediaUrl).then(
            () => false,
            () => true
          )
        ).toBe(true)
      );
      expect(job.status).toBe(mode === 'failure' ? 'failed' : 'cancelled');
      await expect(access(join(directory, id + '.mp4'))).rejects.toMatchObject({ code: 'ENOENT' });
      expect(JSON.stringify(job).includes(mediaUrl)).toBe(false);
      expect(logs).not.toHaveBeenCalled();
    } finally {
      worker?.kill();
      await rm(directory, { recursive: true, force: true });
    }
  },
  10000
);
