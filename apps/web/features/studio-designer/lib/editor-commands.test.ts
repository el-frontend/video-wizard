import { expect, it } from 'vitest';
import { applyCommand, sceneStartMs, type Layer } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { moveBeforeId, fitBox, checkLayerRange } from './editor-commands';

it('moves the selected scene by ID, changing its derived start and preserving source ranges', () => {
  const draft = exampleProject();
  const selected = 'intro';
  const moved = applyCommand(draft, {
    type: 'reorder-scene',
    sceneId: selected,
    beforeId: moveBeforeId(draft.scenes, selected, 1),
  });
  expect(sceneStartMs(moved, selected)).toBe(3000);
  expect(moved.scenes.find((scene) => scene.id === selected)).toStrictEqual(draft.scenes[0]);
  expect(moved.globalAudio).toEqual(draft.globalAudio);
});

const clip: Extract<Layer, { type: 'video' }> = {
  id: 'clip',
  type: 'video',
  box: { x: 0, y: 0, width: 1920, height: 1080 },
  fit: 'cover',
  focalPoint: { x: 0.5, y: 0.5 },
  volume: 0.6,
  assetId: 'clip-asset',
  visible: true,
  zIndex: 1,
  sourceInMs: 5000,
  startMs: 1000,
  endMs: 8000,
  endAnchor: 'fixed',
};

it('uses the measured source for the full 7000 ms interval, with a 5000 ms offset', () => {
  expect(checkLayerRange(clip, {}, 12000)).toBeNull();
  expect(checkLayerRange(clip, { sourceInMs: 5001 }, 12000)).toBeTruthy();
  expect(checkLayerRange(clip, { endMs: 8001 }, 12000)).toBeTruthy();
  expect(checkLayerRange(clip, { startMs: 999 }, 12000)).toBeTruthy();
  expect(checkLayerRange(clip, { endMs: 500 }, 12000)).toBeTruthy();
  expect(checkLayerRange(clip, { sourceInMs: 0 }, undefined)).toBeTruthy();
});

it('changes the format independently of the saved box, and fits only when requested', () => {
  const draft = exampleProject();
  const next = applyCommand(draft, {
    type: 'set-canvas',
    canvas: { width: 400, height: 400, fps: 25 },
  });
  expect(next.scenes).toStrictEqual(draft.scenes);
  expect(fitBox({ x: -20, y: 500, width: 800, height: 200 }, next.canvas)).toEqual({
    x: 0,
    y: 300,
    width: 400,
    height: 100,
  });
});
