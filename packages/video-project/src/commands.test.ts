import { expect, test } from 'vitest';
import { applyCommand, sceneStartMs, validateForExport } from './index';
import { exampleProject } from './fixtures/projects';

test('expands only the selected scene and its scene-end layers; global tracks keep absolute time', () => {
  const draft = exampleProject();
  const result = applyCommand(draft, { type: 'extend-scene', sceneId: 'intro', durationMs: 5000 });
  expect(sceneStartMs(result, 'outro')).toBe(5000);
  expect(result.durationMs).toBe(8000);
  expect(result.scenes[1]).toStrictEqual(draft.scenes[1]);
  expect(result.globalAudio).toStrictEqual(draft.globalAudio);
  expect(result.scenes[0]!.layers.map((l) => l.endMs)).toEqual([4200, 4200, 5000]);
  expect(draft).toStrictEqual(exampleProject());
});

test('replacing a take uses measured duration and matching local cues without a ripple', () => {
  const draft = exampleProject();
  const cues = [
    {
      id: 'fresh',
      text: 'Nueva',
      startMs: 10,
      endMs: 1000,
      words: [{ text: 'Nueva', startMs: 0, endMs: 990 }],
    },
  ];
  const result = applyCommand(draft, {
    type: 'replace-take',
    sceneId: 'intro',
    layerId: 'speech',
    assetId: 'new-voice',
    durationMs: 4800,
    spokenText: 'Hola',
    provider: 'upload',
    cues,
  });
  expect(result.assetIds).toContain('new-voice');
  expect(result.scenes[0]!.layers[0]).toMatchObject({
    id: 'speech',
    assetId: 'new-voice',
    endMs: 4800,
    take: { stale: false, durationMs: 4800 },
  });
  expect(result.scenes[0]!.layers[1]).toMatchObject({
    sourceAudioLayerId: 'speech',
    cues,
    endMs: 4800,
  });
  expect(sceneStartMs(result, 'outro')).toBe(4200);
  expect(result.scenes[1]).toStrictEqual(draft.scenes[1]);
  expect(result.globalAudio).toStrictEqual(draft.globalAudio);
  expect(validateForExport(result)).toContainEqual(
    expect.objectContaining({ code: 'layer-overflow', layerId: 'speech' })
  );
});

test('headline edits preserve voice metadata, narration edits mark its recorded text stale', () => {
  const draft = exampleProject();
  const head = applyCommand(draft, { type: 'set-headline', sceneId: 'intro', text: 'Nuevo' });
  expect(head.scenes[0]!.layers[0]).toStrictEqual(draft.scenes[0]!.layers[0]);
  expect(head.scenes[0]!.editorial).toEqual({ headline: 'Nuevo', narration: 'Hola' });
  const spoken = applyCommand(head, { type: 'set-narration', sceneId: 'intro', text: 'Mundo' });
  expect(spoken.scenes[0]!.layers[0]).toMatchObject({ take: { spokenText: 'Hola', stale: true } });
  expect(spoken.scenes[0]!.editorial?.headline).toBe('Nuevo');
});

test('moves, removes and inserts scenes by stable IDs while deriving the full duration', () => {
  const initial = exampleProject();
  const reordered = applyCommand(initial, {
    type: 'reorder-scene',
    sceneId: 'outro',
    beforeId: 'intro',
  });
  expect(reordered.scenes.map((s) => s.id)).toEqual(['outro', 'intro']);
  expect(sceneStartMs(reordered, 'intro')).toBe(3000);
  const cut = applyCommand(reordered, { type: 'remove-scene', sceneId: 'outro' });
  expect(cut.durationMs).toBe(7000);
  const restored = applyCommand(cut, { type: 'add-scene', scene: initial.scenes[1]! });
  expect(restored).toStrictEqual(initial);
  expect(() => applyCommand(initial, { type: 'remove-scene', sceneId: 'absent' })).toThrow();
});

test('edits layer position, props, ranges, cues and appearance without dropping explicit overrides', () => {
  let p = exampleProject();
  p = applyCommand(p, {
    type: 'update-layer',
    sceneId: 'intro',
    layerId: 'card',
    patch: { props: { headline: 'Otro' }, startMs: 100 },
  });
  p = applyCommand(p, { type: 'set-captions', sceneId: 'intro', layerId: 'captions', cues: [] });
  p = applyCommand(p, { type: 'set-style', ref: null });
  p = applyCommand(p, { type: 'set-brand', snapshot: null });
  expect(p.scenes[0]!.layers[2]).toMatchObject({
    startMs: 100,
    props: { headline: 'Otro' },
    overrides: { palette: ['azul'] },
  });
  expect(p.scenes[0]!.layers[1]).toMatchObject({ cues: [] });
  expect(p.styleRef).toBeNull();
  expect(p.brandSnapshot).toBeNull();
  const layer = p.scenes[0]!.layers[2]!;
  p = applyCommand(p, { type: 'remove-layer', sceneId: 'intro', layerId: 'card' });
  p = applyCommand(p, { type: 'add-layer', sceneId: 'intro', layer });
  p = applyCommand(p, {
    type: 'reorder-layer',
    sceneId: 'intro',
    layerId: 'card',
    beforeId: 'speech',
  });
  expect(p.scenes[0]!.layers.map((l) => l.id)).toEqual(['card', 'speech', 'captions']);
  expect(p.scenes[0]!.layers.map((l) => l.zIndex)).toEqual([0, 1, 2]);
  expect(() =>
    applyCommand(p, {
      type: 'update-layer',
      sceneId: 'intro',
      layerId: 'card',
      patch: { endMs: 10 },
    })
  ).toThrow();
});

test('global audio edits use absolute times and reject visual layers', () => {
  const initial = exampleProject();
  const result = applyCommand(initial, {
    type: 'update-layer',
    sceneId: null,
    layerId: 'music-track',
    patch: { endMs: 9000 },
  });
  expect(result.durationMs).toBe(9000);
  expect(result.scenes).toStrictEqual(initial.scenes);
  expect(() =>
    applyCommand(result, { type: 'add-layer', sceneId: null, layer: initial.scenes[1]!.layers[0]! })
  ).toThrow();
});

test('does not throw away measured words when the target has no caption layer', () => {
  const draft = exampleProject();
  draft.scenes[0]!.layers = draft.scenes[0]!.layers.filter((l) => l.type !== 'captions');
  expect(() =>
    applyCommand(draft, {
      type: 'replace-take',
      sceneId: 'intro',
      layerId: 'speech',
      assetId: 'fresh',
      durationMs: 1000,
      spokenText: 'Nueva',
      provider: 'upload',
      cues: [
        {
          id: 'c',
          text: 'Nueva',
          startMs: 0,
          endMs: 800,
          words: [{ text: 'Nueva', startMs: 20, endMs: 500 }],
        },
      ],
    })
  ).toThrow();
});
