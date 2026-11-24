import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { copyFile, mkdir, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';
import type { ExportSnapshot } from '@workspace/render-contract';
import { HyperframesProjectAdapter } from './adapter';

const native = (import.meta as ImportMeta & { env: { MODE: string } }).env.MODE === 'native';
it.skipIf(!native)(
  'renders the audio and embedded-video tones whose whole interval follows the last visual frame',
  async () => {
    const evidence = resolve(
      process.env.STUDIO_NATIVE_EVIDENCE_DIR ||
        '../../.superpowers/sdd/2026-11-18-video-wizard-03-generacion/r2-evidence'
    );
    const workspace = await mkdtemp(join(tmpdir(), 'native-interframe-'));
    const dataDir = join(workspace, 'data'),
      ownerId = randomUUID(),
      store = join(dataDir, 'assets', ownerId);
    await mkdir(store, { recursive: true });
    await mkdir(evidence, { recursive: true });
    const dependencies: ExportSnapshot['dependencies'] = { assets: {}, libraries: {} };
    for (const [id, hz] of [
      ['reference', 1000],
      ['audio', 2000],
      ['embedded', 3000],
    ] as const) {
      const video = id === 'embedded';
      const input =
        id === 'reference'
          ? '0.18*sin(2*PI*1000*t)*between(t\\,0.340\\,0.356)+0.18*sin(2*PI*4000*t)*between(t\\,1.940\\,1.956):d=2.2'
          : '0.18*sin(2*PI*' +
            hz +
            '*t)*between(t\\,0.02\\,0.036)+0.18*sin(2*PI*5000*t)*between(t\\,0.100\\,0.116):d=0.25';
      const output = join(workspace, id + (video ? '.mp4' : '.wav'));
      execFileSync('ffmpeg', [
        '-v',
        'error',
        ...(video ? ['-f', 'lavfi', '-i', 'color=red:s=64x64:r=30:d=0.25'] : []),
        '-f',
        'lavfi',
        '-i',
        'aevalsrc=' + input + ':s=48000',
        ...(video
          ? ['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-b:a', '192k']
          : ['-c:a', 'pcm_s24le']),
        output,
      ]);
      const hash = createHash('sha256')
        .update(await readFile(output))
        .digest('hex');
      await copyFile(output, join(store, hash));
      dependencies.assets[id] = {
        id,
        name: id,
        hash,
        url: 'media/' + hash,
        mediaType: video ? 'video/mp4' : 'audio/wav',
        durationMs: id === 'reference' ? 2200 : 250,
        hasAudio: true,
        ...(video ? { width: 64, height: 64 } : {}),
      };
    }
    const common = {
      startMs: 1001,
      endMs: 1017,
      sourceInMs: 20,
      volume: 1,
      visible: true,
      endAnchor: 'fixed' as const,
      zIndex: 0,
    };
    const snapshot: ExportSnapshot = {
      ownerId,
      revision: 'pulse',
      dependencies,
      bundles: {},
      diagnostics: [],
      document: {
        id: 'interframe',
        schemaVersion: 1,
        title: 'Pulso al corte',
        engine: 'hyperframes',
        canvas: { width: 320, height: 240, fps: 30 },
        durationMs: 2200,
        styleRef: null,
        brandSnapshot: null,
        assetIds: ['reference', 'audio', 'embedded'],
        globalAudio: [
          {
            ...common,
            id: 'clock',
            type: 'audio',
            assetId: 'reference',
            startMs: 200,
            endMs: 2200,
            sourceInMs: 40,
          },
        ],
        scenes: [
          {
            id: 'outgoing',
            durationMs: 1017,
            layers: [
              { ...common, type: 'audio', id: 'pulse', assetId: 'audio', volume: 1.5 },
              {
                ...common,
                type: 'video',
                id: 'soundtrack',
                assetId: 'embedded',
                fit: 'cover',
                focalPoint: { x: 0.5, y: 0.5 },
                box: { x: 0, y: 0, width: 64, height: 64 },
              },
            ],
          },
          {
            id: 'incoming',
            durationMs: 983,
            layers: [
              {
                ...common,
                type: 'video',
                id: 'visible',
                assetId: 'embedded',
                startMs: 300,
                endMs: 400,
                sourceInMs: 100,
                volume: 1.5,
                fit: 'cover',
                focalPoint: { x: 0.5, y: 0.5 },
                box: { x: 0, y: 0, width: 64, height: 64 },
              },
            ],
          },
        ],
      },
    };
    const adapter = new HyperframesProjectAdapter(dataDir),
      signal = new AbortController().signal;
    expect(await adapter.validate(snapshot)).toEqual([]);
    const project = await adapter.prepare(snapshot, workspace);
    const manifest = JSON.parse(await readFile(join(workspace, 'native-manifest.json'), 'utf8'));
    expect(manifest.soundtrack.durationMs).toBe(2200);
    expect(manifest.soundtrack.tracks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'pulse', volume: 1.5, sourceInMs: 20 }),
        expect.objectContaining({ id: 'visible', volume: 1, sourceInMs: 0 }),
        expect.objectContaining({ id: 'clock', volume: 1, sourceInMs: 40, startMs: 200 }),
      ])
    );
    const again = await adapter.prepare(snapshot, join(workspace, 'repeat'));
    expect(again.manifestHash).toBe(project.manifestHash);
    await writeFile(join(workspace, 'fixture.json'), JSON.stringify(snapshot));
    const result = await adapter.render(project, { signal, onProgress() {} });
    expect(result.hasAudio).toBe(true);
    const pcm = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      join(workspace, 'video.mp4'),
      '-map',
      '0:a',
      '-af',
      'pan=mono|c0=c0',
      '-ar',
      '48000',
      '-f',
      'f32le',
      'pipe:1',
    ]);
    function level(ms: number, hz: number) {
      let real = 0,
        imag = 0;
      for (let i = 0; i < 192; i++) {
        const sample = pcm.readFloatLE(4 * (ms * 48 + i)),
          phase = (2 * Math.PI * hz * i) / 48000;
        real += sample * Math.cos(phase);
        imag += sample * Math.sin(phase);
      }
      return (2 * Math.hypot(real, imag)) / 192;
    }
    const readings = [];
    for (const [ms, hz, amplitude] of [
      [500, 1000, 0.18],
      [1001, 2000, 0.27],
      [1001, 3000, 0.18],
      [1317, 5000, 0.27],
      [2100, 4000, 0.18],
    ] as const) {
      const before = level(ms - 6, hz),
        inside = level(ms + 6, hz),
        after = level(ms + 18, hz);
      readings.push({ ms, hz, before, inside, after });
      expect(Math.abs(inside - amplitude)).toBeLessThan(0.035);
      expect(Math.max(before, after)).toBeLessThan(0.015);
    }
    await writeFile(join(evidence, 'interframe-mp4.json'), JSON.stringify(readings, null, 2));
    await copyFile(join(workspace, 'video.mp4'), join(evidence, 'interframe.mp4'));
    await writeFile(join(evidence, 'interframe-workspace.txt'), workspace);
  },
  60000
);
