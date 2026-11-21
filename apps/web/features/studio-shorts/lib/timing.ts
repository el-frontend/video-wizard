import type { CaptionCue } from '@workspace/video-project';
import { fromWhisperSeconds, type WhisperSegment } from '@/features/video/lib/legacy-timing';

export interface ShortRange {
  startMs: number;
  endMs: number;
}
export function sourceCues(segments: WhisperSegment[], durationMs: number): CaptionCue[] {
  return fromWhisperSeconds(segments).flatMap((segment, i) => {
    const startMs = Math.max(0, segment.start),
      endMs = Math.min(durationMs, segment.end);
    if (endMs <= startMs || !segment.text) return [];
    const words = segment.words?.flatMap((word) => {
      const a = Math.max(startMs, word.start),
        b = Math.min(endMs, word.end);
      return b > a && word.word.trim()
        ? [{ text: word.word, startMs: a - startMs, endMs: b - startMs }]
        : [];
    });
    return [
      { id: 'cue-' + i, startMs, endMs, text: segment.text, ...(words?.length ? { words } : {}) },
    ];
  });
}

export function sliceCaptions(cues: CaptionCue[], range: ShortRange): CaptionCue[] {
  return cues.flatMap((cue) => {
    const a = Math.max(cue.startMs, range.startMs),
      b = Math.min(cue.endMs, range.endMs);
    if (a >= b) return [];
    const timing = { startMs: a - range.startMs, endMs: b - range.startMs };
    if (!cue.words?.length || (a === cue.startMs && b === cue.endMs))
      return [{ ...cue, ...timing }];
    const words = cue.words.flatMap((word) => {
      const start = Math.max(a, cue.startMs + word.startMs),
        end = Math.min(b, cue.startMs + word.endMs);
      return start < end ? [{ text: word.text, startMs: start - a, endMs: end - a }] : [];
    });
    if (!words.length) return [];
    const joined = cue.words
      .map((w) => w.text)
      .join('')
      .trim();
    const text =
      words.length === cue.words.length
        ? cue.text
        : joined === cue.text.trim()
          ? words
              .map((w) => w.text)
              .join('')
              .trim()
          : words
              .map((w) => w.text.trim())
              .join(' ')
              .replace(/\s+([.,!?;:])/g, '$1');
    return [{ id: cue.id, ...timing, text, words }];
  });
}

export function toLegacySeconds(cues: CaptionCue[]) {
  return cues.map((cue, id) => ({
    id,
    start: cue.startMs / 1000,
    end: cue.endMs / 1000,
    text: cue.text,
    words: cue.words?.map((w) => ({
      word: w.text,
      start: (cue.startMs + w.startMs) / 1000,
      end: (cue.startMs + w.endMs) / 1000,
    })),
  }));
}
