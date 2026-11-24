import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { containsTime, type Diagnostic } from '@workspace/video-project';
import {
  nativeCaptionSource,
  layerSampleMs,
  libraryKey,
  projectAppearance,
  sceneFrames,
  validateSnapshot,
  type ExportSnapshot,
  type PreparedComposition,
} from '@workspace/render-contract';
import { assetPath, openAssetFile, resolveStudioDataDir } from '@workspace/render-contract/storage';
import { mediaDiagnostics } from './media-capabilities';
import { nativeDocument } from './runtime';
import { materialize, mediaFilename } from './media';

const require = createRequire(import.meta.url);
export const cliPackage = dirname(require.resolve('hyperframes/package.json'));
export const cliExecutable = join(cliPackage, 'bin', 'hyperframes.mjs');

const hash = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function fpsArgument(fps: number) {
  if (fps < 1 || fps > 240) return undefined;
  if (Number.isInteger(fps)) return String(fps);
  for (const denominator of [1001, 10, 100, 1000, 10000, 100000]) {
    const numerator = Math.round(fps * denominator);
    if (numerator / denominator === fps) return numerator + '/' + denominator;
  }
  return undefined;
}
export function validateNative(snapshot: ExportSnapshot) {
  const { document, dependencies } = snapshot;
  const diagnostics: Diagnostic[] = [
    ...validateSnapshot(snapshot),
    ...projectAppearance(document, dependencies).diagnostics,
  ];
  const error = (code: string, message: string) =>
    diagnostics.push({ code, message, severity: 'error' });
  if (document.engine !== 'hyperframes') error('engine-mismatch', 'El proyecto usa otro motor.');
  if (!fpsArgument(document.canvas.fps))
    error('fps-unsupported', 'La frecuencia no se puede expresar en el motor HyperFrames.');
  for (const entry of Object.values(dependencies.libraries)) {
    if (entry.kind !== 'component') continue;
    const bundle = snapshot.bundles[libraryKey(entry)];
    if (
      entry.engine !== 'hyperframes' ||
      entry.manifest.builtin?.kind !== 'hyperframes-caption' ||
      Object.keys(entry.manifest.props).length ||
      !bundle ||
      bundle.sha256 !== hash(nativeCaptionSource) ||
      !Buffer.from(bundle.base64, 'base64').equals(Buffer.from(nativeCaptionSource))
    )
      error('unsupported-component', 'No se puede compilar la versión nativa de ' + entry.id);
  }
  const bounds = sceneFrames(document),
    fps = document.canvas.fps;
  for (const [i, scene] of document.scenes.entries())
    for (const layer of scene.layers) {
      const location = { sceneId: scene.id, layerId: layer.id };
      if (layer.overrides)
        diagnostics.push(
          ...projectAppearance(document, dependencies, layer).diagnostics.map((d) => ({
            ...d,
            ...location,
          }))
        );
      if (layer.type !== 'captions') continue;
      if (
        layer.templateRef &&
        dependencies.libraries[libraryKey(layer.templateRef)]?.kind !== 'component'
      )
        error('unsupported-component', 'La capa de subtítulos requiere un componente nativo.');
      const range = bounds[i]!,
        origin = range.originMs + layer.startMs;
      if (
        layer.cues.some((cue) => {
          const frame = Math.ceil(((origin + cue.startMs) * fps) / 1000);
          return (
            frame >= range.from + range.durationInFrames ||
            !containsTime(cue, layerSampleMs(frame, fps, origin))
          );
        })
      )
        diagnostics.push({
          severity: 'warning',
          code: 'cue-no-frame',
          message: 'Hay subtítulos sin un fotograma visible. Ajusta su intervalo.',
          ...location,
        });
    }
  return diagnostics;
}
export async function validateNativeAssets(
  snapshot: ExportSnapshot,
  dataDir = resolveStudioDataDir(),
  signal = new AbortController().signal
) {
  const diagnostics = validateNative(snapshot);
  if (diagnostics.some((d) => d.severity === 'error' && d.code !== 'scene-no-frame'))
    return diagnostics;
  return [
    ...diagnostics,
    ...(await mediaDiagnostics(
      snapshot,
      async (asset) => {
        const path = await assetPath(dataDir, snapshot.ownerId, asset.hash);
        const { file } = await openAssetFile(path);
        await file.close();
        return path;
      },
      signal
    )),
  ];
}
export interface NativeManifest {
  fps: number;
  frames: number;
  width: number;
  height: number;
  files: string[];
  scriptHash: string;
}
export async function compileProject(
  snapshot: ExportSnapshot,
  workspace: string,
  options: { signal?: AbortSignal; dataDir?: string; preview?: boolean } = {}
): Promise<PreparedComposition> {
  const signal = options.signal ?? new AbortController().signal;
  signal.throwIfAborted();
  const error = validateNative(snapshot).find(
    (d) => d.severity === 'error' && !(options.preview && d.code === 'scene-no-frame')
  );
  if (error) throw new Error(error.message);
  const dir = join(workspace, 'native');
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const { layers: media, soundtrack } = await materialize(snapshot, dir, options.dataDir, signal);
  const { html, timeline } = nativeDocument(snapshot, media, soundtrack?.src);
  const gsap = await readFile(require.resolve('gsap/dist/gsap.min.js'));
  const runtime = await readFile(join(cliPackage, 'dist', 'hyperframe.runtime.iife.js'));
  const pkg: { version: string } = JSON.parse(
    await readFile(join(cliPackage, 'package.json'), 'utf8')
  );
  const { width, height, fps } = snapshot.document.canvas;
  const published = new Set(['index.html', 'gsap.min.js', 'runtime.js']);
  const audioOnly = new Set(soundtrack?.tracks.filter((t) => t.audioOnly).map((t) => t.id));
  for (const [id, m] of media) if (!audioOnly.has(id)) published.add(m.src);
  if (soundtrack) published.add(soundtrack.src);
  for (const entry of Object.values(snapshot.dependencies.libraries)) {
    if ('fonts' in entry)
      for (const font of entry.fonts ?? [])
        published.add('media/' + mediaFilename(snapshot.dependencies.assets[font.assetId]!));
  }
  const manifest: NativeManifest = {
    fps,
    width,
    height,
    frames: Math.ceil((snapshot.document.durationMs * fps) / 1000),
    files: [...published].sort(),
    scriptHash: createHash('sha256').update(timeline).digest('base64'),
  };
  const entry = join(dir, 'index.html');
  const provenance = snapshot.document.scenes.flatMap((scene) =>
    scene.layers.flatMap((l) =>
      l.type === 'video'
        ? [{ id: l.id, original: l.assetId, sourceInMs: l.sourceInMs, variant: l.playbackVariant }]
        : []
    )
  );
  const manifestBytes = JSON.stringify({
    ...manifest,
    cliVersion: pkg.version,
    htmlHash: hash(html),
    gsapHash: hash(gsap),
    runtimeHash: hash(runtime),
    revision: snapshot.revision,
    documentHash: hash(JSON.stringify(snapshot.document)),
    assetHashes: Object.fromEntries(
      Object.entries(snapshot.dependencies.assets).map(([id, asset]) => [id, asset.hash])
    ),
    libraryHashes: Object.fromEntries(
      Object.entries(snapshot.dependencies.libraries).map(([id, entry]) => [
        id,
        hash(JSON.stringify(entry)),
      ])
    ),
    bundleHashes: Object.fromEntries(
      Object.entries(snapshot.bundles).map(([id, bundle]) => [id, bundle.sha256])
    ),
    media: [...media],
    soundtrack,
    provenance,
  });
  await Promise.all([
    writeFile(entry, html, { signal }),
    writeFile(join(dir, 'runtime.js'), runtime, { signal }),
    writeFile(join(dir, 'gsap.min.js'), gsap, { signal }),
    writeFile(join(workspace, 'native-manifest.json'), manifestBytes, { signal }),
  ]);
  signal.throwIfAborted();
  return { engine: 'hyperframes', entry, workspace, manifestHash: hash(manifestBytes) };
}
export async function readNativeManifest(workspace: string): Promise<NativeManifest> {
  return JSON.parse(await readFile(join(workspace, 'native-manifest.json'), 'utf8'));
}
