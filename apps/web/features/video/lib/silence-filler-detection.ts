/**
 * Silence/Filler Detection Utility
 *
 * Pure utility functions for detecting silences, filler words, and
 * short noise segments in subtitle arrays. No React, no side effects.
 *
 * Time handling:
 * - Subtitle Generator stores times in MILLISECONDS
 * - Video Wizard stores times in SECONDS
 * - Use `timeScale` parameter to normalize:
 *   - timeScale=1 when subtitles are in ms (default)
 *   - timeScale=1000 when subtitles are in seconds
 */

import type { DetectedIssue, DetectionResult, SilenceFillerConfig } from '../types/silence-filler';

interface SubtitleInput {
  start: number;
  end: number;
  text: string;
}

const DEFAULT_CONFIG: SilenceFillerConfig = {
  silenceThresholdMs: 1000,
  minSegmentDurationMs: 300,
  fillerWords: [
    'um',
    'uh',
    'eh',
    'ah',
    'like',
    'you know',
    'basically',
    'actually',
    'literally',
    'right',
    'so',
    'well',
    'I mean',
  ],
  enableSilenceDetection: true,
  enableFillerDetection: true,
  enableShortSegmentDetection: true,
};

/**
 * Detect silences (gaps between consecutive segments)
 */
function detectSilences(
  subtitles: SubtitleInput[],
  thresholdMs: number,
  timeScale: number
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const threshold = thresholdMs / timeScale;

  for (let i = 0; i < subtitles.length - 1; i++) {
    const current = subtitles[i];
    const next = subtitles[i + 1];
    const gap = next.start - current.end;

    if (gap > threshold) {
      const durationMs = gap * timeScale;
      issues.push({
        type: 'silence',
        segmentIndex: -1,
        start: current.end,
        end: next.start,
        duration: gap,
        description: `${(durationMs / 1000).toFixed(1)}s silence between segments ${i + 1} and ${i + 2}`,
        gapAfterIndex: i,
      });
    }
  }

  return issues;
}

/**
 * Detect filler words in segment text using regex
 */
function detectFillerWords(subtitles: SubtitleInput[], fillerWords: string[]): DetectedIssue[] {
  const issues: DetectedIssue[] = [];

  // Separate single-word and multi-word fillers
  const singleWords = fillerWords.filter((w) => !w.includes(' '));
  const multiWords = fillerWords.filter((w) => w.includes(' '));

  // Build word-boundary regex for single words
  const singleWordPattern =
    singleWords.length > 0 ? new RegExp(`\\b(${singleWords.join('|')})\\b`, 'gi') : null;

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const text = subtitle.text.toLowerCase();
    const matched: string[] = [];

    // Check single-word fillers
    if (singleWordPattern) {
      singleWordPattern.lastIndex = 0;
      let match = singleWordPattern.exec(text);
      while (match) {
        if (!matched.includes(match[1].toLowerCase())) {
          matched.push(match[1].toLowerCase());
        }
        match = singleWordPattern.exec(text);
      }
    }

    // Check multi-word fillers
    for (const phrase of multiWords) {
      if (text.includes(phrase.toLowerCase()) && !matched.includes(phrase.toLowerCase())) {
        matched.push(phrase.toLowerCase());
      }
    }

    if (matched.length > 0) {
      // Check if the ENTIRE segment is just filler(s)
      const cleanedText = text
        .replace(singleWordPattern ?? /(?:)/, '')
        .replace(/\s+/g, ' ')
        .trim();

      let cleanedFromMulti = cleanedText;
      for (const phrase of multiWords) {
        cleanedFromMulti = cleanedFromMulti.replace(new RegExp(phrase, 'gi'), '').trim();
      }

      const isEntirelyFiller = cleanedFromMulti.length === 0;

      issues.push({
        type: 'filler',
        segmentIndex: i,
        start: subtitle.start,
        end: subtitle.end,
        duration: subtitle.end - subtitle.start,
        description: isEntirelyFiller
          ? `Segment "${subtitle.text}" is entirely filler`
          : `Contains filler: ${matched.join(', ')}`,
        matchedFillers: matched,
      });
    }
  }

  return issues;
}

/**
 * Detect very short segments (likely noise)
 */
function detectShortSegments(
  subtitles: SubtitleInput[],
  minDurationMs: number,
  timeScale: number
): DetectedIssue[] {
  const issues: DetectedIssue[] = [];
  const minDuration = minDurationMs / timeScale;

  for (let i = 0; i < subtitles.length; i++) {
    const subtitle = subtitles[i];
    const duration = subtitle.end - subtitle.start;

    if (duration < minDuration && duration > 0) {
      issues.push({
        type: 'short-segment',
        segmentIndex: i,
        start: subtitle.start,
        end: subtitle.end,
        duration,
        description: `Short segment (${((duration * timeScale) / 1000).toFixed(2)}s): "${subtitle.text}"`,
      });
    }
  }

  return issues;
}

/**
 * Run all enabled detectors on the subtitle array
 *
 * @param subtitles - Array of subtitle segments
 * @param config - Detection configuration (merged with defaults)
 * @param timeScale - Time unit multiplier: 1 for ms, 1000 for seconds
 */
export function detectIssues(
  subtitles: SubtitleInput[],
  config?: Partial<SilenceFillerConfig>,
  timeScale: number = 1
): DetectionResult {
  const mergedConfig: SilenceFillerConfig = { ...DEFAULT_CONFIG, ...config };
  const issues: DetectedIssue[] = [];

  if (mergedConfig.enableSilenceDetection) {
    issues.push(...detectSilences(subtitles, mergedConfig.silenceThresholdMs, timeScale));
  }

  if (mergedConfig.enableFillerDetection) {
    issues.push(...detectFillerWords(subtitles, mergedConfig.fillerWords));
  }

  if (mergedConfig.enableShortSegmentDetection) {
    issues.push(...detectShortSegments(subtitles, mergedConfig.minSegmentDurationMs, timeScale));
  }

  // Sort by start time
  issues.sort((a, b) => a.start - b.start);

  const silences = issues.filter((i) => i.type === 'silence');
  const fillers = issues.filter((i) => i.type === 'filler');
  const shorts = issues.filter((i) => i.type === 'short-segment');

  return {
    issues,
    silenceCount: silences.length,
    fillerCount: fillers.length,
    shortSegmentCount: shorts.length,
    totalSilenceDuration: silences.reduce((sum, i) => sum + i.duration, 0),
    totalFillerDuration: fillers.reduce((sum, i) => sum + i.duration, 0),
  };
}

/**
 * Remove detected issues by filtering out affected segments
 *
 * - Filler segments with `segmentIndex >= 0` are removed entirely
 * - Short segments with `segmentIndex >= 0` are removed entirely
 * - Silences (gaps) don't have segments to remove
 */
export function removeDetectedIssues(
  subtitles: SubtitleInput[],
  issues: DetectedIssue[]
): SubtitleInput[] {
  const indicesToRemove = new Set<number>();

  for (const issue of issues) {
    if (issue.segmentIndex >= 0 && issue.type !== 'silence') {
      indicesToRemove.add(issue.segmentIndex);
    }
  }

  return subtitles.filter((_, index) => !indicesToRemove.has(index));
}

/**
 * Clean filler words from segment text without removing segments
 *
 * Strips matched filler words from text. If the resulting text is empty,
 * the segment is removed entirely.
 */
export function cleanFillerWordsFromText(
  subtitles: SubtitleInput[],
  fillerWords?: string[]
): SubtitleInput[] {
  const words = fillerWords ?? DEFAULT_CONFIG.fillerWords;
  const singleWords = words.filter((w) => !w.includes(' '));
  const multiWords = words.filter((w) => w.includes(' '));

  const singleWordPattern =
    singleWords.length > 0 ? new RegExp(`\\b(${singleWords.join('|')})\\b`, 'gi') : null;

  return subtitles
    .map((subtitle) => {
      let cleanedText = subtitle.text;

      // Remove multi-word fillers first (longer patterns)
      for (const phrase of multiWords) {
        cleanedText = cleanedText.replace(new RegExp(`\\b${phrase}\\b`, 'gi'), '');
      }

      // Remove single-word fillers
      if (singleWordPattern) {
        cleanedText = cleanedText.replace(singleWordPattern, '');
      }

      // Normalize whitespace
      cleanedText = cleanedText.replace(/\s+/g, ' ').trim();

      // Remove leading/trailing punctuation artifacts
      cleanedText = cleanedText.replace(/^[,.\s]+|[,.\s]+$/g, '').trim();

      return { ...subtitle, text: cleanedText };
    })
    .filter((subtitle) => subtitle.text.length > 0);
}

/**
 * Get the default filler words list
 */
export function getDefaultFillerWords(): string[] {
  return [...DEFAULT_CONFIG.fillerWords];
}
