import type { CaptionCue } from '@workspace/video-project';
import {
  fromWhisperSeconds,
  secondsToLegacyMs,
  type LegacySubtitleMs,
  type SubtitleSegmentSeconds,
  type WhisperSegment,
} from '@/features/video/lib/legacy-timing';

export interface ShortRange {
  startMs: number;
  endMs: number;
}
function toCaptionCues(segments: LegacySubtitleMs[]): CaptionCue[] {
  return segments.flatMap((segment, i) => {
    if (!segment.text.trim() || segment.end <= segment.start) return [];
    return [
      {
        id: 'cue-' + i,
        startMs: segment.start,
        endMs: segment.end,
        text: segment.text,
        words: segment.words?.map((word) => ({
          text: word.word,
          startMs: word.start - segment.start,
          endMs: word.end - segment.start,
        })),
      },
    ];
  });
}

export function sourceCues(segments: WhisperSegment[], durationMs: number): CaptionCue[] {
  return sliceCaptions(toCaptionCues(fromWhisperSeconds(segments)), {
    startMs: 0,
    endMs: durationMs,
  });
}

export function editedClipCues(
  segments: SubtitleSegmentSeconds[],
  durationMs: number
): CaptionCue[] {
  return sliceCaptions(
    toCaptionCues(secondsToLegacyMs(segments)),
    { startMs: 0, endMs: durationMs },
    'authored'
  );
}

export function sliceCaptions(
  cues: CaptionCue[],
  range: ShortRange,
  textSource: 'measured' | 'authored' = 'measured'
): CaptionCue[] {
  return cues.flatMap((cue) => {
    const a = Math.max(cue.startMs, range.startMs),
      b = Math.min(cue.endMs, range.endMs);
    if (a >= b) return [];
    const timing = { startMs: a - range.startMs, endMs: b - range.startMs };
    if (!cue.words?.length) return [{ ...cue, ...timing }];
    const words = cue.words.flatMap((word) => {
      const start = Math.max(a, cue.startMs + word.startMs),
        end = Math.min(b, cue.startMs + word.endMs);
      return start < end && word.text.trim()
        ? [{ text: word.text, startMs: start - a, endMs: end - a }]
        : [];
    });
    // An edited cue may retain timing for only one part of its text after a merge.
    if (textSource === 'authored')
      return [{ ...cue, ...timing, words: words.length ? words : undefined }];
    if (!words.length) return [];
    const joined = cue.words
      .map((w) => w.text)
      .join('')
      .trim();
    const text =
      joined === cue.text.trim()
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
