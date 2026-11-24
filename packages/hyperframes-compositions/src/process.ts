import { descendants } from './process-tree';
import { spawn } from 'node:child_process';

/** The CLI spawns Chrome and FFmpeg. On cancellation terminate the entire process group. */
export function runProcess(
  command: string,
  args: string[],
  options: { signal: AbortSignal; cwd?: string; env?: NodeJS.ProcessEnv }
) {
  const { signal, cwd } = options;
  return new Promise<string>((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(command, args, {
      cwd,
      env: options.env,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '',
      stderr = '',
      cleanup: Promise<void> | undefined;
    let cleanupError: Error | undefined;
    const groups = new Set<number>();
    const kill = (sig: NodeJS.Signals) => {
      if (process.platform === 'win32') {
        child.kill(sig);
        return;
      }
      for (const group of groups) {
        try {
          process.kill(-group, sig);
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
        }
      }
    };
    const abort = () => {
      if (child.pid && process.platform !== 'win32') {
        groups.add(child.pid);
        // Chromium may own a separate process group. Capture its group while the CLI still owns it.
        try {
          for (const entry of descendants(child.pid)) {
            if (entry.pid === entry.group) groups.add(entry.group);
          }
        } catch {
          // A restricted host may deny process enumeration. Still stop the group we created.
          cleanupError = new Error('El sistema impidió verificar los subprocesos del render.');
        }
      }
      kill('SIGTERM');
      cleanup = new Promise<void>((done) => setTimeout(done, 1250)).then(() => kill('SIGKILL'));
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk).slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-200_000);
    });
    child.once('error', reject);
    child.once('close', async (code) => {
      signal.removeEventListener('abort', abort);
      await cleanup;
      if (cleanupError) reject(cleanupError);
      else if (signal.aborted) reject(signal.reason);
      else if (code !== 0)
        reject(new Error(command + ' falló (' + code + '): ' + stderr + ' ' + stdout));
      else resolve(stdout);
    });
  });
}
