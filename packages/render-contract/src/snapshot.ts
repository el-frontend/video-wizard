import {
  validateForExport,
  type AssetDescriptor,
  type Diagnostic,
  type LibraryEntry,
  type LibraryRef,
  type ProjectDraft,
  type ProjectRecord,
} from '@workspace/video-project';

export interface ResolvedAsset extends Omit<AssetDescriptor, 'ownerId'> {
  url: string;
}
export interface ResolvedDependencies {
  assets: Record<string, ResolvedAsset>;
  libraries: Record<string, LibraryEntry>;
}
export interface ExportSnapshot extends Pick<ProjectRecord, 'ownerId' | 'revision' | 'document'> {
  dependencies: ResolvedDependencies;
  /** Pinned library source bytes. Opaque until validated by the appropriate engine. */
  bundles: Record<string, { sha256: string; base64: string }>;
  diagnostics: Diagnostic[];
}
export function libraryKey({ id, version }: LibraryRef): string {
  return JSON.stringify([id, version]);
}
export function projectPins(document: ProjectDraft): LibraryRef[] {
  const refs = [document.styleRef, document.brandSnapshot?.ref];
  for (const scene of document.scenes) {
    refs.push(scene.templateRef);
    for (const layer of scene.layers) {
      if (layer.type === 'component') refs.push(layer.componentRef);
      if (layer.type === 'captions') refs.push(layer.templateRef);
    }
  }
  return [
    ...new Map(refs.filter((r): r is LibraryRef => !!r).map((r) => [libraryKey(r), r])).values(),
  ];
}

export function validateSnapshot(snapshot: ExportSnapshot): Diagnostic[] {
  const { document, dependencies } = snapshot;
  const library = Object.values(dependencies.libraries);
  const diagnostics = [...snapshot.diagnostics, ...validateForExport(document, { library })];
  const ids = new Set(document.assetIds);
  if (!document.durationMs)
    diagnostics.push({
      severity: 'error',
      code: 'empty-project',
      message: 'El proyecto está vacío.',
    });
  for (const entry of library) {
    for (const id of entry.assetIds) ids.add(id);
    if (entry.kind === 'style' && !entry.engines?.includes(document.engine)) {
      diagnostics.push({
        severity: 'error',
        code: 'style-engine',
        message: 'El estilo fijado no admite este motor.',
      });
    }
    if ('fonts' in entry)
      for (const font of entry.fonts ?? []) {
        if (!dependencies.assets[font.assetId]?.mediaType?.startsWith('font/')) {
          diagnostics.push({
            severity: 'error',
            code: 'font-missing',
            message: 'Falta la fuente ' + font.family,
          });
        }
      }
  }
  for (const id of ids)
    if (!Object.hasOwn(dependencies.assets, id)) {
      diagnostics.push({
        severity: 'error',
        code: 'asset-missing',
        message: 'Falta el recurso ' + id,
      });
    }
  for (const scene of document.scenes)
    for (const layer of scene.layers) {
      if (
        layer.type === 'text' &&
        layer.text.length * 24 * 48 > layer.box.width * layer.box.height
      ) {
        diagnostics.push({
          severity: 'warning',
          code: 'text-overflow',
          sceneId: scene.id,
          layerId: layer.id,
          message: 'Puede que el texto no quepa en su caja.',
        });
      }
    }
  return diagnostics;
}
