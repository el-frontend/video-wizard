import type { ProjectDraft, Scene } from '@workspace/video-project';

// A single captions layout can span any range. Other authored layers keep their exact timing.
export function fitsShort(
  structure: Pick<ProjectDraft, 'scenes' | 'globalAudio' | 'canvas'>,
  canvas: ProjectDraft['canvas'],
  durations: number[]
) {
  const scene: Scene | undefined = structure.scenes[0];
  if (
    !scene ||
    structure.scenes.length !== 1 ||
    scene.layers.some((layer) => layer.type === 'video') ||
    structure.canvas.width !== canvas.width ||
    structure.canvas.height !== canvas.height ||
    structure.canvas.fps !== canvas.fps
  )
    return false;
  const captions = scene.layers.filter((l) => l.type === 'captions');
  if (
    captions.length > 1 ||
    captions.some((l) => l.sourceAudioLayerId || l.startMs !== 0 || l.endMs !== scene.durationMs)
  )
    return false;
  const flexible =
    structure.globalAudio.length === 0 && scene.layers.every((l) => l.type === 'captions');
  return (
    durations.every((d) => d > 0 && (flexible || d === scene.durationMs)) &&
    structure.globalAudio.every((l) => l.endMs <= scene.durationMs)
  );
}
