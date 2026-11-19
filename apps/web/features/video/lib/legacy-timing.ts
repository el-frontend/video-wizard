import type { SubtitleSegment } from '@workspace/remotion-compositions';

export type SubtitleSegmentSeconds = Omit<SubtitleSegment, 'id'>;
export type WhisperSegment = SubtitleSegmentSeconds;

interface WordTimingMs {
  word: string;
  start: number; // milliseconds
  end: number; // milliseconds
}

export interface LegacySubtitleMs {
  start: number; // milliseconds
  end: number; // milliseconds
  text: string;
  words?: WordTimingMs[];
}

export function fromWhisperSeconds(input: WhisperSegment[]): LegacySubtitleMs[] {
  return secondsToLegacyMs(input).map((segment) => ({ ...segment, text: segment.text.trim() }));
}

export function secondsToLegacyMs(input: SubtitleSegmentSeconds[]): LegacySubtitleMs[] {
  return input.map(({ start, end, text, words }) => ({
    start: Math.round(start * 1000),
    end: Math.round(end * 1000),
    text,
    words: words?.map(({ word, start, end }) => ({
      word,
      start: Math.round(start * 1000),
      end: Math.round(end * 1000),
    })),
  }));
}

export function legacyMsToSeconds(input: LegacySubtitleMs[]): SubtitleSegment[] {
  return input.map(({ start, end, text, words }, index) => ({
    id: index + 1,
    start: start / 1000,
    end: end / 1000,
    text,
    words: words?.map(({ word, start, end }) => ({
      word,
      start: start / 1000,
      end: end / 1000,
    })),
  }));
}

export function mergeSubtitleSegments(
  first: SubtitleSegmentSeconds,
  next: SubtitleSegmentSeconds
): SubtitleSegmentSeconds {
  const words = [...(first.words ?? []), ...(next.words ?? [])];
  return {
    ...first,
    end: next.end,
    text: `${first.text} ${next.text}`,
    words: words.length > 0 ? words : undefined,
  };
}

export function isSourceDurationMs(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

export function durationFrames(durationMs: number, fps: number): number {
  return Math.ceil((durationMs * fps) / 1000);
}
