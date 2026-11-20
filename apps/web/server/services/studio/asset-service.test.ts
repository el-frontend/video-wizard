import { execFileSync } from 'node:child_process';
import { mkdtemp, open, rm, writeFile } from 'node:fs/promises';
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
  it('measures the last audio packet of a live WebM without duration or captions', async () => {
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
    const duration = execFileSync(
      'ffprobe',
      ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', path],
      { encoding: 'utf8', timeout: 30000 }
    );
    expect(duration.trim()).toBe('N/A');

    const metadata = await mediaProbe(path);
    expect(metadata).toMatchObject({ width: 160, height: 90, hasAudio: true });
    expect(metadata.durationMs).toBeGreaterThanOrEqual(2475);
    expect(metadata.durationMs).toBeLessThanOrEqual(2535);
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
