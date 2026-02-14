/**
 * Subtitle Export Utilities
 *
 * Converts SubtitleSegment[] to SRT and VTT formats for download.
 *
 * IMPORTANT: Subtitles use SECONDS (not milliseconds)
 * - Input: start/end in seconds (e.g., 1.5 = 1.5 seconds)
 * - Output: SRT/VTT standard timestamp format
 */

import type { SubtitleSegment } from '../types';

/**
 * Formats seconds to SRT timestamp format: HH:MM:SS,mmm
 * @param seconds - Time in seconds (e.g., 1.5, 65.37)
 */
function formatSrtTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Formats seconds to VTT timestamp format: HH:MM:SS.mmm
 * @param seconds - Time in seconds (e.g., 1.5, 65.37)
 */
function formatVttTimestamp(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const secs = totalSeconds % 60;
  const milliseconds = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`;
}

/**
 * Converts subtitles to SRT format string
 *
 * SRT format:
 * 1
 * 00:00:00,500 --> 00:00:02,300
 * Hello world
 *
 * 2
 * 00:00:02,400 --> 00:00:05,100
 * This is a subtitle
 */
export function subtitlesToSrt(subtitles: SubtitleSegment[]): string {
  return subtitles
    .map((segment, index) => {
      const startTime = formatSrtTimestamp(segment.start);
      const endTime = formatSrtTimestamp(segment.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}`;
    })
    .join('\n\n');
}

/**
 * Converts subtitles to WebVTT format string
 *
 * VTT format:
 * WEBVTT
 *
 * 1
 * 00:00:00.500 --> 00:00:02.300
 * Hello world
 *
 * 2
 * 00:00:02.400 --> 00:00:05.100
 * This is a subtitle
 */
export function subtitlesToVtt(subtitles: SubtitleSegment[]): string {
  const cues = subtitles
    .map((segment, index) => {
      const startTime = formatVttTimestamp(segment.start);
      const endTime = formatVttTimestamp(segment.end);
      return `${index + 1}\n${startTime} --> ${endTime}\n${segment.text}`;
    })
    .join('\n\n');

  return `WEBVTT\n\n${cues}`;
}

/**
 * Triggers a file download in the browser
 */
function downloadFile(content: string, filename: string, mimeType: string): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();

  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Downloads subtitles as an SRT file
 */
export function downloadSrt(subtitles: SubtitleSegment[], filename = 'subtitles'): void {
  const srtContent = subtitlesToSrt(subtitles);
  downloadFile(srtContent, `${filename}.srt`, 'text/srt');
}

/**
 * Downloads subtitles as a VTT file
 */
export function downloadVtt(subtitles: SubtitleSegment[], filename = 'subtitles'): void {
  const vttContent = subtitlesToVtt(subtitles);
  downloadFile(vttContent, `${filename}.vtt`, 'text/vtt');
}
