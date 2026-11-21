import { spawn } from 'node:child_process';

/** The CLI spawns Chrome and FFmpeg. On cancellation terminate the entire process group. */
export function runProcess(
  command: string,
  args: string[],
  options: { signal: AbortSignal; cwd?: string }
) {
  const { signal, cwd } = options;
  return new Promise<string>((resolve, reject) => {
    signal.throwIfAborted();
    const child = spawn(command, args, {
      cwd,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: process.platform !== 'win32',
    });
    let stdout = '',
      stderr = '',
      timer: NodeJS.Timeout | undefined;
    const kill = (sig: NodeJS.Signals) => {
      if (!child.pid) return;
      try {
        if (process.platform === 'win32') child.kill(sig);
        else process.kill(-child.pid, sig);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ESRCH') throw error;
      }
    };
    const abort = () => {
      kill('SIGTERM');
      timer = setTimeout(() => kill('SIGKILL'), 750);
    };
    signal.addEventListener('abort', abort, { once: true });
    child.stdout.on('data', (chunk) => {
      stdout = (stdout + chunk).slice(-2_000_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = (stderr + chunk).slice(-200_000);
    });
    child.once('error', reject);
    child.once('close', (code) => {
      signal.removeEventListener('abort', abort);
      if (timer) {
        clearTimeout(timer);
        kill('SIGKILL');
      }
      if (signal.aborted) reject(signal.reason);
      else if (code !== 0)
        reject(new Error(command + ' falló (' + code + '): ' + stderr + ' ' + stdout));
      else resolve(stdout);
    });
  });
}
