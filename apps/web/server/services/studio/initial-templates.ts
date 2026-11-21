import type { EntryOf, Layer, Scene } from '@workspace/video-project';

const durationMs = 4000;
const canvas = { width: 1080, height: 1920, fps: 30 };

const common = {
  startMs: 0,
  endMs: durationMs,
  endAnchor: 'scene-end' as const,
  visible: true,
  zIndex: 0,
};
function headline(id: string, text: string): Scene {
  return {
    id,
    durationMs,
    layers: [
      {
        ...common,
        id: id + '-texto',
        type: 'text',
        text,
        box: { x: 84, y: 360, width: 912, height: 840 },
      },
    ],
  };
}
export function initialTemplates(): EntryOf<'template'>[] {
  const captions: Layer = {
    ...common,
    id: 'subtitulos',
    type: 'captions',
    box: { x: 0, y: 0, width: canvas.width, height: canvas.height },
    templateRef: { id: 'minimal', version: 1 },
    cues: [{ id: 'apertura', startMs: 0, endMs: durationMs, text: 'Una historia empieza aquí.' }],
  };
  return [
    {
      kind: 'template',
      id: 'short-con-subtitulos',
      version: 1,
      name: 'Short con subtítulos',
      engine: 'remotion',
      assetIds: [],
      manifest: { version: 1, props: { subtitulo: { type: 'string' } } },
      structure: {
        version: 1,
        canvas,
        scenes: [{ id: 'primera', durationMs, layers: [captions] }],
        globalAudio: [],
        styleRef: null,
        slots: {
          subtitulo: {
            field: 'caption',
            sceneId: 'primera',
            layerId: captions.id,
            cueId: 'apertura',
          },
        },
      },
    },
    {
      kind: 'template',
      id: 'boletin-de-escenas',
      version: 1,
      name: 'Boletín de escenas',
      engine: 'remotion',
      assetIds: [],
      manifest: { version: 1, props: { titular: { type: 'string' }, detalle: { type: 'string' } } },
      structure: {
        version: 1,
        canvas,
        scenes: [
          headline('portada', 'La noticia del día'),
          headline('desarrollo', 'Lo que viene después'),
        ],
        globalAudio: [],
        styleRef: null,
        slots: {
          titular: { field: 'text', sceneId: 'portada', layerId: 'portada-texto' },
          detalle: { field: 'text', sceneId: 'desarrollo', layerId: 'desarrollo-texto' },
        },
      },
    },
  ];
}
