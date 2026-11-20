import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Color Shift Caption Template
 *
 * Yellow text that shifts to green word-by-word as time progresses
 * Creates a dynamic "reading along" effect
 * Shows 3-4 words per chunk for better readability
 */
export function ColorShiftTemplate({
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

  // Calculate frame within current chunk
  const chunkStartFrame = currentChunkIndex * durationPerChunk;
  const frameInChunk = frameInSegment - chunkStartFrame;

  // Calculate which word should be colored (progress through chunk)
  const wordsInChunk = currentChunk.length;
  const durationPerWord = durationPerChunk / wordsInChunk;
  const currentWordIndex = Math.floor(frameInChunk / durationPerWord);

  // Entry animation for the whole chunk (first 12 frames)
  const entryDuration = 12;
  const chunkOpacity = interpolate(frameInChunk, [0, entryDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const chunkScale = interpolate(frameInChunk, [0, entryDuration], [0.9, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Exit animation (last 10 frames)
  const exitDuration = 10;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(chunkOpacity, exitOpacity);

  // Colors (brandKit overrides: primary → start color, secondary → end color)
  const yellowColor = brandKit?.primaryColor ?? '#FACC15'; // Tailwind yellow-400
  const greenColor = brandKit?.secondaryColor ?? '#22C55E'; // Tailwind green-500

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
          gap: '14px',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '95%',
          opacity: finalOpacity,
          transform: `scale(${chunkScale})`,
        }}
      >
        {currentChunk.map((word, wordIndex) => {
          // Calculate color transition for this word
          const wordStartFrame = wordIndex * durationPerWord;
          const frameInWord = frameInChunk - wordStartFrame;

          // Color transition animation
          const colorTransitionDuration = Math.min(durationPerWord * 0.5, 6);
          const colorProgress = interpolate(frameInWord, [0, colorTransitionDuration], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          const isColored = wordIndex < currentWordIndex;
          const isCurrentWord = wordIndex === currentWordIndex;

          // Determine the color
          let wordColor = yellowColor;
          if (isColored) {
            wordColor = greenColor;
          } else if (isCurrentWord) {
            // Interpolate between yellow and green
            wordColor = interpolateColor(yellowColor, greenColor, colorProgress);
          }

          // Scale pop effect for current word
          const wordScale = isCurrentWord
            ? interpolate(
                frameInWord,
                [0, colorTransitionDuration / 2, colorTransitionDuration],
                [1, 1.08, 1],
                { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
              )
            : 1;

          return (
            <div
              key={`${word}-${wordIndex}-${currentChunkIndex}`}
              style={{
                transform: `scale(${wordScale})`,
              }}
            >
              <p
                style={{
                  color: wordColor,
                  fontSize: '48px',
                  fontWeight: 900,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.1,
                  fontFamily: brandKit?.fontFamily ?? 'Impact, Arial Black, sans-serif',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  textShadow: `
                    -2px -2px 0 #000,
                    2px -2px 0 #000,
                    -2px 2px 0 #000,
                    2px 2px 0 #000,
                    0 4px 8px rgba(0, 0, 0, 0.5)
                  `,
                  WebkitTextStroke: '1px #000',
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

/**
 * Helper function to interpolate between two hex colors
 */
function interpolateColor(color1: string, color2: string, progress: number): string {
  const hex1 = color1.replace('#', '');
  const hex2 = color2.replace('#', '');

  const r1 = parseInt(hex1.substring(0, 2), 16);
  const g1 = parseInt(hex1.substring(2, 4), 16);
  const b1 = parseInt(hex1.substring(4, 6), 16);

  const r2 = parseInt(hex2.substring(0, 2), 16);
  const g2 = parseInt(hex2.substring(2, 4), 16);
  const b2 = parseInt(hex2.substring(4, 6), 16);

  const r = Math.round(r1 + (r2 - r1) * progress);
  const g = Math.round(g1 + (g2 - g1) * progress);
  const b = Math.round(b1 + (b2 - b1) * progress);

  return `rgb(${r}, ${g}, ${b})`;
}
