import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Viral Caption Template
 * 
 * High-impact design for viral shorts:
 * - Large text at bottom (Instagram/TikTok style)
 * - Yellow highlight background
 * - Words appear one by one and stay visible
 * - Single line layout
 */
export function ViralTemplate({
  currentWord,
  currentSegment,
  isActive,
}: CaptionTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Split all words in the segment
  const allWords = currentSegment.text.split(' ');
  
  // Group words into chunks (3-4 words per line to fit in screen)
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
  const currentChunk = chunks[currentChunkIndex];
  
  // Calculate frame within current chunk for animation
  const chunkStartFrame = currentChunkIndex * durationPerChunk;
  const frameInChunk = frameInSegment - chunkStartFrame;
  
  // Smooth entry animation for each chunk (first 8 frames)
  const entryDuration = 8;
  const opacity = interpolate(
    frameInChunk,
    [0, entryDuration],
    [0, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const scale = interpolate(
    frameInChunk,
    [0, entryDuration],
    [0.9, 1],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  // Smooth exit animation (last 6 frames of chunk)
  const exitDuration = 6;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    {
      extrapolateLeft: 'clamp',
      extrapolateRight: 'clamp',
    }
  );
  
  const finalOpacity = Math.min(opacity, exitOpacity);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 20px 180px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: '12px',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '95%',
          opacity: finalOpacity,
          transform: `scale(${scale})`,
        }}
      >
        {currentChunk.map((word, wordIndex) => (
          <div
            key={`${word}-${wordIndex}-${currentChunkIndex}`}
          >
            <div
              style={{
                backgroundColor: '#FFD700',
                padding: '8px 20px',
                borderRadius: '8px',
                boxShadow: '0 2px 8px rgba(0, 0, 0, 0.3)',
                whiteSpace: 'nowrap',
              }}
            >
              <p
                style={{
                  color: '#000000',
                  fontSize: '42px',
                  fontWeight: 900,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.1,
                  fontFamily: 'Impact, Arial Black, sans-serif',
                  textTransform: 'uppercase',
                  letterSpacing: '0.5px',
                }}
              >
                {word}
              </p>
            </div>
          </div>
        ))}
      </div>
    </AbsoluteFill>
  );
}
