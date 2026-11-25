import { execFileSync, spawn } from 'node:child_process';
import { createHash, randomUUID, randomBytes } from 'node:crypto';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { existsSync, readdirSync, statSync } from 'node:fs';
import { mkdir, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { beforeAll, afterAll, describe, expect, it, vi } from 'vitest';
import { authFixture } from '../auth/auth-test-fixture';
import { users, studioAssets } from '../db/schema';
import { ProjectService } from '../services/studio/project-service';

const require = createRequire(import.meta.url);
async function until(check, timeout = 100000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const result = await check();
    if (result) return result;
    await delay(35);
  }
  throw Error('Timed out waiting for ' + check.name);
}
// Observe the pinned CLI's real disk-capture and encoding files (same boundaries as R2).
function nativeBytes(workspace, stage) {
  if (!existsSync(workspace)) return 0;
  const render = readdirSync(workspace).find((f) => f.startsWith('render-'));
  if (!render) return 0;
  const work = readdirSync(join(workspace, render)).find((f) => f.startsWith('work-'));
  if (!work) return 0;
  const dir = join(workspace, render, work);
  if (stage === 'encode')
    return statSync(join(dir, 'video-only.mp4'), { throwIfNoEntry: false })?.size || 0;
  return Math.max(
    ...['jpg', 'png'].map(
      (ext) =>
        statSync(join(dir, 'captured-frames', 'frame_000001.' + ext), { throwIfNoEntry: false })
          ?.size || 0
    )
  );
}

describe.skipIf(import.meta.env.MODE !== 'exports')(
  'durable Studio export with an isolated renderer',
  () => {
    let fixture,
      runtime,
      container,
      media,
      files,
      stage,
      docker,
      worker,
      launched = false,
      context;
    const evidence = { cancellations: [], recovery: null, filesystem: null };
    beforeAll(async () => {
      fixture = await authFixture();
      const root = resolve('../..');
      runtime = await mkdtemp(join(tmpdir(), 'studio-export-qa-'));
      console.info('R5 evidence', runtime);
      ((container = 'studio-export-qa-' + randomUUID()),
        (media = join(runtime, 'data')),
        (files = join(runtime, 'exports')),
        (stage = join(files, 'staging')));
      const secret = randomBytes(48).toString('hex');
      docker = (args) =>
        execFileSync('docker', args, {
          encoding: 'utf8',
          timeout: 60000,
          env: { ...process.env, STUDIO_RENDER_SECRET: secret },
        }).trim();

      await mkdir(media, { recursive: true, mode: 0o700 });
      await mkdir(stage, { recursive: true, mode: 0o700 });
      const sources = [
        'apps/remotion-server/server',
        'apps/hyperframes-worker/src',
        'packages/hyperframes-compositions/src',
        'packages/remotion-compositions/src',
        'packages/video-project/src',
        'packages/render-contract/src',
        'packages/render-contract/package.json',
        'packages/service-auth/src',
      ];
      const mounts = sources.flatMap((p) => [
        '--mount',
        'type=bind,source=' + join(root, p) + ',target=/app/' + p + ',readonly',
      ]);
      const reservation = createServer().listen(0, '127.0.0.1');
      await once(reservation, 'listening');
      const port = reservation.address().port;
      await new Promise((resolve) => reservation.close(resolve));
      docker([
        'run',
        '-d',
        '--init',
        '--name',
        container,
        '--shm-size=2g',
        '-p',
        '127.0.0.1:' + port + ':3001',
        '-e',
        'STUDIO_RENDER_SECRET',
        '-e',
        'STUDIO_EXPORT_STAGING=/var/staging',
        '-e',
        'MAX_CONCURRENT_RENDERS=2',
        '-e',
        'PRODUCER_LOW_MEMORY_MODE=true',
        '-e',
        'PRODUCER_ENABLE_STREAMING_ENCODE=false',
        '--mount',
        'type=bind,source=' + media + ',target=/app/.studio-data,readonly',
        '--mount',
        'type=bind,source=' + stage + ',target=/var/staging',
        ...mounts,
        process.env.STUDIO_EXPORT_TEST_IMAGE || 'video-wizard-renderer:local',
      ]);
      launched = true;
      const base = 'http://' + docker(['port', container, '3001/tcp']);
      await until(async function health() {
        try {
          return (await fetch(base + '/health')).ok;
        } catch {
          return false;
        }
      });
      vi.stubEnv('STUDIO_RENDER_SECRET', secret);
      vi.stubEnv('STUDIO_DATA_DIR', media);
      vi.stubEnv('STUDIO_EXPORT_DIR', files);
      vi.stubEnv('REMOTION_SERVER_URL', base);
      vi.doMock('@/server/db', () => ({ db: fixture.db }));
      const { exportsService } = await import('../services/studio/export-service');
      const { processStudioExport } = await import('./studio-handlers');
      const { queueService } = await import('../services/queue-service');
      const { internal } = await import('../services/studio/remotion-service');
      const available = JSON.parse(
        docker([
          'exec',
          container,
          'node',
          '-e',
          `const fs=require('fs');const base='/var/staging';const d=fs.statfsSync(base);Promise.all(['one','two'].map(async n=>{const p=base+'/'+n;await fs.promises.mkdir(p,{mode:0o700});await fs.promises.writeFile(p+'/out','ok');await fs.promises.rename(p+'/out',p+'/ok')})).then(()=>console.log(JSON.stringify({uid:process.getuid(),gid:process.getgid(),bytes:d.bavail*d.bsize,mode:fs.statSync(base+'/one').mode&511})))`,
        ])
      );
      expect(available.bytes).toBeGreaterThan(1024 ** 3);
      expect(available.mode).toBe(448);
      expect(await readFile(join(stage, 'two', 'ok'), 'utf8')).toBe('ok');
      evidence.filesystem = available;
      const processes = () =>
        docker([
          'exec',
          container,
          'node',
          '-e',
          `const fs=require('fs');for(const id of fs.readdirSync('/proc').filter(v=>/^\\d+$/.test(v))){try{const comm=fs.readFileSync('/proc/'+id+'/comm','utf8').trim();if(/chromium|chrome|ffmpeg|headless/i.test(comm)) console.log(id,comm);}catch{}}`,
        ]);
      const owner = randomUUID(),
        assetId = randomUUID();
      await fixture.db.insert(users).values({ id: owner, email: owner + '@example.test' });
      const pattern = join(runtime, 'synthetic.mp4');
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'testsrc2=s=960x540:r=25:d=12,noise=alls=18:all_seed=17:allf=t+u',
        '-c:v',
        'libx264',
        '-preset',
        'ultrafast',
        pattern,
      ]);
      const bytes = await readFile(pattern),
        hash = createHash('sha256').update(bytes).digest('hex');
      await mkdir(join(media, 'assets', owner), { recursive: true });
      await writeFile(join(media, 'assets', owner, hash), bytes);
      await fixture.db
        .insert(studioAssets)
        .values({
          id: assetId,
          ownerId: owner,
          hash,
          name: 'fixture.mp4',
          mediaType: 'video/mp4',
          sizeBytes: bytes.length,
          durationMs: 12000,
          width: 960,
          height: 540,
          hasAudio: false,
        });
      const projects = new ProjectService(fixture.db);
      const toneId = randomUUID();
      const tone = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=2',
        '-f',
        'wav',
        'pipe:1',
      ]);
      const toneHash = createHash('sha256').update(tone).digest('hex');
      await writeFile(join(media, 'assets', owner, toneHash), tone);
      await fixture.db
        .insert(studioAssets)
        .values({
          id: toneId,
          ownerId: owner,
          hash: toneHash,
          name: 'tone.wav',
          mediaType: 'audio/wav',
          sizeBytes: tone.length,
          durationMs: 2000,
          hasAudio: true,
        });
      async function admit(engine, durationMs, noisy = true, withAudio = false) {
        const p = await projects.create(owner, {
          title: 'Original',
          engine,
          canvas: { width: 960, height: 540, fps: 25 },
        });
        const l = {
          id: 'picture',
          type: 'video',
          assetId,
          sourceInMs: 0,
          volume: 0,
          fit: 'cover',
          focalPoint: { x: 0.5, y: 0.5 },
          visible: true,
          zIndex: 0,
          startMs: 0,
          endMs: durationMs,
          endAnchor: 'fixed',
          box: { x: 0, y: 0, width: 960, height: 540 },
        };
        const doc = {
          ...p.document,
          assetIds: [...(noisy ? [assetId] : []), ...(withAudio ? [toneId] : [])],
          globalAudio: withAudio
            ? [
                {
                  id: 'tone',
                  type: 'audio',
                  assetId: toneId,
                  sourceInMs: 0,
                  volume: 1,
                  visible: true,
                  startMs: 0,
                  endMs: durationMs,
                  endAnchor: 'fixed',
                  zIndex: 0,
                },
              ]
            : [],
          durationMs,
          scenes: [{ id: 'scene', durationMs, layers: noisy ? [l] : [] }],
        };
        const saved = await projects.save(owner, doc.id, {
          baseRevision: p.revision,
          document: doc,
        });
        const job = await exportsService.enqueue(owner, doc.id, {
          baseRevision: saved.revision,
          idempotencyKey: randomUUID(),
        });
        return { saved, job, doc };
      }
      async function projectState(id) {
        return await exportsService.get(owner, id);
      }
      const workerEnv = {
        ...process.env,
        DATABASE_URL: fixture.connectionString,
        WORKER_CONCURRENCY: '1',
        WORKER_POLL_INTERVAL: '100',
        TSX_TSCONFIG_PATH: resolve('tsconfig.json'),
      };
      function startWorker() {
        const child = spawn(
          process.execPath,
          ['--import', require.resolve('tsx'), resolve('scripts/worker.ts')],
          { cwd: runtime, env: workerEnv, stdio: ['ignore', 'pipe', 'pipe'] }
        );
        // Store only safe diagnostics, never arguments/environment or provider material.
        child.stdout.resume();
        child.stderr.resume();
        return child;
      }
      context = {
        admit,
        projectState,
        owner,
        queueService,
        processStudioExport,
        internal,
        base,
        processes,
        exportsService,
        projects,
        startWorker,
      };
    }, 120000);
    it('cancels while Remotion renders and HyperFrames captures and encodes', async () => {
      const {
        admit,
        projectState,
        owner,
        queueService,
        processStudioExport,
        internal,
        base,
        processes,
        exportsService,
      } = context;
      for (const [engine, phase] of [
        ['remotion', 'render'],
        ['hyperframes', 'capture'],
        ['hyperframes', 'encode'],
      ]) {
        const { job } = await admit(engine, 12000);
        const claim = await queueService.claimNext('default');
        const workspace = join(stage, job.id, claim.task.attemptId);
        const done = processStudioExport(claim);
        const observed = await until(async function actualMediaWork() {
          const s = await projectState(job.id);
          if (s.status !== 'running')
            throw Error('Attempt exited before ' + engine + '/' + phase + ' (' + s.status + ')');
          const n =
            engine === 'remotion'
              ? s.progress > 16
                ? s.progress
                : 0
              : nativeBytes(workspace, phase);
          return n > (phase === 'encode' ? 4096 : 0) ? n : 0;
        });
        const before = processes();
        expect(before).toMatch(phase === 'encode' ? /ffmpeg/ : /chrome|chromium|headless/);
        const refs = { projectId: job.projectId, jobId: job.id, attemptId: claim.task.attemptId };
        const path = '/studio/export-attempts/' + claim.task.attemptId;
        const status = await (
          await internal(owner, { ...refs, scope: 'export.read' }, path)
        ).json();
        expect(status.attemptId).toBe(claim.task.attemptId);
        const bad = await fetch(base + path);
        expect(bad.status).toBe(401);
        await expect(
          internal(randomUUID(), { ...refs, scope: 'export.cancel' }, path, undefined, {
            release: true,
          })
        ).rejects.toMatchObject({ status: 404 });
        const cancel = await exportsService.cancel(owner, job.id);
        expect(cancel.status).toBe('cancelling');
        await done;
        expect((await projectState(job.id)).status).toBe('cancelled');
        expect(
          existsSync(join(files, 'published', owner, job.projectId, job.revision, job.id))
        ).toBe(false);
        await until(function noChromeOrEncoder() {
          return !processes();
        }, 10000);
        evidence.cancellations.push({
          engine,
          phase,
          observed,
          processes: before.split('\n').length,
        });
        await writeFile(join(runtime, 'evidence.json'), JSON.stringify(evidence, null, 2));
      }
    }, 180000);
    it('runs two attempts concurrently on private writable paths with read-only source media', async () => {
      const { admit, owner, queueService, processStudioExport, projectState } = context;
      const [a, b] = await Promise.all([
        admit('remotion', 1500),
        admit('hyperframes', 1500, false, true),
      ]);
      const claims = await Promise.all([
        queueService.claimNext('default'),
        queueService.claimNext('default'),
      ]);
      const work = Promise.all(claims.map(processStudioExport));
      const paths = claims.map((c) => join(stage, c.job.id, c.task.attemptId));
      await until(function bothWorkspaces() {
        return paths.every((p) => existsSync(p));
      });
      const native = claims.find((c) => c.job.id === b.job.id);
      await until(function cliWorkspace() {
        return existsSync(join(stage, b.job.id, native.task.attemptId, 'cli-tmp'));
      });
      const output = '/var/staging/' + b.job.id + '/' + native.task.attemptId;
      const measurement = JSON.parse(
        docker([
          'exec',
          container,
          'node',
          '-e',
          `const fs=require('fs');const stat=p=>{const s=fs.statfsSync(p);return s.bavail*s.bsize};let ro=false;try{fs.writeFileSync('/app/.studio-data/qa-ro','x')}catch(e){ro=e.code==='EROFS'} console.log(JSON.stringify({readOnly:ro,tmp:stat(process.argv[1]+'/cli-tmp'),output:stat(process.argv[1])}))`,
          output,
        ])
      );
      expect(measurement.readOnly).toBe(true);
      expect(Math.min(measurement.tmp, measurement.output)).toBeGreaterThan(1024 ** 3);
      await work;
      for (const { job } of [a, b]) expect((await projectState(job.id)).status).toBe('completed');
      evidence.concurrent = {
        jobs: claims.map((c) => c.job.id),
        attempts: claims.map((c) => c.task.attemptId),
        ...measurement,
      };
      await writeFile(join(runtime, 'evidence.json'), JSON.stringify(evidence, null, 2));
    }, 120000);
    it('reclaims a killed worker and publishes only the frozen revision', async () => {
      const { admit, owner, projects, startWorker, projectState } = context;
      const { job, doc, saved } = await admit('remotion', 5000);
      worker = startWorker();
      const first = await until(async function receipt() {
        if (worker.exitCode !== null) throw Error('Test worker exited with ' + worker.exitCode);
        const { rows } = await fixture.pool.query(
          'SELECT progress,result_data FROM jobs WHERE id=$1',
          [job.id]
        );
        return rows[0].progress > 16 && rows[0].result_data?.remoteAttemptId;
      });
      const exit = once(worker, 'exit');
      worker.kill('SIGKILL');
      await exit;
      worker = undefined;
      await projects.save(owner, doc.id, {
        baseRevision: saved.revision,
        document: { ...doc, title: 'Edited while exporting' },
      });
      await fixture.pool.query(
        "UPDATE queue_tasks SET lease_until=clock_timestamp()-interval '1 second' WHERE job_id=$1",
        [job.id]
      );
      worker = startWorker();
      const complete = await until(async function committed() {
        const s = await projectState(job.id);
        if (s.status === 'failed') throw Error('Recovery render failed');
        return s.status === 'completed' ? s : null;
      });
      expect(complete.attemptId).not.toBe(first);
      expect(complete.revision).toBe(saved.revision);
      expect(complete.artifacts).toHaveLength(4);
      const directory = join(files, 'published', owner, doc.id, saved.revision, job.id);
      expect(readdirSync(directory)).toEqual([complete.attemptId]);
      for (const a of complete.artifacts)
        expect(
          createHash('sha256')
            .update(await readFile(join(directory, complete.attemptId, a.name)))
            .digest('hex')
        ).toBe(a.sha256);
      const manifest = JSON.parse(
        await readFile(join(directory, complete.attemptId, 'manifest.json'), 'utf8')
      );
      expect(manifest.snapshotHash).toBe(complete.snapshotHash);
      evidence.recovery = {
        job: job.id,
        first,
        second: complete.attemptId,
        revision: saved.revision,
        digest: complete.snapshotHash,
        media: manifest.artifacts,
      };
      await writeFile(join(runtime, 'evidence.json'), JSON.stringify(evidence, null, 2));
      const drained = once(worker, 'exit');
      worker.kill('SIGTERM');
      await drained;
      worker = undefined;
    }, 150000);
    it('reconciles a restarted renderer and publishes a HyperFrames MP4 with audible narration', async () => {
      const { admit, owner, startWorker, projectState } = context;
      worker = startWorker();
      const native = await admit('hyperframes', 2000, false, true);
      const previous = await until(async function nativeReceipt() {
        const { rows } = await fixture.pool.query('SELECT result_data FROM jobs WHERE id=$1', [
          native.job.id,
        ]);
        return rows[0].result_data?.remoteAttemptId;
      });
      docker(['restart', '-t', '1', container]);
      const next = await until(async function afterRendererRestart() {
        const s = await projectState(native.job.id);
        if (s.status === 'failed') throw Error('Native renderer recovery: ' + s.error);
        return s.status === 'completed' ? s : null;
      });
      expect(next.attemptId).not.toBe(previous);
      const nativeDir = join(
        files,
        'published',
        owner,
        native.doc.id,
        next.revision,
        next.id,
        next.attemptId
      );
      const measured = JSON.parse(await readFile(join(nativeDir, 'manifest.json'), 'utf8'));
      expect(measured).toMatchObject({
        hasAudio: true,
        width: 960,
        height: 540,
        snapshotHash: next.snapshotHash,
      });
      const sample = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-i',
        join(nativeDir, 'video.mp4'),
        '-t',
        '0.5',
        '-map',
        '0:a:0',
        '-ac',
        '1',
        '-ar',
        '8000',
        '-f',
        's16le',
        'pipe:1',
      ]);
      let energy = 0;
      for (let i = 0; i < sample.length; i += 2) energy += sample.readInt16LE(i) ** 2;
      const rms = Math.sqrt(energy / (sample.length / 2));
      expect(rms).toBeGreaterThan(50);
      evidence.rendererRestart = {
        job: next.id,
        first: previous,
        second: next.attemptId,
        durationMs: measured.durationMs,
        audioRms: rms,
        snapshotHash: next.snapshotHash,
      };
      const hostDevices = await Promise.all(
        [stage, join(files, 'incoming'), join(files, 'published')].map((p) =>
          stat(p).then((s) => s.dev)
        )
      );
      expect(new Set(hostDevices).size).toBe(1);
      evidence.filesystem.hostDevices = hostDevices;
      await writeFile(join(runtime, 'evidence.json'), JSON.stringify(evidence, null, 2));
    }, 150000);
    afterAll(async () => {
      if (worker && worker.exitCode === null && worker.signalCode === null) {
        const exit = once(worker, 'exit');
        worker.kill('SIGKILL');
        await exit;
      }
      if (launched) docker(['rm', '-f', container]);
      await fixture?.close();
      vi.unstubAllEnvs();
    });
  }
);
