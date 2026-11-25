import {
  containsTime,
  quantizeRange,
  type CaptionCue,
  type ProjectDraft,
} from '@workspace/video-project';
import type { CaptionTemplateProps } from '../types';

export function projectMetadata(document: ProjectDraft) {
  return {
    ...document.canvas,
    durationInFrames: Math.max(1, Math.ceil((document.durationMs * document.canvas.fps) / 1000)),
  };
}

export function sequenceFrames(origin: number, startMs: number, endMs: number, fps: number) {
  const { fromFrame, durationInFrames } = quantizeRange(origin + startMs, origin + endMs, fps);
  return { from: fromFrame - Math.floor((origin * fps) / 1000), durationInFrames };
}

export function captionAt(cues: CaptionCue[], timeMs: number): CaptionTemplateProps | null {
  const index = cues.findIndex((cue) => containsTime(cue, timeMs));
  const cue = cues[index];
  if (!cue) return null;
  const word = cue.words?.find((w) => containsTime(w, timeMs - cue.startMs));
  return {
    currentWord: word?.text ?? cue.text,
    isActive: true,
    currentSegment: {
      id: index,
      text: cue.text,
      start: cue.startMs / 1000,
      end: cue.endMs / 1000,
      words: cue.words?.map((w) => ({
        word: w.text,
        start: (cue.startMs + w.startMs) / 1000,
        end: (cue.startMs + w.endMs) / 1000,
      })),
    },
  };
}
