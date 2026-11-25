import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { cliExecutable } from '@workspace/hyperframes-compositions';
import type { PreparedComposition } from '@workspace/render-contract';
import { runProcess } from './process';
export async function runCli(prepared: PreparedComposition, args: string[], signal: AbortSignal) {
  const temp = join(prepared.workspace, 'cli-tmp');
  await mkdir(temp, { recursive: true, mode: 0o700 });
  return runProcess(process.execPath, [cliExecutable, ...args], {
    cwd: dirname(prepared.entry),
    // The pinned CLI otherwise spawns detached update and exit-telemetry processes.
    env: {
      ...process.env,
      TMPDIR: temp,
      HYPERFRAMES_NO_TELEMETRY: '1',
      HYPERFRAMES_NO_UPDATE_CHECK: '1',
    },
    signal,
  });
}
