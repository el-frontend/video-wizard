import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Modern Caption Template
 *
 * Contemporary design with gradient accents
 * Smooth animations and modern typography
 * Shows 3-4 words per chunk for better readability
 */
export function ModernTemplate({
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

  // Slide up animation for each chunk
  const entryDuration = 14;
  const slideY = interpolate(frameInChunk, [0, entryDuration], [30, 0], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade in
  const opacity = interpolate(frameInChunk, [0, entryDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Fade out (last 10 frames)
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
        padding: '0 40px 400px',
      }}
    >
      <div
        style={{
          transform: `translateY(${slideY}px)`,
          opacity: finalOpacity,
          background: brandKit?.primaryColor
            ? `linear-gradient(135deg, ${brandKit.primaryColor}E6 0%, ${brandKit.secondaryColor ?? brandKit.primaryColor}E6 100%)`
            : 'linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(168, 85, 247, 0.9) 100%)',
          padding: '24px 48px',
          borderRadius: '12px',
          maxWidth: '88%',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <p
          style={{
            color: brandKit?.textColor ?? '#FFFFFF',
            fontSize: '52px',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.3,
            fontFamily: brandKit?.fontFamily ?? 'system-ui, -apple-system, sans-serif',
            letterSpacing: '-0.5px',
          }}
        >
          {currentChunk.join(' ')}
        </p>
      </div>
    </AbsoluteFill>
  );
}
