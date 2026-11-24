import { dirname } from 'node:path';
import { cliExecutable } from '@workspace/hyperframes-compositions';
import type { PreparedComposition } from '@workspace/render-contract';
import { runProcess } from './process';
export function runCli(prepared: PreparedComposition, args: string[], signal: AbortSignal) {
  return runProcess(process.execPath, [cliExecutable, ...args], {
    cwd: dirname(prepared.entry),
    // The pinned CLI otherwise spawns detached update and exit-telemetry processes.
    env: { ...process.env, HYPERFRAMES_NO_TELEMETRY: '1', HYPERFRAMES_NO_UPDATE_CHECK: '1' },
    signal,
  });
}
