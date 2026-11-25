import type { ProjectDraft } from '@workspace/video-project';

/** Adjacent scenes share one exclusive frame boundary; only the sequence tail rounds up. */
export function sceneFrames({ scenes, canvas }: Pick<ProjectDraft, 'scenes' | 'canvas'>) {
  let elapsedMs = 0,
    boundary = 0;
  return scenes.map((scene, index) => {
    const from = boundary,
      originMs = elapsedMs;
    elapsedMs += scene.durationMs;
    const end = (elapsedMs * canvas.fps) / 1000;
    boundary = index === scenes.length - 1 ? Math.ceil(end) : Math.floor(end);
    return { originMs, from, durationInFrames: boundary - from };
  });
}
/** Time relative to a layer at one absolute frame sample. */
export function layerSampleMs(frame: number, fps: number, layerOriginMs: number) {
  return (frame * 1000) / fps - layerOriginMs;
}
