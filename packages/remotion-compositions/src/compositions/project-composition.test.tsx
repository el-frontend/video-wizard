import { expect, it } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { captionAt, projectMetadata, sequenceFrames } from './project-composition';

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
