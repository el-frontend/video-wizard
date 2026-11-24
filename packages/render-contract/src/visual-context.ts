import type {
  ComponentManifest,
  Layer,
  ProjectDraft,
  VisualContext,
} from '@workspace/video-project';
import type { ResolvedDependencies } from './dependencies';
import { projectAppearance } from './project-appearance';
export function generatedFonts(dependencies: ResolvedDependencies) {
  const fonts = new Map<
    string,
    { assetId: string; family: string; weight: { min: number; max: number } }
  >();
  for (const entry of Object.values(dependencies.libraries))
    if (entry.kind === 'component' && 'schemaVersion' in entry.manifest)
      for (const id of entry.manifest.assetIds) {
        const asset = dependencies.assets[id];
        if (asset?.mediaType.startsWith('font/'))
          fonts.set(id, {
            assetId: id,
            family: 'StudioAsset' + asset.hash,
            weight: { min: 1, max: 1000 },
          });
      }
  return [...fonts.values()];
}
export function visualContext(
  document: ProjectDraft,
  dependencies: ResolvedDependencies,
  layer: Extract<Layer, { type: 'component' }>,
  manifest: ComponentManifest,
  originMs: number,
  url = (id: string) => dependencies.assets[id]!.url
): VisualContext {
  const { diagnostics: _diagnostics, ...appearance } = projectAppearance(
    document,
    dependencies,
    layer
  );
  const assets = Object.fromEntries(
    manifest.assetIds.map((id) => {
      const asset = dependencies.assets[id]!;
      return [
        id,
        {
          url: url(id),
          mediaType: asset.mediaType,
          width: asset.width,
          height: asset.height,
          ...(asset.mediaType.startsWith('font/') && { fontFamily: 'StudioAsset' + asset.hash }),
        },
      ];
    })
  );
  return {
    canvas: { ...document.canvas },
    size: { width: layer.box.width, height: layer.box.height },
    durationMs: Math.min(layer.endMs - layer.startMs, document.durationMs - originMs),
    appearance,
    assets,
    fontFamilies: [
      ...new Set([
        appearance.family,
        'serif',
        'sans-serif',
        'monospace',
        'system-ui',
        'cursive',
        'fantasy',
        ...Object.values(assets).flatMap((a) => (a.fontFamily ? [a.fontFamily] : [])),
      ]),
    ].filter((name) => /^[\p{L}\p{M}\p{N}\s,'"_\-]+$/u.test(name)),
  };
}
