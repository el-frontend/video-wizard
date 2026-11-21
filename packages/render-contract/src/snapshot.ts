import {
  validateForExport,
  supportsStudioEngine,
  type Layer,
  type Diagnostic,
  type LibraryRef,
  type ProjectDraft,
  type ProjectRecord,
} from '@workspace/video-project';

import { libraryKey, type ResolvedDependencies } from './dependencies';
import { videoPlayback } from './video-playback';
import { sceneFrames } from './scene-frames';
import { projectAppearance } from './project-appearance';
export * from './dependencies';

export interface ExportSnapshot extends Pick<ProjectRecord, 'ownerId' | 'revision' | 'document'> {
  dependencies: ResolvedDependencies;
  /** Pinned library source bytes. Opaque until validated by the appropriate engine. */
  bundles: Record<string, { sha256: string; base64: string }>;
  diagnostics: Diagnostic[];
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
    if (entry.kind === 'style' && !supportsStudioEngine(entry, document.engine)) {
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
  const fonts = library.flatMap((entry) => ('fonts' in entry ? (entry.fonts ?? []) : []));
  function validateMedia(layer: Layer, sceneId?: string) {
    if (!('assetId' in layer) || !Object.hasOwn(dependencies.assets, layer.assetId)) return;
    const media = dependencies.assets[layer.assetId];
    if (!media) return;
    const location = sceneId === undefined ? { layerId: layer.id } : { layerId: layer.id, sceneId };
    if (layer.type === 'video' && layer.playbackVariant) {
      const variant = layer.playbackVariant;
      const derived = dependencies.assets[variant.assetId];
      try {
        videoPlayback(layer);
        if (
          !derived?.mediaType.startsWith('video/') ||
          derived.durationMs === undefined ||
          derived.durationMs < variant.sourceEndMs - variant.sourceStartMs ||
          !media.durationMs ||
          variant.sourceEndMs > media.durationMs ||
          (media.hasAudio && !derived.hasAudio)
        )
          throw Error('El recorte procesado no cubre el video o su audio. Usa el video original.');
      } catch (cause) {
        diagnostics.push({
          code: 'crop-coverage',
          severity: 'error',
          ...location,
          message: (cause as Error).message,
        });
      }
    }
    const compatible =
      layer.type === 'audio'
        ? (media.mediaType.startsWith('audio/') && media.hasAudio !== false) ||
          (media.mediaType.startsWith('video/') && media.hasAudio === true)
        : media.mediaType.startsWith(layer.type + '/');
    if (!compatible)
      diagnostics.push({
        code: 'media-type',
        severity: 'error',
        ...location,
        message: 'El recurso no es compatible con esta capa de medios.',
      });
    if (
      'sourceInMs' in layer &&
      media.durationMs !== undefined &&
      layer.sourceInMs >= media.durationMs
    ) {
      diagnostics.push({
        code: 'source-in-range',
        severity: 'error',
        ...location,
        message: 'El recorte comienza fuera de la duración del recurso.',
      });
    }
  }
  for (const layer of document.globalAudio) validateMedia(layer);
  const boundaries = sceneFrames(document);
  for (const [index, scene] of document.scenes.entries()) {
    if (boundaries[index]!.durationInFrames === 0)
      diagnostics.push({
        severity: 'error',
        code: 'scene-no-frame',
        sceneId: scene.id,
        message: 'La escena no ocupa ningún cuadro a esta frecuencia.',
      });
    for (const layer of scene.layers) {
      validateMedia(layer, scene.id);
      if (layer.type === 'text' || layer.type === 'captions' || layer.type === 'component') {
        const { family, weight } = projectAppearance(document, dependencies, layer);
        const registered = fonts.some(
          (font) =>
            font.family === family &&
            weight >= font.weight.min &&
            weight <= font.weight.max &&
            dependencies.assets[font.assetId]?.mediaType?.startsWith('font/')
        );
        if (family !== 'sans-serif' && !registered)
          diagnostics.push({
            severity: 'error',
            code: 'font-unresolved',
            sceneId: scene.id,
            layerId: layer.id,
            message: 'No se ha fijado la fuente «' + family + '» con peso ' + weight + '.',
          });
      }
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
  }
  return diagnostics;
}
