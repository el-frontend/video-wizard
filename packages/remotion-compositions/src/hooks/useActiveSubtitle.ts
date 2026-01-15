import { useMemo } from 'react';
import type { SubtitleSegment } from '../types';

interface ActiveSubtitleResult {
  currentWord: string;
  currentSegment: SubtitleSegment | null;
  isActive: boolean;
  wordIndex: number;
}

/**
 * Hook: useActiveSubtitle
 * 
 * Calculates which word should be displayed at the current time
 * 
 * Logic Flow:
 * 1. Find active segment based on start/end timestamps
 * 2. If segment has word-level timing, find active word
 * 3. Otherwise, display entire segment text
 * 
 * @param subtitles - Array of subtitle segments with timing
 * @param currentTime - Current playback time in seconds
 * @returns Active word and segment information
 */
export function useActiveSubtitle(
  subtitles: SubtitleSegment[],
  currentTime: number
): ActiveSubtitleResult {
  return useMemo(() => {
    // Find the segment that should be displayed at current time
    const currentSegment = subtitles.find(
      (segment) => currentTime >= segment.start && currentTime < segment.end
    );

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
        (word) => currentTime >= word.start && currentTime < word.end
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
