import type { EngineId } from '@workspace/video-project';

export const engineName = { remotion: 'Remotion', hyperframes: 'HyperFrames' } satisfies Record<
  EngineId,
  string
>;

export function timeLabel(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return (
    Math.floor(seconds / 60) +
    ':' +
    String(seconds % 60).padStart(2, '0') +
    ',' +
    String(Math.floor((ms % 1000) / 100))
  );
}
