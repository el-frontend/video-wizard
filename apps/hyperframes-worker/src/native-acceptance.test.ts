import { it, expect } from 'vitest';
import { mkdtemp, mkdir, readFile, writeFile, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  libraryKey,
  nativeCaptionSource,
  type ExportSnapshot,
  type ResolvedAsset,
} from '@workspace/render-contract';
import { type EntryOf, type Layer } from '@workspace/video-project';
import {
  loadStylePack,
  stylePackFonts,
  stylePackIds,
} from '../../../packages/style-packs/src/index';
import { HyperframesProjectAdapter } from './adapter';

const run = (import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'native';
const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
it.skipIf(!run)(
  'checks and renders real native style fixtures with measured crop and audio',
  async () => {
    const evidence = resolve(
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
      'color=blue:s=160x160:r=25:d=0.5',
      '-f',
      'lavfi',
      '-i',
      'color=green:s=160x160:r=25:d=1.5',
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
        const repeated = await adapter.prepare(snapshot, join(workspace, 'repeat'));
        expect(repeated.manifestHash).toBe(prepared.manifestHash);
        await writeFile(
          join(evidence, 'determinism.json'),
          JSON.stringify({ first: prepared.manifestHash, repeat: repeated.manifestHash }, null, 2)
        );
      }
      await writeFile(join(dir, 'fixture.json'), JSON.stringify(snapshot));
      console.log('native strict check', id, dir);
      const checked = await adapter.check(prepared, signal);
      await writeFile(join(evidence, id + '-check.json'), checked);
      const [frame] = await adapter.snapshots(prepared, [1000], signal);
      await copyFile(join(dir, frame!.relativePath), join(evidence, id + '.png'));
      if (id !== stylePackIds[0]) continue;
      const result = await adapter.render(prepared, { signal, onProgress() {} });
      expect(result).toMatchObject({ width: 480, height: 380, hasAudio: true });
      expect(Math.abs(result.durationMs - 2000)).toBeLessThanOrEqual(40);
      const mp4 = join(dir, 'video.mp4');
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
