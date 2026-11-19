import type { ProjectDraft } from '../schema';

export function exampleProject(): ProjectDraft {
  const timing = { startMs: 0, endMs: 4200, endAnchor: 'fixed' as const, visible: true, zIndex: 0 };
  const box = { x: 50, y: 100, width: 880, height: 200 };
  return {
    schemaVersion: 1,
    id: 'project',
    title: 'Dos escenas',
    engine: 'remotion',
    canvas: { width: 1080, height: 1920, fps: 30 },
    durationMs: 7200,
    styleRef: { id: 'estilo', version: 2 },
    brandSnapshot: { ref: { id: 'marca', version: 1 }, values: { ink: '#101010' } },
    assetIds: ['voice', 'music'],
    scenes: [
      {
        id: 'intro',
        durationMs: 4200,
        editorial: { headline: 'Inicio', narration: 'Hola' },
        layers: [
          {
            ...timing,
            id: 'speech',
            type: 'audio',
            assetId: 'voice',
            sourceInMs: 0,
            volume: 1,
            take: { spokenText: 'Hola', provider: 'upload', durationMs: 4200, stale: false },
          },
          {
            ...timing,
            id: 'captions',
            type: 'captions',
            box,
            zIndex: 1,
            sourceAudioLayerId: 'speech',
            templateRef: { id: 'sub', version: 3 },
            cues: [
              {
                id: 'cue',
                startMs: 100,
                endMs: 900,
                text: 'Hola',
                words: [{ text: 'Hola', startMs: 0, endMs: 800 }],
              },
            ],
          },
          {
            ...timing,
            id: 'card',
            type: 'component',
            endAnchor: 'scene-end',
            box,
            zIndex: 2,
            componentRef: { id: 'card', version: 1 },
            props: { headline: 'Inicio' },
            overrides: { palette: ['azul'] },
          },
        ],
      },
      {
        id: 'outro',
        durationMs: 3000,
        layers: [
          { ...timing, id: 'bye', type: 'text', startMs: 100, endMs: 2900, box, text: 'Adiós' },
        ],
      },
    ],
    globalAudio: [
      {
        ...timing,
        type: 'audio',
        id: 'music-track',
        startMs: 1000,
        endMs: 7000,
        assetId: 'music',
        sourceInMs: 0,
        volume: 0.5,
      },
    ],
  };
}
