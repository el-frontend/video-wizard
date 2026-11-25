import { expect, it, vi } from 'vitest';
import { useCurrentFrame } from 'remotion';
import { LayerRenderer } from './layer-renderer';
vi.mock('remotion', async (original) => ({
  ...(await original<typeof import('remotion')>()),
  useCurrentFrame: vi.fn(),
}));
import { exampleProject } from '@workspace/video-project/fixtures';
import {
  captionAt,
  ProjectComposition,
  projectMetadata,
  sequenceFrames,
} from './project-composition';

it('uses the saved canvas and eight seconds for the two-scene composition', () => {
  const project = exampleProject();
  project.durationMs = 8000;
  project.scenes[1]!.durationMs += 800;
  expect(projectMetadata(project)).toEqual({ ...project.canvas, durationInFrames: 240 });
  expect(sequenceFrames(4200, 100, 2900, 30)).toEqual({ from: 3, durationInFrames: 84 });
  expect(sequenceFrames(17, 17, 81, 30)).toEqual({ from: 1, durationInFrames: 2 });
  expect(sequenceFrames(17, 1, 2, 30)).toEqual({ from: 0, durationInFrames: 1 });
});

it('keeps word timing local to the cue and excludes the cue end', () => {
  const cue = {
    id: 'cue',
    startMs: 200,
    endMs: 900,
    text: 'Hola mundo',
    words: [
      { text: 'Hola', startMs: 0, endMs: 300 },
      { text: 'mundo', startMs: 300, endMs: 700 },
    ],
  };
  expect(captionAt([cue], 500)?.currentWord).toBe('mundo');
  expect(captionAt([cue], 500)?.currentSegment?.words?.[1]).toEqual({
    word: 'mundo',
    start: 0.5,
    end: 0.9,
  });
  expect(captionAt([cue], 900)).toBeNull();
});

it('uses the next absolute scene start as the previous scene’s exclusive end', () => {
  const document = exampleProject();
  document.scenes[0]!.durationMs = 1017;
  document.scenes.splice(1, 0, { id: 'subframe', durationMs: 1, layers: [] });
  document.scenes[2]!.durationMs = 1001;
  const result = ProjectComposition({
    document,
    dependencies: { assets: {}, libraries: {} },
    registry: {},
  });
  const scenes = result.props.children[1];
  expect(scenes[0].props).toMatchObject({ from: 0, durationInFrames: 30 });
  expect(scenes[1]).toBeNull();
  expect(scenes[2].props).toMatchObject({ from: 30, durationInFrames: 31 });
});
it('draws the caption at absolute frame six, excluding the previous cue ending exactly there', () => {
  const document = exampleProject();
  document.canvas.fps = 30;
  const layer = document.scenes[0]!.layers.find((l) => l.type === 'captions')!;
  delete layer.templateRef;
  layer.startMs = 167;
  layer.cues = [
    { id: 'ends', startMs: 0, endMs: 33, text: 'Anterior' },
    { id: 'begins', startMs: 33, endMs: 34, text: 'Primer cuadro' },
  ];
  vi.mocked(useCurrentFrame).mockReturnValue(1);
  const sample = () =>
    LayerRenderer({
      document,
      layer,
      origin: 0,
      dependencies: { assets: {}, libraries: {} },
      registry: {},
    });
  expect(sample()?.props.children).toBe('Primer cuadro');
  layer.cues.shift();
  vi.mocked(useCurrentFrame).mockReturnValue(2);
  expect(sample()).toBeNull();
});
