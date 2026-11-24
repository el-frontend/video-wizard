import { generatedAssetDiagnostics } from '@workspace/render-contract/generated-assets';
import { verifyModule } from '@workspace/render-contract/component-bundle';
import { containsTime } from '@workspace/video-project';
import { projectAppearance } from '@workspace/remotion-compositions';
import { bundle } from '@remotion/bundler';
import { makeCancelSignal, renderMedia, renderStill, selectComposition } from '@remotion/renderer';
import { execFile } from 'node:child_process';
import { bundlePublicPath, hostRenderBundle } from './render-bundle-host.js';
import { writeFile, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { promisify } from 'node:util';
import {
  layerSampleMs,
  libraryKey,
  sceneFrames,
  validateSnapshot,
  type Artifact,
  type EngineAdapter,
  type ExportSnapshot,
  type PreparedComposition,
  type RenderOptions,
} from '@workspace/render-contract';
import { fileHash, stageMedia } from '@workspace/render-contract/storage';
import { buildRegistry, hashBytes, serverModules, verifiedSeed } from './registry-builder.js';

const exec = promisify(execFile);
export { fileHash, stageMedia } from '@workspace/render-contract/storage';
export function browserInput(snapshot: ExportSnapshot) {
  const dependencies = structuredClone(snapshot.dependencies);
  for (const asset of Object.values(dependencies.assets)) asset.url = 'media/' + asset.hash;
  return { document: snapshot.document, dependencies };
}
async function artifact(
  p: PreparedComposition,
  relativePath: string,
  kind: Artifact['kind'],
  signal: AbortSignal
): Promise<Artifact> {
  const sha256 = await fileHash(join(p.workspace, relativePath), signal);
  signal.throwIfAborted();
  return { kind, relativePath, sha256 };
}
async function selected(p: PreparedComposition) {
  const { url, close } = await hostRenderBundle(p.entry);
  try {
    const options = { serveUrl: url, browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE };
    return {
      options: {
        ...options,
        composition: await selectComposition({ ...options, id: 'StudioProject' }),
      },
      close,
    };
  } catch (error) {
    close();
    throw error;
  }
}

export class RemotionProjectAdapter implements EngineAdapter {
  constructor(private readonly dataDir?: string) {}
  async validate(snapshot: ExportSnapshot) {
    const diagnostics = [
      ...validateSnapshot(snapshot),
      ...(await generatedAssetDiagnostics(snapshot, this.dataDir)),
    ];
    diagnostics.push(...projectAppearance(snapshot.document, snapshot.dependencies).diagnostics);
    const boundaries = sceneFrames(snapshot.document);
    for (const [index, scene] of snapshot.document.scenes.entries()) {
      const { originMs, from, durationInFrames } = boundaries[index]!;
      const fps = snapshot.document.canvas.fps;
      for (const layer of scene.layers) {
        if (layer.type === 'captions') {
          const origin = originMs + layer.startMs;
          const unsampled = layer.cues.some((cue) => {
            const firstFrame = Math.ceil(((origin + cue.startMs) * fps) / 1000);
            return (
              firstFrame >= from + durationInFrames ||
              !containsTime(cue, layerSampleMs(firstFrame, fps, origin))
            );
          });
          if (unsampled)
            diagnostics.push({
              severity: 'warning',
              code: 'cue-no-frame',
              message:
                'Hay subtítulos sin un fotograma visible. Ajusta su inicio o amplía su intervalo.',
              sceneId: scene.id,
              layerId: layer.id,
            });
        }
        if (
          layer.type === 'captions' &&
          layer.templateRef &&
          snapshot.dependencies.libraries[libraryKey(layer.templateRef)]?.kind === 'template'
        ) {
          diagnostics.push({
            severity: 'error',
            code: 'unsupported-component',
            message: 'La capa de subtítulos requiere un preset Remotion.',
            sceneId: scene.id,
            layerId: layer.id,
          });
        }
        if (layer.overrides)
          diagnostics.push(
            ...projectAppearance(snapshot.document, snapshot.dependencies, layer).diagnostics.map(
              (d) => ({ ...d, sceneId: scene.id, layerId: layer.id })
            )
          );
      }
    }
    if (snapshot.document.engine !== 'remotion')
      diagnostics.push({
        severity: 'error',
        code: 'engine-mismatch',
        message: 'El proyecto usa otro motor.',
      });
    for (const entry of Object.values(snapshot.dependencies.libraries)) {
      if (entry.kind !== 'component') continue;
      try {
        if ('schemaVersion' in entry.manifest) {
          const pin = snapshot.bundles[libraryKey(entry)];
          if (!pin) throw Error();
          verifyModule(Buffer.from(pin.base64, 'base64'), entry.manifest, pin.sha256);
        } else await verifiedSeed(snapshot, entry);
      } catch {
        diagnostics.push({
          severity: 'error',
          code: 'unsupported-component',
          message: 'No se puede compilar la versión de ' + entry.id,
        });
      }
    }
    return diagnostics;
  }
  async prepare(snapshot: ExportSnapshot, workspace: string): Promise<PreparedComposition> {
    const diagnostics = await this.validate(snapshot);
    const error = diagnostics.find((d) => d.severity === 'error');
    if (error) throw new Error(error.message);
    const registry = await buildRegistry(snapshot, workspace);
    const input = browserInput(snapshot);
    await stageMedia(snapshot, join(workspace, 'public', 'media'), this.dataDir);
    const entryPoint = join(workspace, 'render.ts');
    await writeFile(
      entryPoint,
      [
        'import { registerRoot, staticFile } from "remotion";',
        'import { createStudioRoot } from "@workspace/remotion-compositions/Root";',
        'import { registry } from "./registry";',
        'const input = JSON.parse(' + JSON.stringify(JSON.stringify(input)) + ');',
        'for (const asset of Object.values(input.dependencies.assets)) asset.url = staticFile(asset.url);',
        'registerRoot(createStudioRoot(input.document, input.dependencies, registry));',
      ].join('\n')
    );
    const entry = await bundle({
      entryPoint,
      publicPath: bundlePublicPath,
      outDir: join(workspace, 'bundle'),
      publicDir: join(workspace, 'public'),
      rootDir: process.cwd(),
      enableCaching: false,
      webpackOverride: (config) => ({
        ...config,
        resolve: {
          ...config.resolve,
          modules: [serverModules, ...(config.resolve?.modules ?? ['node_modules'])],
        },
      }),
    });
    if (registry.modules.size) {
      const scripts = [];
      for (const [hash, module] of registry.modules) {
        const name = 'component-' + hash + '.js';
        await writeFile(join(entry, name), module);
        scripts.push('<script src="./' + name + '"></script>');
      }
      const html = join(entry, 'index.html');
      await writeFile(
        html,
        (await readFile(html, 'utf8')).replace('<head>', '<head>' + scripts.join(''))
      );
    }
    await writeFile(
      join(workspace, 'render-manifest.json'),
      JSON.stringify({ moduleHashes: [...registry.modules.keys()] })
    );
    return {
      engine: 'remotion',
      workspace,
      entry,
      manifestHash: hashBytes(JSON.stringify([snapshot, registry.hash])),
    };
  }
  async snapshots(prepared: PreparedComposition, timesMs: number[], signal: AbortSignal) {
    signal.throwIfAborted();
    const { options, close } = await selected(prepared);
    const { cancelSignal, cancel } = makeCancelSignal();
    signal.addEventListener('abort', cancel, { once: true });
    try {
      const results: Artifact[] = [];
      for (const ms of timesMs) {
        signal.throwIfAborted();
        if (!Number.isSafeInteger(ms) || ms < 0)
          throw new Error('El tiempo de captura no es válido.');
        const relativePath = 'frame-' + ms + '.png';
        const frame = Math.min(
          options.composition.durationInFrames - 1,
          Math.floor((ms * options.composition.fps) / 1000)
        );
        await renderStill({
          ...options,
          frame,
          output: join(prepared.workspace, relativePath),
          cancelSignal,
        });
        results.push(await artifact(prepared, relativePath, 'snapshot', signal));
      }
      signal.throwIfAborted();
      return results;
    } finally {
      signal.removeEventListener('abort', cancel);
      close();
    }
  }
  async render(prepared: PreparedComposition, { signal, onProgress }: RenderOptions) {
    signal.throwIfAborted();
    const { options, close } = await selected(prepared);
    const { cancelSignal, cancel } = makeCancelSignal();
    signal.addEventListener('abort', cancel, { once: true });
    const output = join(prepared.workspace, 'video.mp4');
    try {
      signal.throwIfAborted();
      await renderMedia({
        ...options,
        codec: 'h264',
        outputLocation: output,
        cancelSignal,
        // AAC packet padding may extend the MP4 beyond the last saved frame.
        ffmpegOverride: ({ type, args }) =>
          type === 'stitcher'
            ? [
                ...args.slice(0, -1),
                '-t',
                String(options.composition.durationInFrames / options.composition.fps),
                args[args.length - 1]!,
              ]
            : args,
        concurrency: 2,
        onProgress: ({ progress }) => onProgress(progress),
      });
      const { stdout } = await exec(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,width,height:format=duration',
          '-of',
          'json',
          output,
        ],
        { signal }
      );
      const measured: {
        format: { duration: string };
        streams: { codec_type: string; width: number; height: number }[];
      } = JSON.parse(stdout);
      const video = measured.streams.find((stream) => stream.codec_type === 'video');
      if (!video) throw new Error('El archivo generado no contiene video.');
      const videoArtifact = await artifact(prepared, 'video.mp4', 'video', signal);
      signal.throwIfAborted();
      return {
        artifacts: [videoArtifact],
        width: video.width,
        height: video.height,
        durationMs: Math.round(Number(measured.format.duration) * 1000),
        hasAudio: measured.streams.some((stream) => stream.codec_type === 'audio'),
      };
    } finally {
      signal.removeEventListener('abort', cancel);
      close();
    }
  }
}
