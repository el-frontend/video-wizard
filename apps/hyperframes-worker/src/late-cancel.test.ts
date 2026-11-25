import { it, expect, vi } from 'vitest';
import { mkdtemp, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { HyperframesProjectAdapter } from './adapter';
import { runCli } from './cli';
vi.mock('./cli', () => ({ runCli: vi.fn() }));
it('retracts the promoted file when the final progress callback aborts', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'native-late-'));
  try {
    await writeFile(join(workspace, 'native-manifest.json'), JSON.stringify({ fps: 25 }));
    vi.mocked(runCli).mockImplementation(async (_p, args) => {
      if (args[0] === 'render')
        execFileSync('ffmpeg', [
          '-v',
          'error',
          '-f',
          'lavfi',
          '-i',
          'color=red:s=16x16:r=25',
          '-frames:v',
          '1',
          args.at(-1)!,
        ]);
      return '';
    });
    const controller = new AbortController();
    const result = new HyperframesProjectAdapter().render(
      {
        engine: 'hyperframes',
        workspace,
        manifestHash: 'synthetic',
        entry: join(workspace, 'index.html'),
      },
      {
        signal: controller.signal,
        onProgress(progress) {
          if (progress === 1) controller.abort();
        },
      }
    );
    await expect(result).rejects.toThrow();
    expect(await readdir(workspace)).toEqual(['native-manifest.json']);
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
