import type { JsonValue, LibraryEntry, LibraryManifest, LibraryRef } from './library';
import type { Diagnostic, Layer, ProjectDraft } from './schema';

type Location = Pick<Diagnostic, 'sceneId' | 'layerId'>;

export function validComponentProps(
  props: Record<string, JsonValue>,
  manifest: LibraryManifest
): boolean {
  return (
    Object.entries(manifest.props).every(
      ([key, field]) => !field.required || Object.hasOwn(props, key)
    ) &&
    Object.entries(props).every(([key, value]) => {
      const type = value === null ? 'null' : Array.isArray(value) ? 'array' : typeof value;
      return Object.hasOwn(manifest.props, key) && manifest.props[key]?.type === type;
    })
  );
}

/** Every library pin must resolve before export. An omitted catalog resolves no pins. */
export function validateForExport(
  project: ProjectDraft,
  dependencies: { library?: readonly LibraryEntry[] } = {}
): Diagnostic[] {
  const diagnostics: Diagnostic[] = [];
  const assets = new Set(project.assetIds);
  function error(code: string, message: string, location: Location) {
    diagnostics.push({ severity: 'error', code, message, ...location });
  }
  function reference(ref: LibraryRef, kinds: LibraryEntry['kind'][], location: Location) {
    const entry = dependencies.library?.find(
      (e) => e.id === ref.id && e.version === ref.version && kinds.includes(e.kind)
    );
    if (!entry)
      error('library-missing', 'Falta la versión ' + ref.version + ' de ' + ref.id, location);
    else if ('engine' in entry && entry.engine !== project.engine)
      error('engine-mismatch', 'El recurso usa otro motor: ' + ref.id, location);
    return entry;
  }
  function media(layer: Layer, location: Location) {
    if ('assetId' in layer && !assets.has(layer.assetId))
      error('asset-missing', 'Falta el recurso ' + layer.assetId, location);
    if (layer.type === 'audio' && layer.take?.stale)
      diagnostics.push({
        severity: 'warning',
        code: 'stale-take',
        message: 'La toma difiere de la narración',
        ...location,
      });
  }

  if (project.styleRef) reference(project.styleRef, ['style'], {});
  if (project.brandSnapshot) reference(project.brandSnapshot.ref, ['brand'], {});
  for (const scene of project.scenes) {
    const sceneId = scene.id;
    if (scene.templateRef) reference(scene.templateRef, ['template'], { sceneId });
    for (const layer of scene.layers) {
      const location = { sceneId, layerId: layer.id };
      media(layer, location);
      if (layer.endMs > scene.durationMs)
        error('layer-overflow', 'La capa termina fuera de la escena', location);
      if (layer.type === 'component') {
        const entry = reference(layer.componentRef, ['component'], location);
        if (entry?.kind === 'component' && !validComponentProps(layer.props, entry.manifest))
          error(
            'component-props',
            'Las propiedades no coinciden con el manifiesto del componente',
            location
          );
      }
      if (layer.type === 'captions') {
        if (layer.templateRef) reference(layer.templateRef, ['component', 'template'], location);
        if (
          layer.sourceAudioLayerId &&
          !scene.layers.some((l) => l.id === layer.sourceAudioLayerId && l.type === 'audio') &&
          !project.globalAudio.some((track) => track.id === layer.sourceAudioLayerId)
        ) {
          error(
            'audio-layer-missing',
            'Falta la capa de audio vinculada a los subtítulos',
            location
          );
        }
        for (const cue of layer.cues) {
          if (cue.endMs > layer.endMs - layer.startMs)
            error('cue-overflow', 'El subtítulo queda fuera de la capa: ' + cue.id, location);
          if (cue.words?.some((w) => w.endMs > cue.endMs - cue.startMs))
            error('word-overflow', 'Hay palabras fuera del subtítulo: ' + cue.id, location);
        }
      }
    }
  }
  for (const layer of project.globalAudio) media(layer, { layerId: layer.id });
  return diagnostics;
}
