import { it, expect } from 'vitest';
import { runProcess } from './process';
it('aborts the entire render process before it can produce output', async () => {
  const abort = new AbortController();
  const pending = runProcess(process.execPath, ['-e', 'setInterval(()=>{},1000)'], {
    signal: abort.signal,
  });
  abort.abort();
  await expect(pending).rejects.toThrow();
});

import { access, mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { vi } from 'vitest';
import { HyperframesProjectAdapter } from './adapter';
it('cancels a child process group and prevents delayed descendant output', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'hf-process-'));
  const ready = join(dir, 'ready'),
    output = join(dir, 'video.mp4');
  const child =
    "require('node:fs').writeFileSync(process.argv[1],'ready');setTimeout(()=>require('node:fs').writeFileSync(process.argv[2],'late'),350)";
  const parent =
    "require('node:child_process').spawn(process.execPath,['-e',process.argv[1],process.argv[2],process.argv[3]],{stdio:'inherit'});setInterval(()=>{},1000)";
  const ctl = new AbortController();
  const running = runProcess(process.execPath, ['-e', parent, child, ready, output], {
    signal: ctl.signal,
  });
  await vi.waitFor(() => access(ready));
  ctl.abort();
  await expect(running).rejects.toThrow();
  await new Promise((ok) => setTimeout(ok, 400));
  await expect(access(output)).rejects.toThrow();
});
it('removes the incomplete render and never promotes an aborted job', async () => {
  const workspace = await mkdtemp(join(tmpdir(), 'hf-abort-'));
  await writeFile(join(workspace, 'native-manifest.json'), JSON.stringify({ fps: 30, frames: 30 }));
  const adapter = new HyperframesProjectAdapter(),
    controller = new AbortController();
  vi.spyOn(adapter, 'check').mockImplementation(async () => {
    controller.abort();
    return '';
  });
  await expect(
    adapter.render(
      {
        workspace,
        engine: 'hyperframes',
        entry: join(workspace, 'index.html'),
        manifestHash: 'hash',
      },
      { signal: controller.signal, onProgress() {} }
    )
  ).rejects.toThrow();
  expect(await readdir(workspace)).toEqual(['native-manifest.json']);
});
