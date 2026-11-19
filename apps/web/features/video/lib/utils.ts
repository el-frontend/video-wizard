/**
 * Video Feature Utilities
 *
 * Helper functions for video processing
 */

/**
 * Formats seconds to MM:SS format
 */
export function formatTimestamp(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formats transcript segments for AI analysis
 */
export function formatTranscriptForAI(
  segments: Array<{
    start: number;
    end: number;
    text: string;
  }>
): string {
  return segments
    .map((segment) => {
      const start = formatTimestamp(segment.start);
      const end = formatTimestamp(segment.end);
      return `[${start} - ${end}] ${segment.text}`;
    })
    .join('\n\n');
}

/**
 * Validates video file
 */
export function validateVideoFile(file: File): { valid: boolean; error?: string } {
  // Validate file type
  if (!file.type.startsWith('video/')) {
    return { valid: false, error: 'Please select a valid video file' };
  }

  // Validate file size (max 2GB)
  const maxSize = 5 * 1024 * 1024 * 1024;
  if (file.size > maxSize) {
    return { valid: false, error: 'File is too large. Maximum 5GB' };
  }

  return { valid: true };
}

/**
 * Gets Python engine URL from environment
 */
export function getPythonEngineUrl(): string {
  return process.env.NEXT_PUBLIC_PYTHON_ENGINE_URL || 'http://localhost:8000';
}

export function getVideoSourceUrl(baseUrl: string, videoPath: string): string {
  if (typeof videoPath !== 'string') {
    throw new Error('Invalid video path');
  }
  const parts = videoPath.replace(/^\//, '').split('/');
  if (
    parts.length < 2 ||
    !['uploads', 'output'].includes(parts[0]) ||
    parts.some((part) => part === '' || part === '.' || part === '..') ||
    videoPath.includes('\\') ||
    videoPath.includes('\0')
  ) {
    throw new Error('Invalid video path');
  }

  return `${baseUrl.replace(/\/$/, '')}/${parts.map(encodeURIComponent).join('/')}`;
}
