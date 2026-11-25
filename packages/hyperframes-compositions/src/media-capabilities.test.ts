import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { it, expect } from 'vitest';
import { type ExportSnapshot, type ResolvedAsset } from '@workspace/render-contract';
import { mediaDiagnostics } from './media-capabilities';

it('diagnoses animated GIF and ProRes alpha while preserving a static GIF and opaque video', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-formats-'));
  try {
    const make = (id: string, filter: string, flags: string[]) =>
      execFileSync('ffmpeg', ['-v', 'error', '-f', 'lavfi', '-i', filter, ...flags, join(dir, id)]);
    make('two.gif', 'color=blue:s=64x64:r=2:d=1,drawbox=color=red:t=fill:enable=gte(t\\,0.5)', []);
    const gifFrames = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      join(dir, 'two.gif'),
      '-fps_mode',
      'passthrough',
      '-frames:v',
      '2',
      '-pix_fmt',
      'rgb24',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
    expect(gifFrames.length).toBe(2 * 64 * 64 * 3);
    expect(gifFrames.subarray(0, 64 * 64 * 3).equals(gifFrames.subarray(64 * 64 * 3))).toBe(false);
    make('still.gif', 'color=red:s=64x64', ['-frames:v', '1']);
    make(
      'alpha.mov',
      'color=red@0.0:s=64x64:d=1,format=yuva444p10le,drawbox=color=blue@1:t=fill:w=32:replace=1',
      ['-c:v', 'prores_ks', '-profile:v', '4', '-pix_fmt', 'yuva444p10le']
    );
    make('opaque.mp4', 'color=red:s=64x64:d=1', ['-c:v', 'libx264', '-pix_fmt', 'yuv420p']);
    const rgba = execFileSync('ffmpeg', [
      '-v',
      'error',
      '-i',
      join(dir, 'alpha.mov'),
      '-frames:v',
      '1',
      '-pix_fmt',
      'rgba',
      '-f',
      'rawvideo',
      'pipe:1',
    ]);
    expect(rgba[3]).toBeGreaterThan(245);
    expect(rgba[4 * 60 + 3]).toBeLessThan(10);
    const dependencies: ExportSnapshot['dependencies'] = { assets: {}, libraries: {} };
    const layers = [];
    for (const [id, type] of [
      ['two.gif', 'image/gif'],
      ['still.gif', 'image/gif'],
      ['alpha.mov', 'video/quicktime'],
      ['opaque.mp4', 'video/mp4'],
    ] as const) {
      const bytes = await readFile(join(dir, id));
      dependencies.assets[id] = {
        id,
        name: id,
        hash: createHash('sha256').update(bytes).digest('hex'),
        mediaType: type,
        url: id,
      };
      layers.push({
        id,
        assetId: id,
        type: type.startsWith('image') ? 'image' : 'video',
        sourceInMs: 0,
        visible: true,
      });
    }
    const snapshot = {
      dependencies,
      document: { scenes: [{ id: 'scene', layers }] },
    } as ExportSnapshot;
    const previous = structuredClone(snapshot);
    const diagnostics = await mediaDiagnostics(
      snapshot,
      async (a) => join(dir, a.id),
      new AbortController().signal
    );
    expect(diagnostics.map((d) => [d.code, d.layerId])).toEqual([
      ['animated-image', 'two.gif'],
      ['video-alpha', 'alpha.mov'],
    ]);
    expect(snapshot).toEqual(previous);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

it('verifies aliased, static, variable and undecodable font bytes independent of the declared weight', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'native-fonts-'));
  try {
    const fonts = [
      ['ArchivoBlack-400.woff2', 400, 400],
      ['ArchivoBlack-400.woff2', 400, 900],
      ['Geist-variable.woff2', 100, 900],
      ['broken.woff2', 400, 400],
    ] as const;
    const deps: ExportSnapshot['dependencies'] = { assets: {}, libraries: {} };
    const files = new Map<string, string>();
    const broken = join(dir, 'broken.woff2');
    await writeFile(broken, Buffer.concat([Buffer.from('wOF2'), Buffer.alloc(44)]));
    for (const [index, [filename, min, max]] of fonts.entries()) {
      const file =
        filename === 'broken.woff2'
          ? broken
          : new URL('../../style-packs/packs/fonts/' + filename, import.meta.url).pathname;
      files.set(filename, file);
      const bytes = await readFile(file);
      deps.assets[filename] = {
        id: filename,
        name: filename,
        hash: createHash('sha256').update(bytes).digest('hex'),
        url: filename,
        mediaType: 'font/woff2',
      };
      deps.libraries['entry' + index] = {
        id: 'style' + index,
        kind: 'style',
        version: 1,
        name: 'name',
        assetIds: [filename],
        tokens: {},
        engines: ['hyperframes'],
        fonts: [{ family: 'Mi alias ' + index, assetId: filename, weight: { min, max } }],
      };
    }
    const result = await mediaDiagnostics(
      { dependencies: deps, document: { scenes: [] } } as unknown as ExportSnapshot,
      async (a: ResolvedAsset) => files.get(a.id)!,
      new AbortController().signal
    );
    expect(result.map((d) => d.message)).toEqual([
      expect.stringMatching(/Mi alias 1.*400–400/),
      expect.stringMatching(/Mi alias 3.*decodificar/),
    ]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
