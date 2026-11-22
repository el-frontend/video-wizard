import { fork } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { makeCancelSignal, renderMedia, selectComposition } from '@remotion/renderer';

interface EncodeRequest {
  serveUrl: string;
  inputProps: Record<string, unknown>;
  outputLocation: string;
  offthreadVideoCacheSizeInBytes: number;
  timeoutInMilliseconds: number;
  concurrency?: number;
}
type Encoder = (
  request: EncodeRequest,
  signal: AbortSignal,
  onProgress: (progress: number) => void
) => Promise<void>;

export const encodeLegacy: Encoder = async (request, signal, onProgress) => {
  const { cancel, cancelSignal } = makeCancelSignal();
  signal.throwIfAborted();
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const common = {
      serveUrl: request.serveUrl,
      inputProps: request.inputProps,
      browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE,
      logLevel: 'error' as const,
      cancelSignal,
    };
    const composition = await selectComposition({ ...common, id: 'VideoWithSubtitles' });
    signal.throwIfAborted();
    await renderMedia({
      ...request,
      ...common,
      composition,
      codec: 'h264',
      x264Preset: 'veryfast',
      onProgress: ({ progress }) => onProgress(progress),
    });
  } finally {
    signal.removeEventListener('abort', cancel);
  }
};

// Remotion can print its source URL when decoding fails. Only numbers and the exit code
// return to the parent. Send source URLs on private IPC and discard library output at the OS boundary.
export const runLegacyEncoder: Encoder = (request, signal, onProgress) =>
  new Promise((resolve, reject) => {
    signal.throwIfAborted();
    const env: NodeJS.ProcessEnv = {};
    for (const key of [
      'PATH',
      'HOME',
      'TMPDIR',
      'TEMP',
      'TMP',
      'SystemRoot',
      'LOCALAPPDATA',
      'LANG',
      'LC_ALL',
      'NODE_ENV',
      'LD_LIBRARY_PATH',
      'FONTCONFIG_PATH',
      'XDG_CACHE_HOME',
      'REMOTION_BROWSER_EXECUTABLE',
    ]) {
      if (process.env[key] !== undefined) env[key] = process.env[key];
    }
    const child = fork(fileURLToPath(import.meta.url), [], {
      execArgv: ['--import', 'tsx'],
      env,
      stdio: ['ignore', 'ignore', 'ignore', 'ipc'],
      detached: process.platform !== 'win32',
    });
    let timer: NodeJS.Timeout | undefined;
    const stop = () => {
      if (timer) return;
      if (child.connected) child.send('cancel', () => {});
      timer = setTimeout(() => {
        if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
        try {
          if (process.platform === 'win32') child.kill('SIGKILL');
          else process.kill(-child.pid, 'SIGKILL');
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== 'ESRCH')
            reject(Error('No se pudo detener la exportación.'));
        }
      }, 3000);
      timer.unref();
    };
    signal.addEventListener('abort', stop, { once: true });
    child.on('message', (p) => {
      if (typeof p === 'number' && p >= 0 && p <= 1) onProgress(p);
    });
    child.once('error', () => reject(Error('No se pudo iniciar la exportación.')));
    child.once('close', (code) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      if (code === 0 && !signal.aborted) resolve();
      else reject(Error('La exportación se interrumpió.'));
    });
    child.send(request, (err) => {
      if (err) stop();
    });
  });

if (process.send && process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  const abort = new AbortController();
  process.once('disconnect', () => abort.abort());
  process.once('message', async (request: EncodeRequest) => {
    process.on('message', (m) => {
      if (m === 'cancel') abort.abort();
    });
    try {
      await encodeLegacy(request, abort.signal, (p) => {
        if (process.connected) process.send?.(p, undefined, undefined, () => {});
      });
    } catch {
      process.exitCode = 1;
    } finally {
      if (process.connected) process.disconnect();
    }
  });
}
