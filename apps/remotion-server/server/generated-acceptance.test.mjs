import { expect, it } from 'vitest';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { HyperframesProjectAdapter } from '@workspace/hyperframes-worker';
import { RemotionProjectAdapter } from './project-adapter';
import { checkMounted } from './component-mount.mjs';

it.skipIf(import.meta.env.MODE !== 'r3-fixture').each(['remotion', 'hyperframes'])(
  'seeks and exports the immutable %s version from the second project',
  async (engine) => {
    const root = process.env.STUDIO_R3_EVIDENCE;
    if (!root)
      throw Error('Indica el directorio aislado con los snapshots de proposal-service.test.');
    const snap = JSON.parse(await readFile(join(root, engine + '.json'), 'utf8')),
      data = join(root, 'data');
    const layer = snap.document.scenes[0].layers[0];
    expect(layer.props.title).toBe('Título editado');
    const sealed = JSON.parse(
      Buffer.from(Object.values(snap.bundles)[0].base64, 'base64').toString()
    );
    if (engine === 'hyperframes') {
      const tone = execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=1200:sample_rate=48000:duration=0.2',
        '-f',
        'wav',
        'pipe:1',
      ]);
      const hash = createHash('sha256').update(tone).digest('hex'),
        store = join(data, 'assets', snap.ownerId);
      await mkdir(store, { recursive: true });
      await writeFile(join(store, hash), tone);
      snap.dependencies.assets.tone = {
        id: 'tone',
        hash,
        url: 'media/' + hash,
        name: 'Tono',
        mediaType: 'audio/wav',
        durationMs: 200,
        hasAudio: true,
      };
      snap.document.assetIds.push('tone');
      snap.document.scenes[0].layers.push({
        id: 'pulse',
        assetId: 'tone',
        type: 'audio',
        startMs: 1001,
        endMs: 1017,
        sourceInMs: 20,
        volume: 1,
        zIndex: 0,
        visible: true,
        endAnchor: 'fixed',
      });
    }
    const signal = AbortSignal.timeout(240000);
    for (const fps of [25, 30]) {
      snap.document.canvas.fps = fps;
      const dir = join(root, engine + '-' + fps);
      await mkdir(dir, { recursive: true });
      const check = await checkMounted(snap, dir, data, signal);
      expect(check.moduleHashes).toEqual([sealed.moduleHash]);
      const active = check.samples.filter(
        (s) =>
          s.frame >= Math.floor((layer.startMs * fps) / 1000) &&
          s.frame < Math.ceil((layer.endMs * fps) / 1000)
      );
      expect(new Set(active.map((s) => s.sha256)).size).toBeGreaterThan(1);
      await writeFile(join(dir, 'check.json'), JSON.stringify(check, null, 2));
      // Each engine exports one reviewed MP4. The other rate independently covers browser seek.
      if (fps !== (engine === 'remotion' ? 25 : 30)) continue;
      const adapter =
        engine === 'remotion'
          ? new RemotionProjectAdapter(data)
          : new HyperframesProjectAdapter(data);
      const renderDir = join(dir, 'export');
      await mkdir(renderDir, { recursive: true });
      const prepared = await adapter.prepare(snap, renderDir, signal);
      const result = await adapter.render(prepared, { signal, onProgress() {} });
      const manifest = JSON.parse(
        await readFile(
          join(renderDir, engine === 'remotion' ? 'render-manifest.json' : 'native-manifest.json'),
          'utf8'
        )
      );
      expect(manifest.moduleHashes).toEqual(check.moduleHashes);
      expect(result.width).toBe(320);
      expect(result.height).toBe(180);
      expect(Math.abs(result.durationMs - 1200)).toBeLessThan(1000 / fps);
      const probe = JSON.parse(
        execFileSync('ffprobe', [
          '-v',
          'error',
          '-select_streams',
          'v:0',
          '-show_entries',
          'stream=nb_frames,r_frame_rate,duration',
          '-of',
          'json',
          join(renderDir, 'video.mp4'),
        ])
      );
      expect(Number(probe.streams[0].nb_frames)).toBe(Math.ceil((1200 * fps) / 1000));
      expect(Number(probe.streams[0].duration)).toBe(1.2);
      execFileSync('ffmpeg', [
        '-y',
        '-v',
        'error',
        '-ss',
        '0.44',
        '-i',
        join(renderDir, 'video.mp4'),
        '-frames:v',
        '1',
        join(renderDir, 'middle.png'),
      ]);
      if (engine === 'hyperframes') {
        expect(manifest.soundtrack.tracks).toContainEqual(
          expect.objectContaining({ id: 'pulse', startMs: 1001, durationMs: 16 })
        );
        expect(result.hasAudio).toBe(true);
        const pcm = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          join(renderDir, 'video.mp4'),
          '-map',
          '0:a',
          '-ac',
          '1',
          '-ar',
          '48000',
          '-f',
          'f32le',
          'pipe:1',
        ]);
        const energy = (ms) => {
          let sum = 0;
          for (let i = 0; i < 240; i++) sum += pcm.readFloatLE(4 * (ms * 48 + i)) ** 2;
          return Math.sqrt(sum / 240);
        };
        expect(energy(1005)).toBeGreaterThan(0.025);
        expect(energy(850)).toBeLessThan(0.005);
      }
      await writeFile(join(renderDir, 'result.json'), JSON.stringify(result, null, 2));
    }
  },
  300000
);
