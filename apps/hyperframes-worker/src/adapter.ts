import { mkdtemp, readdir, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import {
  compileProject,
  fpsArgument,
  readNativeManifest,
  validateNativeAssets,
} from '@workspace/hyperframes-compositions';
import type {
  Artifact,
  EngineAdapter,
  ExportSnapshot,
  PreparedComposition,
  RenderOptions,
} from '@workspace/render-contract';
import { fileHash } from '@workspace/render-contract/storage';
import { runCli } from './cli';
import { runProcess } from './process';

export class HyperframesProjectAdapter implements EngineAdapter {
  constructor(private readonly dataDir?: string) {}
  async validate(snapshot: ExportSnapshot, signal?: AbortSignal) {
    return validateNativeAssets(snapshot, this.dataDir, signal);
  }
  prepare(snapshot: ExportSnapshot, workspace: string, signal?: AbortSignal) {
    return compileProject(snapshot, workspace, { signal, dataDir: this.dataDir });
  }
  check(p: PreparedComposition, signal: AbortSignal) {
    return runCli(p, ['check', '--strict', '--json'], signal);
  }
  async snapshots(
    p: PreparedComposition,
    timesMs: number[],
    signal: AbortSignal
  ): Promise<Artifact[]> {
    const { fps, frames } = await readNativeManifest(p.workspace);
    const temp = await mkdtemp(join(p.workspace, 'snapshot-'));
    try {
      const results: Artifact[] = [];
      for (const ms of timesMs) {
        signal.throwIfAborted();
        if (!Number.isSafeInteger(ms) || ms < 0)
          throw new Error('El tiempo de captura no es válido.');
        const seconds = Math.min(frames - 1, Math.floor((ms * fps) / 1000)) / fps;
        await runCli(
          p,
          [
            'snapshot',
            '--at',
            String(seconds),
            '--no-end',
            '--keep',
            '--describe',
            'false',
            '--output',
            temp,
          ],
          signal
        );
        const png = (await readdir(temp)).find((file) => file.endsWith('.png'));
        if (!png) throw new Error('Falta la captura.');
        const relativePath = 'frame-' + ms + '.png',
          file = join(p.workspace, relativePath);
        await rename(join(temp, png), file);
        results.push({ kind: 'snapshot', relativePath, sha256: await fileHash(file, signal) });
      }
      return results;
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
  async render(p: PreparedComposition, { signal, onProgress }: RenderOptions) {
    signal.throwIfAborted();
    const { fps } = await readNativeManifest(p.workspace);
    const temp = await mkdtemp(join(p.workspace, 'render-')),
      file = join(temp, 'output.mp4');
    const relativePath = 'video.mp4',
      destination = join(p.workspace, relativePath);
    let promoted = false;
    try {
      await this.check(p, signal);
      onProgress(0.1);
      await runCli(
        p,
        [
          'render',
          '--fps',
          fpsArgument(fps)!,
          '--strict-all',
          '--no-best-effort',
          '--output',
          file,
        ],
        signal
      );
      const bytes = await runProcess(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,width,height:format=duration',
          '-of',
          'json',
          file,
        ],
        { signal }
      );
      const probe: {
        streams: { codec_type: string; width: number; height: number }[];
        format: { duration: string };
      } = JSON.parse(bytes);
      const video = probe.streams.find((s) => s.codec_type === 'video');
      if (!video) throw new Error('El archivo generado no contiene video.');
      const sha256 = await fileHash(file, signal);
      signal.throwIfAborted();
      await rename(file, destination);
      promoted = true;
      await rm(temp, { recursive: true, force: true });
      signal.throwIfAborted();
      onProgress(1);
      signal.throwIfAborted();
      return {
        artifacts: [{ kind: 'video' as const, relativePath, sha256 }],
        durationMs: Math.round(Number(probe.format.duration) * 1000),
        width: video.width,
        height: video.height,
        hasAudio: probe.streams.some((s) => s.codec_type === 'audio'),
      };
    } catch (error) {
      if (promoted) await rm(destination, { force: true });
      await rm(temp, { recursive: true, force: true });
      throw error;
    }
  }
}
