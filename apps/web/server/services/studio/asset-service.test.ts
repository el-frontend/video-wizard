import { execFileSync } from 'node:child_process';
import { mkdtemp, open, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { resolveStudioDataDir, streamAssetFile } from './asset-paths';
import { mediaProbe } from './media-probe';

let directory: string;

beforeAll(async () => {
  directory = await mkdtemp(join(tmpdir(), 'studio-assets-probe-'));
});

afterAll(async () => {
  if (directory) await rm(directory, { recursive: true, force: true });
});

describe('Studio asset storage', () => {
  it('resolves the default data directory from either the workspace or the Next app', () => {
    const workspace = join(import.meta.dirname, '../../../../..');
    expect(resolveStudioDataDir('', workspace)).toBe(join(workspace, '.studio-data'));
    expect(resolveStudioDataDir('', join(workspace, 'apps/web'))).toBe(
      join(workspace, '.studio-data')
    );
  });

  it('closes the file when preview cancels a pending range read', async () => {
    const path = join(directory, 'preview');
    await writeFile(path, Buffer.alloc(128 * 1024));
    const file = await open(path, 'r');
    try {
      const reader = streamAssetFile(file, 1024, 128 * 1024 - 1).getReader();
      const pending = reader.read();
      await Promise.resolve();
      await reader.cancel();

      await expect(pending).resolves.toMatchObject({ done: true });
      await expect(file.stat()).rejects.toMatchObject({ code: 'EBADF' });
    } finally {
      await file.close();
    }
  });
});

describe('mediaProbe', () => {
  it('measures the last audio packet of a live WebM with a padded header', async () => {
    const path = join(directory, 'grabación en vivo.webm');
    execFileSync(
      'ffmpeg',
      [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=size=160x90:rate=30:duration=2',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=sample_rate=48000:duration=2.5',
        '-c:v',
        'libvpx-vp9',
        '-c:a',
        'libvorbis',
        '-live',
        '1',
        path,
      ],
      { timeout: 30000 }
    );
    const bytes = await readFile(path);
    // Insert a 4 KiB Void element before DocType and enlarge the EBML header.
    const originalSize = bytes[4]!;
    expect(originalSize & 0x80).toBe(0x80);
    const padding = Buffer.alloc(4099);
    padding[0] = 0xec;
    padding.writeUInt16BE(0x4000 | 4096, 1);
    const size = Buffer.alloc(2);
    size.writeUInt16BE(0x4000 | ((originalSize & 0x7f) + padding.length));
    await writeFile(path, Buffer.concat([bytes.subarray(0, 4), size, padding, bytes.subarray(5)]));

    const duration = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(duration.trim()).toBe('N/A');

    const metadata = await mediaProbe(path, 'video/webm');
    expect(metadata).toMatchObject({ width: 160, height: 90, hasAudio: true });
    expect(metadata.durationMs).toBeGreaterThanOrEqual(2475);
    expect(metadata.durationMs).toBeLessThanOrEqual(2535);

    const doctype = Buffer.from([0x42, 0x82, 0x84, ...Buffer.from('webm')]);
    const malformed = join(directory, 'duplicate-doctype.webm');
    size.writeUInt16BE(0x4000 | ((originalSize & 0x7f) + doctype.length));
    await writeFile(
      malformed,
      Buffer.concat([bytes.subarray(0, 4), size, doctype, bytes.subarray(5)])
    );
    const codecs = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'stream=codec_name', '-of', 'csv=p=0', malformed],
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(codecs).toContain('vp9');
    await expect(mediaProbe(malformed, 'video/webm')).rejects.toThrow(/tipo indicado/i);
  });

  it('does not infer timing from the frame rate reported for a PNG', async () => {
    const path = join(directory, 'logo.png');
    const png = Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jG6kAAAAASUVORK5CYII=',
      'base64'
    );
    await writeFile(path, png);

    expect(await mediaProbe(path)).toEqual({ width: 1, height: 1, hasAudio: false });
  });
});
