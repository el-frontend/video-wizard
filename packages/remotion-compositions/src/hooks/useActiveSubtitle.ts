import { useMemo } from 'react';
import type { SubtitleSegment } from '../types';

interface ActiveSubtitleResult {
  currentWord: string;
  currentSegment: SubtitleSegment | null;
  isActive: boolean;
  wordIndex: number;
}

/**
 * Binary-searches a sorted array of subtitle segments for the one active at `time`.
 * Assumes segments are ordered by `start` and do not overlap.
 * O(log n) vs the previous O(n) linear scan.
 */
function findActiveSegment(
  subtitles: SubtitleSegment[],
  time: number
): SubtitleSegment | undefined {
  let lo = 0;
  let hi = subtitles.length - 1;

  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const seg = subtitles[mid];

    if (time < seg.start) {
      hi = mid - 1;
    } else if (time >= seg.end) {
      lo = mid + 1;
    } else {
      return seg;
    }
  }

  return undefined;
}

/**
 * Hook: useActiveSubtitle
 *
 * Calculates which word should be displayed at the current time.
 *
 * Logic Flow:
 * 1. Find active segment using a binary search on sorted subtitle segments
 * 2. If segment has word-level timing, find the active word
 * 3. Otherwise, display entire segment text
 *
 * @param subtitles - Array of subtitle segments sorted by start time
 * @param currentTime - Current playback time in seconds
 * @returns Active word and segment information
 */
export function useActiveSubtitle(
  subtitles: SubtitleSegment[],
  currentTime: number
): ActiveSubtitleResult {
  return useMemo(() => {
    // Subtitle timing offset (delay in seconds)
    // Positive value delays subtitles (appears later)
    // Negative value advances subtitles (appears earlier)
    const SUBTITLE_OFFSET = 0.2; // 200ms delay to improve sync

    // Adjust current time with offset
    const adjustedTime = currentTime - SUBTITLE_OFFSET;

    // Find the segment that should be displayed at adjusted time
    const currentSegment = findActiveSegment(subtitles, adjustedTime);

    if (!currentSegment) {
      return {
        currentWord: '',
        currentSegment: null,
        isActive: false,
        wordIndex: -1,
      };
    }

    // If segment has word-level timing, find the active word
    if (currentSegment.words && currentSegment.words.length > 0) {
      const activeWordIndex = currentSegment.words.findIndex(
        (word) => adjustedTime >= word.start && adjustedTime < word.end
      );

      if (activeWordIndex !== -1) {
        return {
          currentWord: currentSegment.words[activeWordIndex].word,
          currentSegment,
          isActive: true,
          wordIndex: activeWordIndex,
        };
      }
    }

    // Fallback: display entire segment text
    return {
      currentWord: currentSegment.text,
      currentSegment,
      isActive: true,
      wordIndex: 0,
    };
  }, [subtitles, currentTime]);
}
