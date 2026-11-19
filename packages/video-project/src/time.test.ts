import { expect, test } from 'vitest';
import { containsTime, quantizeRange, sceneStartMs } from './index';
import { exampleProject } from './fixtures/projects';
test('rounds the start down and the exclusive end up, including subframe spans', () => {
  expect(quantizeRange(1, 2, 30)).toEqual({ fromFrame: 0, durationInFrames: 1 });
  expect(quantizeRange(80, 120, 25)).toEqual({ fromFrame: 2, durationInFrames: 1 });
  expect(quantizeRange(80, 121, 25)).toEqual({ fromFrame: 2, durationInFrames: 2 });
  expect(() => quantizeRange(1, 0, 30)).toThrow();
});
test('uses half-open cue ranges and sequential scene starts', () => {
  const range = { startMs: 100, endMs: 120 };
  expect([99, 100, 119, 120].map((t) => containsTime(range, t))).toEqual([
    false,
    true,
    true,
    false,
  ]);
  expect(sceneStartMs(exampleProject(), 'outro')).toBe(4200);
  expect(() => sceneStartMs(exampleProject(), 'gone')).toThrow();
});
