import { describe, expect, it } from 'vitest';

import {
  durationFrames,
  fromWhisperSeconds,
  legacyMsToSeconds,
  mergeSubtitleSegments,
  secondsToLegacyMs,
} from '@/features/video/lib/legacy-timing';
import { subtitlesToSrt, subtitlesToVtt } from '@/features/video/lib/subtitle-export';
import { cleanFillerWordsFromText } from '@/features/video/lib/silence-filler-detection';

const whisperFixture = [
  { start: 0.5, end: 2.3, text: ' Caption ', words: [{ word: 'Caption', start: 0.6, end: 0.9 }] },
];
const legacyFixture = [
  { start: 500, end: 2300, text: 'Caption', words: [{ word: 'Caption', start: 600, end: 900 }] },
];
const secondsFixture = [
  {
    id: 1,
    start: 0.5,
    end: 2.3,
    text: 'Caption',
    words: [{ word: 'Caption', start: 0.6, end: 0.9 }],
  },
];

describe('legacy subtitle timing boundaries', () => {
  it('converts Whisper segments and timed words from seconds to milliseconds', () => {
    expect(fromWhisperSeconds(whisperFixture)).toEqual(legacyFixture);
  });

  it('provides seconds for preview and render, including word timestamps', () => {
    expect(legacyMsToSeconds(legacyFixture)).toEqual(secondsFixture);
  });

  it('preserves edited text and timestamps when storing seconds back in milliseconds', () => {
    expect(secondsToLegacyMs(whisperFixture)).toEqual([{ ...legacyFixture[0], text: ' Caption ' }]);
  });

  it('exports the converted caption timestamps at millisecond precision', () => {
    const subtitles = legacyMsToSeconds(legacyFixture);

    expect(subtitlesToSrt(subtitles)).toBe('1\n00:00:00,500 --> 00:00:02,300\nCaption');
    expect(subtitlesToVtt(subtitles)).toBe('WEBVTT\n\n1\n00:00:00.500 --> 00:00:02.300\nCaption');
  });

  it('keeps the full 8-second source (240 frames at 30 fps), even with no captions', () => {
    expect(legacyMsToSeconds([])).toEqual([]);
    expect(durationFrames(8000, 30)).toBe(240);
  });

  it('includes the last partial frame of the source', () => {
    expect(durationFrames(8001, 30)).toBe(241);
  });

  it('keeps a neighbor’s aligned words after merging and saving alongside edited text', () => {
    const [edited, aligned] = legacyMsToSeconds([
      { start: 0, end: 500, text: 'Edited text' },
      legacyFixture[0],
    ]);

    const saved = secondsToLegacyMs([mergeSubtitleSegments(edited, aligned)]);

    expect(saved).toEqual([
      { start: 0, end: 2300, text: 'Edited text Caption', words: legacyFixture[0].words },
    ]);
    expect(legacyMsToSeconds(saved)).toEqual([
      { ...secondsFixture[0], start: 0, text: 'Edited text Caption' },
    ]);
  });

  it('does not display obsolete timed words after the subtitle text is cleaned', () => {
    const [cleaned, preserved] = cleanFillerWordsFromText([
      { ...secondsFixture[0], text: 'Um Caption' },
      secondsFixture[0],
    ]);

    expect(cleaned.text).toBe('Caption');
    expect(cleaned).not.toHaveProperty('words', secondsFixture[0].words);
    expect(preserved).toEqual(secondsFixture[0]);
  });
});
