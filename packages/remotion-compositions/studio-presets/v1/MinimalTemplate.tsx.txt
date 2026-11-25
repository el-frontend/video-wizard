import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Minimal Caption Template
 *
 * Ultra-clean design with minimal styling
 * Perfect for professional or educational content
 * Shows 3-4 words per chunk for better readability
 */
export function MinimalTemplate({
  currentWord,
  currentSegment,
  isActive,
  brandKit,
}: CaptionTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Split all words in the segment
  const allWords = currentSegment.text.split(' ');

  // Group words into chunks (3-4 words per line)
  const wordsPerChunk = 4;
  const chunks: string[][] = [];
  for (let i = 0; i < allWords.length; i += wordsPerChunk) {
    chunks.push(allWords.slice(i, i + wordsPerChunk));
  }

  // Calculate segment timing
  const segmentStartFrame = currentSegment.start * fps;
  const segmentEndFrame = currentSegment.end * fps;
  const frameInSegment = frame - segmentStartFrame;
  const segmentDuration = segmentEndFrame - segmentStartFrame;

  // Calculate which chunk to show based on time
  const durationPerChunk = segmentDuration / chunks.length;
  const currentChunkIndex = Math.min(
    Math.floor(frameInSegment / durationPerChunk),
    chunks.length - 1
  );
  const currentChunk = chunks[Math.max(0, currentChunkIndex)];

  // Calculate frame within current chunk for animation
  const chunkStartFrame = currentChunkIndex * durationPerChunk;
  const frameInChunk = frameInSegment - chunkStartFrame;

  // Gentle fade-in (first 12 frames)
  const entryDuration = 12;
  const opacity = interpolate(frameInChunk, [0, entryDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Gentle fade-out (last 10 frames)
  const exitDuration = 10;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(opacity, exitOpacity);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 60px 400px',
      }}
    >
      <div style={{ opacity: finalOpacity }}>
        <p
          style={{
            color: brandKit?.textColor ?? '#FFFFFF',
            fontSize: '44px',
            fontWeight: 500,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
            fontFamily: brandKit?.fontFamily ?? 'Helvetica Neue, sans-serif',
            textShadow: '0 2px 8px rgba(0, 0, 0, 0.5)',
          }}
        >
          {currentChunk.join(' ')}
        </p>
      </div>
    </AbsoluteFill>
  );
}
