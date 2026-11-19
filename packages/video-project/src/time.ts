import type { ProjectDraft } from './schema';

type Sequence = Pick<ProjectDraft, 'scenes' | 'globalAudio'>;

export function projectDurationMs(project: Sequence): number {
  const sequenceEnd = project.scenes.reduce((sum, scene) => sum + scene.durationMs, 0);
  return project.globalAudio.reduce((end, track) => Math.max(end, track.endMs), sequenceEnd);
}

export function sceneStartMs(project: Pick<ProjectDraft, 'scenes'>, sceneId: string): number {
  let startMs = 0;
  for (const scene of project.scenes) {
    if (scene.id === sceneId) return startMs;
    startMs += scene.durationMs;
  }
  throw new RangeError('No existe la escena: ' + sceneId);
}

export function containsTime(range: { startMs: number; endMs: number }, timeMs: number): boolean {
  return range.startMs <= timeMs && timeMs < range.endMs;
}

export function quantizeRange(startMs: number, endMs: number, fps: number) {
  if (
    !Number.isSafeInteger(startMs) ||
    !Number.isSafeInteger(endMs) ||
    startMs < 0 ||
    startMs >= endMs ||
    !Number.isFinite(fps) ||
    fps <= 0
  )
    throw new RangeError('Intervalo o frecuencia de cuadros inválidos');
  const fromFrame = Math.floor((startMs * fps) / 1000);
  return { fromFrame, durationInFrames: Math.max(1, Math.ceil((endMs * fps) / 1000) - fromFrame) };
}
