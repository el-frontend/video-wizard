import { it, expect, vi } from 'vitest';
import { access, mkdtemp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  libraryKey,
  nativeCaptionSource,
  type ExportSnapshot,
  type PreparedComposition,
  type ResolvedAsset,
} from '@workspace/render-contract';
import { type EntryOf, type Layer } from '@workspace/video-project';
import {
  loadStylePack,
  stylePackFonts,
  stylePackIds,
} from '../../../packages/style-packs/src/index';
import { HyperframesProjectAdapter } from './adapter';
import {
  descendants,
  processTable,
} from '../../../packages/hyperframes-compositions/src/process-tree';

async function cancelRealRender(
  adapter: HyperframesProjectAdapter,
  project: PreparedComposition,
  target: RegExp
) {
  const controller = new AbortController();
  let rendering = false;
  const pending = adapter.render(project, {
    signal: controller.signal,
    onProgress(progress) {
      if (progress === 0.1) rendering = true;
    },
  });
  const settled = Promise.allSettled([pending]);
  let tracked: ReturnType<typeof descendants> = [];
  try {
    await vi.waitFor(
      () => {
        expect(rendering).toBe(true);
        tracked = descendants(process.pid).filter((p) =>
          /chrome|headless_shell|ffmpeg/i.test(p.name)
        );
        expect(tracked.some((p) => target.test(p.name))).toBe(true);
      },
      { timeout: 30000, interval: 10 }
    );
  } finally {
    controller.abort();
    expect((await settled)[0]?.status).toBe('rejected');
  }
  await vi.waitFor(
    () =>
      expect(
        processTable().filter((p) => tracked.some((t) => t.pid === p.pid && t.name === p.name))
      ).toEqual([]),
    { timeout: 3000 }
  );
  await expect(access(join(project.workspace, 'video.mp4'))).rejects.toThrow();
  return {
    processes: tracked.length,
    groups: new Set(tracked.map((p) => p.group)).size,
    targetGroupLeader: tracked.some((p) => target.test(p.name) && p.pid === p.group),
  };
}

const run = (import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'native';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
it.skipIf(!run)(
  'checks and renders real native style fixtures with measured crop and audio',
  async () => {
    const evidence = resolve(
      process.env.STUDIO_NATIVE_EVIDENCE_DIR ||
        '../../.superpowers/sdd/2026-11-18-video-wizard-03-generacion/r2-evidence'
    );
    await mkdir(evidence, { recursive: true });
    const workspace = await mkdtemp(join(tmpdir(), 'studio-native-'));
    await writeFile(join(evidence, 'workspace.txt'), workspace);
    const ownerId = randomUUID(),
      dataDir = join(workspace, 'data'),
      store = join(dataDir, 'assets', ownerId);
    await mkdir(store, { recursive: true });
    const deps: ExportSnapshot['dependencies'] = { assets: {}, libraries: {} };
    async function asset(
      id: string,
      mediaType: string,
      path: string | URL,
      rest: Partial<ResolvedAsset> = {}
    ) {
      const bytes = await readFile(path),
        digest = hash(bytes);
      await writeFile(join(store, digest), bytes);
      deps.assets[id] = { id, name: id, hash: digest, mediaType, url: 'media/' + digest, ...rest };
    }
    function ff(args: string[]) {
      execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
    }
    const original = join(workspace, 'original.mp4'),
      crop = join(workspace, 'crop.mp4'),
      audio = join(workspace, 'audio.wav');
    ff([
      '-f',
      'lavfi',
      '-i',
      'color=red:s=320x180:r=25:d=3',
      '-f',
      'lavfi',
      '-i',
      'sine=f=200:d=3',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      original,
    ]);
    ff([
      '-f',
      'lavfi',
      '-i',
      'color=blue:s=160x160:r=60:d=0.5,drawbox=color=yellow:t=fill:enable=gte(t\\,0.02)',
      '-f',
      'lavfi',
      '-i',
      'color=green:s=160x160:r=60:d=1.5',
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=0.08*sin(2*PI*(if(lt(t\\,0.5)\\,240\\,480))*t):d=2:s=48000',
      '-filter_complex',
      '[0:v][1:v]concat=n=2:v=1:a=0[v]',
      '-map',
      '[v]',
      '-map',
      '2:a',
      '-c:v',
      'libx264',
      '-c:a',
      'aac',
      crop,
    ]);
    ff([
      '-f',
      'lavfi',
      '-i',
      'aevalsrc=0.08*sin(2*PI*(if(lt(t\\,0.5)\\,200\\,880))*t):d=2:s=48000',
      '-c:a',
      'pcm_s24le',
      audio,
    ]);
    await asset('original', 'video/mp4', original, {
      width: 320,
      height: 180,
      durationMs: 3000,
      hasAudio: true,
    });
    await asset('crop', 'video/mp4', crop, {
      width: 160,
      height: 160,
      durationMs: 2000,
      hasAudio: true,
    });
    await asset('music', 'audio/wav', audio, { durationMs: 2000, hasAudio: true });
    const fonts: NonNullable<EntryOf<'style'>['fonts']> = [];
    for (const f of stylePackFonts) {
      await asset(f.filename, 'font/woff2', f.source);
      fonts.push({ assetId: f.filename, weight: f.weight, family: f.family });
    }
    const component: EntryOf<'component'> = {
      id: 'hf-caption',
      version: 1,
      name: 'Subtítulo',
      engine: 'hyperframes',
      kind: 'component',
      assetIds: [],
      manifest: {
        version: 1,
        props: {},
        builtin: { kind: 'hyperframes-caption', preset: 'default' },
      },
    };
    const base = { startMs: 0, endMs: 1600, endAnchor: 'fixed' as const, visible: true, zIndex: 1 };
    const box = { x: 28, y: 25, width: 420, height: 60 };
    const layers: Layer[] = [
      { ...base, box, type: 'text', text: 'Edición local', id: 'title' },
      {
        ...base,
        box: { x: 35, y: 110, width: 240, height: 140 },
        type: 'video',
        fit: 'cover',
        focalPoint: { x: 0.3, y: 0.7 },
        assetId: 'original',
        sourceInMs: 1250,
        volume: 0.5,
        id: 'picture',
        endMs: 1200,
        playbackVariant: {
          kind: 'processed-crop',
          assetId: 'crop',
          sourceStartMs: 1000,
          sourceEndMs: 3000,
          jobId: '9495ef58-c7ae-4eca-9c2d-d17be8192539',
        },
      },
      {
        ...base,
        box: { x: 20, y: 265, width: 440, height: 85 },
        type: 'captions',
        startMs: 400,
        id: 'caption',
        templateRef: { id: component.id, version: 1 },
        overrides: { typography: { display: { fontFamily: 'Geist' } } },
        cues: [
          { id: 'first', startMs: 0, endMs: 600, text: 'Primero' },
          { id: 'second', startMs: 600, endMs: 1200, text: 'Segundo' },
        ],
      },
    ];
    const adapter = new HyperframesProjectAdapter(dataDir),
      signal = new AbortController().signal;
    for (const id of stylePackIds) {
      const style: EntryOf<'style'> = {
        ...(await loadStylePack(id)),
        version: 3,
        engines: ['hyperframes', 'remotion'],
        family: { id, version: 1 },
        assetIds: fonts.map((f) => f.assetId),
        fonts,
      };
      const snapshot: ExportSnapshot = {
        revision: 'native-v1',
        ownerId,
        diagnostics: [],
        bundles: {
          [libraryKey(component)]: {
            sha256: hash(nativeCaptionSource),
            base64: Buffer.from(nativeCaptionSource).toString('base64'),
          },
        },
        dependencies: {
          assets: deps.assets,
          libraries: { [libraryKey(style)]: style, [libraryKey(component)]: component },
        },
        document: {
          id: 'approved-project',
          schemaVersion: 1,
          title: 'Prueba nativa',
          engine: 'hyperframes',
          canvas: { width: 480, height: 380, fps: 25 },
          durationMs: 2000,
          brandSnapshot: null,
          styleRef: { id, version: 3 },
          scenes: [{ id: 'opening', durationMs: 1600, layers }],
          globalAudio: [
            {
              ...base,
              id: 'music-layer',
              type: 'audio',
              startMs: 1250,
              endMs: 2000,
              assetId: 'music',
              sourceInMs: 500,
              volume: 1.5,
            },
          ],
          assetIds: ['original', 'crop', 'music'],
        },
      };
      expect((await adapter.validate(snapshot)).filter((d) => d.severity === 'error')).toEqual([]);
      const dir = join(workspace, id);
      const prepared = await adapter.prepare(snapshot, dir);
      if (id === stylePackIds[0]) {
        if (process.platform !== 'win32') {
          const chrome = await cancelRealRender(adapter, prepared, /chrome|headless_shell/i);
          const ffmpeg = await cancelRealRender(adapter, prepared, /ffmpeg/i);
          await writeFile(
            join(evidence, 'real-cancel.json'),
            JSON.stringify({ chrome, ffmpeg }, null, 2)
          );
        }
        const repeated = await adapter.prepare(snapshot, join(workspace, 'repeat'));
        expect(repeated.manifestHash).toBe(prepared.manifestHash);
        // Corrupt only a private staged copy after validation to exercise the browser decoder.
        const corrupt = deps.assets['ArchivoBlack-400.woff2']!;
        await writeFile(
          join(repeated.workspace, 'native', 'media', corrupt.hash + '.woff2'),
          'invalid font'
        );
        await expect(adapter.check(repeated, signal)).rejects.toThrow(
          /decodificar la fuente vinculada/
        );

        await writeFile(
          join(evidence, 'determinism.json'),
          JSON.stringify({ first: prepared.manifestHash, repeat: repeated.manifestHash }, null, 2)
        );
      }
      await writeFile(join(dir, 'fixture.json'), JSON.stringify(snapshot));
      if (id === stylePackIds[0]) {
        const cut = structuredClone(snapshot);
        const first = cut.document.scenes[0]!;
        first.durationMs = 1017;
        first.layers = first.layers.filter((l) => l.type === 'video');
        first.layers[0]!.endMs = 1017;
        const firstPicture = first.layers[0]!;
        if (firstPicture.type !== 'video') throw new Error();
        const next = { ...firstPicture, id: 'cut-video', endMs: 583, sourceInMs: 1000 };
        cut.document.scenes.push({ id: 'after-cut', durationMs: 583, layers: [next] });
        cut.document.canvas.fps = 30;
        const cutDir = join(workspace, 'fractional');
        const project = await adapter.prepare(cut, cutDir);
        await writeFile(join(cutDir, 'fixture.json'), JSON.stringify(cut));
        // 967ms floors to 29, 1000ms to 30, 1034ms to 31.
        const captures = await adapter.snapshots(project, [967, 1000, 1034], signal);
        await adapter.render(project, { signal, onProgress() {} });
        for (const [i, capture] of captures.entries()) {
          const index = 29 + i;
          const pixel = (file: string, select: string[]) => [
            ...execFileSync('ffmpeg', [
              '-v',
              'error',
              '-i',
              file,
              '-vf',
              [...select, 'crop=10:10:70:130', 'scale=1:1'].join(','),
              '-frames:v',
              '1',
              '-pix_fmt',
              'rgb24',
              '-f',
              'rawvideo',
              'pipe:1',
            ]),
          ];
          const shot = pixel(join(cutDir, capture.relativePath), []);
          const rendered = pixel(join(cutDir, 'video.mp4'), ['select=eq(n\\,' + index + ')']);
          for (const p of [shot, rendered]) {
            if (i === 0) expect(p[1]!).toBeGreaterThan(p[2]! + 55);
            else if (i === 1) expect(p[2]!).toBeGreaterThan(p[0]! + 100);
            else expect(p[0]!).toBeGreaterThan(p[2]! + 100);
          }
          await copyFile(
            join(cutDir, capture.relativePath),
            join(evidence, 'cut-' + index + '.png')
          );
        }
      }
      console.log('native strict check', id, dir);
      const checked = await adapter.check(prepared, signal);
      await writeFile(join(evidence, id + '-check.json'), checked);
      const [frame] = await adapter.snapshots(prepared, [1000], signal);
      await copyFile(join(dir, frame!.relativePath), join(evidence, id + '.png'));

      const result = await adapter.render(prepared, { signal, onProgress() {} });
      expect(result).toMatchObject({ width: 480, height: 380, hasAudio: true });
      expect(Math.abs(result.durationMs - 2000)).toBeLessThanOrEqual(40);
      const mp4 = join(dir, 'video.mp4');
      const extracted = join(evidence, id + '-mp4.png');
      ff(['-ss', '1', '-i', mp4, '-frames:v', '1', extracted]);
      const pixels = (input: string) =>
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-i',
          input,
          '-vf',
          'scale=96:76',
          '-f',
          'rawvideo',
          '-pix_fmt',
          'rgb24',
          'pipe:1',
        ]);
      const captured = pixels(join(dir, frame!.relativePath)),
        rendered = pixels(extracted);
      expect(rendered.length).toBe(captured.length);
      expect(
        rendered.reduce((sum, v, i) => sum + Math.abs(v - captured[i]!), 0) / rendered.length
      ).toBeLessThan(7);
      await copyFile(mp4, join(evidence, id + '.mp4'));
      if (id !== stylePackIds[0]) continue;
      await copyFile(mp4, join(evidence, 'native.mp4'));
      const probe = execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_name,codec_type,avg_frame_rate,width,height,duration,nb_frames:format=duration',
        '-of',
        'json',
        mp4,
      ]);
      await writeFile(join(evidence, 'ffprobe.json'), probe);
      const measurements = [];
      for (const [at, freq, amplitude] of [
        [0.65, 480, 0.04],
        [1.55, 880, 0.12],
      ] as const) {
        const pcm = execFileSync('ffmpeg', [
          '-v',
          'error',
          '-ss',
          String(at),
          '-i',
          mp4,
          '-t',
          '0.2',
          '-vn',
          '-af',
          'pan=mono|c0=c0',
          '-ar',
          '48000',
          '-f',
          'f32le',
          'pipe:1',
        ]);
        let re = 0,
          im = 0;
        const n = pcm.length / 4;
        for (let i = 0; i < n; i++) {
          const v = pcm.readFloatLE(i * 4),
            phase = (2 * Math.PI * freq * i) / 48000;
          re += v * Math.cos(phase);
          im += v * Math.sin(phase);
        }
        const actual = (2 * Math.hypot(re, im)) / n;
        measurements.push({ at, freq, amplitude, actual });
        await writeFile(join(evidence, 'audio.json'), JSON.stringify(measurements, null, 2));
        expect(actual).toBeGreaterThan(amplitude * 0.85);
        expect(actual).toBeLessThan(amplitude * 1.15);
      }
    }
  },
  360000
);
