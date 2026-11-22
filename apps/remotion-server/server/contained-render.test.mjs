import { execFileSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { cp, readFile, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { expect, it } from 'vitest';
import { signServiceToken } from '@workspace/service-auth';

// The native acceptance fixture contains only generated colors, tones and bundled fonts.
it.skipIf(import.meta.env.MODE !== 'contained')(
  'exports private originals, cuts and both Studio engines with audio inside the isolated renderer',
  async () => {
    const evidence = '../../.superpowers/sdd/2026-11-18-video-wizard-03-generacion/r2-evidence';
    const workspace = (await readFile(join(evidence, 'workspace.txt'), 'utf8')).trim();
    const snapshot = JSON.parse(
      await readFile(join(workspace, 'noticias-liquid-glass', 'fixture.json'), 'utf8')
    );
    const secret = randomBytes(48).toString('hex'),
      ownerId = snapshot.ownerId;
    const container = 'studio-auth-test-' + randomUUID(),
      directory = await mkdtemp(join(tmpdir(), 'studio-auth-outputs-'));
    const docker = (args, env = process.env) =>
      execFileSync('docker', args, { encoding: 'utf8', env, timeout: 60000 }).trim();
    const port = '39147',
      base = 'http://127.0.0.1:' + port;
    const call = async (path, scope, refs = {}, body, method, extra = {}) =>
      fetch(base + path, {
        redirect: 'error',
        method: method ?? (body ? 'POST' : 'GET'),
        headers: {
          'content-type': 'application/json',
          authorization:
            'Bearer ' +
            (await signServiceToken(
              {
                audience: 'video-wizard-renderer',
                ownerId,
                scope,
                ...refs,
              },
              { secret }
            )),
          ...extra,
        },
        body: body && JSON.stringify(body),
      });
    async function awaitRender(path, scope, refs) {
      for (let i = 0; i < 300; i++) {
        const r = await call(path, scope, refs);
        expect(r.status).toBe(200);
        const status = await r.json();
        if (status.status === 'completed') return;
        expect(status.status).not.toBe('failed');
        await delay(1000);
      }
      throw Error('La exportación de prueba excedió el plazo.');
    }
    async function verifyVideo(path, scope, refs, label) {
      expect((await fetch(base + path)).status).toBe(404);
      expect((await call(path, scope, { ...refs, ownerId: randomUUID() })).status).toBe(404);
      expect((await call(path, scope, refs, undefined, 'HEAD')).status).toBe(200);
      expect((await call(path, scope, refs, undefined, 'GET', { range: 'bytes=0-3' })).status).toBe(
        206
      );
      const r = await call(path, scope, refs);
      expect(r.status).toBe(200);
      const file = join(directory, label + '.mp4');
      await writeFile(file, Buffer.from(await r.arrayBuffer()));
      const streams = JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type',
          '-of',
          'json',
          file,
        ])
      ).streams;
      expect(streams.map((s) => s.codec_type).sort()).toEqual(['audio', 'video']);
      // A silent track also passes a stream-count check. Verify the fixture tone after encoding.
      const samples = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-ss',
        '0.1',
        '-t',
        '0.2',
        '-i',
        file,
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
      for (let byte = 0; byte + 1 < samples.length; byte += 2)
        energy += samples.readInt16LE(byte) ** 2;
      expect(Math.sqrt(energy / (samples.length / 2))).toBeGreaterThan(50);
      if (label === 'crop') {
        // The generated logo is yellow, over a blue/green video. Sample its top-right interior.
        const rgb = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          file,
          '-frames:v',
          '1',
          '-vf',
          'crop=2:2:iw-28:28,scale=1:1',
          '-pix_fmt',
          'rgb24',
          '-f',
          'rawvideo',
          'pipe:1',
        ]);
        expect(rgb[0]).toBeGreaterThan(170);
        expect(rgb[1]).toBeGreaterThan(170);
        expect(rgb[2]).toBeLessThan(90);
      }
    }
    try {
      const studioData = join(directory, 'data');
      await cp(join(workspace, 'data'), studioData, { recursive: true });
      const logo = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=yellow:s=16x16',
        '-frames:v',
        '1',
        '-c:v',
        'png',
        '-f',
        'image2pipe',
        'pipe:1',
      ]);
      const hash = createHash('sha256').update(logo).digest('hex');
      await writeFile(join(studioData, 'assets', ownerId, hash), logo);
      const logoAsset = {
        assetId: randomUUID(),
        hash,
        mediaType: 'image/png',
        width: 16,
        height: 16,
      };
      docker(
        [
          'run',
          '--detach',
          '--rm',
          '--name',
          container,
          '--shm-size=1g',
          '--publish',
          '127.0.0.1:' + port + ':3001',
          '--mount',
          'type=bind,source=' + studioData + ',target=/app/.studio-data,readonly',
          '-e',
          'STUDIO_RENDER_SECRET',
          '-e',
          'STUDIO_PREVIEW_ORIGIN=' + base,
          '-e',
          'RENDER_CONCURRENCY=2',
          '-e',
          'RENDERS_DIR=/tmp/technical-renders',
          process.env.STUDIO_TEST_RENDER_IMAGE || 'video-wizard-auth-task4-test',
        ],
        { ...process.env, STUDIO_RENDER_SECRET: secret }
      );
      for (let i = 0; i < 150; i++) {
        if (
          await fetch(base + '/health').then(
            (r) => r.ok,
            () => false
          )
        )
          break;
        await delay(1000);
      }
      expect((await fetch(base + '/health')).status).toBe(200);
      for (const key of ['original', 'crop']) {
        const source = snapshot.dependencies.assets[key],
          jobId = randomUUID();
        const admitted = await call(
          '/renders',
          'render.create',
          { jobId },
          {
            webJobId: jobId,
            compositionId: 'VideoWithSubtitles',
            sourceAsset: {
              assetId: randomUUID(),
              hash: source.hash,
              mediaType: source.mediaType,
              width: source.width,
              height: source.height,
              durationMs: source.durationMs,
              hasAudio: true,
            },
            ...(key === 'crop' && { logoAsset }),
            inputProps: {
              subtitles: [],
              template: 'viral',
              language: 'es',
              aspectRatio: '1:1',
              durationInFrames: Math.ceil((source.durationMs * 30) / 1000),
              backgroundColor: '#000000',
            },
          }
        );
        expect(admitted.status).toBe(202);
        const { jobId: rendererJobId } = await admitted.json();
        const path = '/renders/' + rendererJobId,
          refs = { jobId, rendererJobId };
        await awaitRender(path, 'render.read', refs);
        await verifyVideo(path + '.mp4', 'render.artifact', refs, key);
      }
      for (const engine of ['hyperframes', 'remotion']) {
        const copy = structuredClone(snapshot),
          projectId = randomUUID(),
          previewId = randomUUID();
        Object.assign(copy.document, { id: projectId, engine });
        if (engine === 'remotion') {
          copy.document.styleRef = null;
          copy.document.brandSnapshot = null;
          copy.dependencies.libraries = {};
          copy.bundles = {};
          for (const scene of copy.document.scenes)
            scene.layers = scene.layers.filter((l) => l.type === 'video');
        }
        const admission = { compositionId: 'StudioProject', snapshot: copy };
        const unrelated = await call(
          '/studio/previews',
          'preview.create',
          { ownerId: randomUUID(), projectId, previewId },
          { ...admission, instance: previewId }
        );
        expect(unrelated.status).toBe(400);
        const preview = await call(
          '/studio/previews',
          'preview.create',
          { projectId, previewId },
          { ...admission, instance: previewId }
        );
        expect(preview.status).toBe(200);
        const { ticket } = await preview.json(),
          path = '/studio/previews/' + previewId;
        expect((await fetch(base + path + '/player.js')).status).toBe(404);
        const exchange = () =>
          fetch(base + path + '/session', {
            method: 'POST',
            headers: { origin: base, 'content-type': 'application/json' },
            body: JSON.stringify({ ticket }),
          });
        const session = await exchange();
        expect(session.status).toBe(204);
        expect((await exchange()).status).toBe(404);
        const cookie = session.headers.get('set-cookie').split(';')[0];
        expect((await fetch(base + path + '/player.js', { headers: { cookie } })).status).toBe(200);
        expect(
          (await call(path, 'preview.release', { projectId, previewId }, undefined, 'DELETE'))
            .status
        ).toBe(204);
        const response = await call('/renders', 'studio.create', { projectId }, admission);
        expect(response.status).toBe(202);
        const { jobId } = await response.json(),
          resource = '/studio/renders/' + jobId;
        await awaitRender(resource, 'studio.read', { projectId, jobId });
        await verifyVideo(resource + '/video', 'studio.artifact', { projectId, jobId }, engine);
      }
    } finally {
      if (
        docker(['ps', '--filter', 'name=^/' + container + '$', '--format', '{{.Names}}']) ===
        container
      )
        docker(['stop', '-t', '2', container]);
      await rm(directory, { recursive: true, force: true });
    }
  },
  900000
);
