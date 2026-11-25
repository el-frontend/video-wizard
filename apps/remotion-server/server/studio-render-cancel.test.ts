import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { expect, it, vi } from 'vitest';
import type { ExportSnapshot } from '@workspace/render-contract';
import { executeStudioRender } from './studio-http';

it('retracts an artifact and does not complete when cancellation wins the adapter handoff', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'studio-render-cancel-'));
  try {
    const job = {
      status: 'queued' as const,
      abort: new AbortController(),
      snapshot: {} as ExportSnapshot,
      workspace,
      progress: 0,
    };
    const artifact = join(workspace, 'video.mp4');
    const prepare = vi.fn().mockResolvedValue({});
    const render = vi.fn().mockImplementation(async (_project, options) => {
      await writeFile(artifact, 'synthetic');
      options.onProgress(1);
      job.abort.abort();
      return { artifacts: [] };
    });
    await executeStudioRender(job, { prepare, render });
    expect(render).toHaveBeenCalledOnce();
    expect(job.status).toBe('failed');
    await expect(access(artifact)).rejects.toThrow();
  } finally {
    await rm(workspace, { recursive: true, force: true });
  }
});
