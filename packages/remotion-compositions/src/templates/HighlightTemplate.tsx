import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Highlight Caption Template
 *
 * White text with purple background that highlights word-by-word
 * The background "sweeps" across each word as time progresses
 * Shows 3-4 words per chunk for better readability
 */
export function HighlightTemplate({
  currentWord,
  currentSegment,
  isActive,
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

  // Calculate frame within current chunk
  const chunkStartFrame = currentChunkIndex * durationPerChunk;
  const frameInChunk = frameInSegment - chunkStartFrame;

  // Calculate which word should be highlighted (progress through chunk)
  const wordsInChunk = currentChunk.length;
  const durationPerWord = durationPerChunk / wordsInChunk;
  const currentWordIndex = Math.floor(frameInChunk / durationPerWord);

  // Entry animation for the whole chunk (first 10 frames)
  const entryDuration = 10;
  const chunkOpacity = interpolate(
    frameInChunk,
    [0, entryDuration],
    [0, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const chunkScale = interpolate(
    frameInChunk,
    [0, entryDuration],
    [0.95, 1],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Exit animation (last 8 frames)
  const exitDuration = 8;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(chunkOpacity, exitOpacity);

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 20px 400px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: '10px',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '95%',
          opacity: finalOpacity,
          transform: `scale(${chunkScale})`,
        }}
      >
        {currentChunk.map((word, wordIndex) => {
          // Calculate highlight progress for this word
          const wordStartFrame = wordIndex * durationPerWord;
          const frameInWord = frameInChunk - wordStartFrame;

          // Highlight animation for individual word (quick sweep)
          const highlightDuration = Math.min(durationPerWord * 0.6, 8);
          const highlightProgress = interpolate(
            frameInWord,
            [0, highlightDuration],
            [0, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );

          const isHighlighted = wordIndex <= currentWordIndex;
          const isCurrentWord = wordIndex === currentWordIndex;

          // Background width animation (clip effect)
          const bgWidth = isCurrentWord
            ? `${highlightProgress * 100}%`
            : isHighlighted
              ? '100%'
              : '0%';

          return (
            <div
              key={`${word}-${wordIndex}-${currentChunkIndex}`}
              style={{
                position: 'relative',
                padding: '8px 16px',
              }}
            >
              {/* Background layer (purple highlight) */}
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  height: '100%',
                  width: bgWidth,
                  backgroundColor: '#8B5CF6',
                  borderRadius: '6px',
                  transition: 'none',
                  overflow: 'hidden',
                }}
              />
              {/* Text layer */}
              <p
                style={{
                  position: 'relative',
                  color: '#FFFFFF',
                  fontSize: '46px',
                  fontWeight: 800,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.1,
                  fontFamily: 'system-ui, -apple-system, sans-serif',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  textShadow: '0 2px 4px rgba(0, 0, 0, 0.3)',
                }}
              >
                {word}
              </p>
            </div>
          );
        })}
      </div>
    </AbsoluteFill>
  );
}
