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
    // Subtitle timing offset (delay in seconds)
    // Positive value delays subtitles (appears later)
    // Negative value advances subtitles (appears earlier)
    const SUBTITLE_OFFSET = 0.2; // 200ms delay to improve sync

    // Adjust current time with offset
    const adjustedTime = currentTime - SUBTITLE_OFFSET;

    // Debug: Log on first frame
    if (currentTime === 0 && subtitles.length > 0) {
      console.log('[useActiveSubtitle] Initial state:', {
        subtitleCount: subtitles.length,
        firstSubtitle: subtitles[0],
        lastSubtitle: subtitles[subtitles.length - 1],
        offset: SUBTITLE_OFFSET,
      });
    }

    // Find the segment that should be displayed at adjusted time
    const currentSegment = subtitles.find(
      (segment) => adjustedTime >= segment.start && adjustedTime < segment.end
    );

    if (!currentSegment) {
      // Debug: Log when no segment is found at specific times
      if (adjustedTime > 0 && adjustedTime < 5) {
        console.log('[useActiveSubtitle] No active segment at time:', {
          currentTime,
          adjustedTime,
        });
      }
      return {
        currentWord: '',
        currentSegment: null,
        isActive: false,
        wordIndex: -1,
      };
    }

    // Debug: Log when segment becomes active
    console.log('[useActiveSubtitle] Active segment:', {
      currentTime,
      adjustedTime,
      segment: {
        start: currentSegment.start,
        end: currentSegment.end,
        text: currentSegment.text,
      },
    });

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
