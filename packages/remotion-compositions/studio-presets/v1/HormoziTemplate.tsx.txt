import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Hormozi Caption Template
 *
 * High-energy style inspired by Alex Hormozi's viral videos:
 * - Bold uppercase text (Montserrat/Anton style)
 * - White text with yellow stroke
 * - Pop-in animation from bottom
 * - Dynamic scale and slight rotation
 * - Word-by-word reveal with emphasis
 */
export function HormoziTemplate({
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

  // Group words into chunks (max 5 words per line)
  const wordsPerChunk = 5;
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

  // Calculate which word is currently being revealed
  const wordsInChunk = currentChunk.length;
  const durationPerWord = durationPerChunk / wordsInChunk;
  const currentWordIndex = Math.floor(frameInChunk / durationPerWord);

  // Chunk entry animation
  const chunkEntryDuration = 10;
  const chunkOpacity = interpolate(frameInChunk, [0, chunkEntryDuration], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Exit animation - only fade in the last 4 frames for quick transition
  const exitDuration = 4;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  // Keep text visible most of the time, only fade at the very end
  const finalOpacity = Math.min(chunkOpacity, exitOpacity);

  // Accent colors for emphasis (every 2nd-3rd word gets highlighted)
  const accentColors = brandKit?.primaryColor
    ? [brandKit.primaryColor, brandKit.secondaryColor ?? '#FF6B6B', '#00D4FF']
    : ['#FFD700', '#FF6B6B', '#00D4FF'];

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 24px 400px 24px',
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
        }}
      >
        {currentChunk.map((word, wordIndex) => {
          // Calculate animation for this word
          const wordStartFrame = wordIndex * durationPerWord;
          const frameInWord = frameInChunk - wordStartFrame;

          const isRevealed = wordIndex <= currentWordIndex;
          const isCurrentWord = wordIndex === currentWordIndex;

          // Pop-in from bottom animation - faster pop for snappier feel
          const popDuration = 8;
          const translateY = interpolate(frameInWord, [0, popDuration], [40, 0], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          const wordOpacity = interpolate(frameInWord, [0, popDuration * 0.6], [0, 1], {
            extrapolateLeft: 'clamp',
            extrapolateRight: 'clamp',
          });

          // Scale pop effect
          const scale = interpolate(
            frameInWord,
            [0, popDuration * 0.5, popDuration],
            [0.5, 1.15, 1],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );

          // Slight rotation for energy
          const rotation = interpolate(
            frameInWord,
            [0, popDuration * 0.5, popDuration],
            [-3, 2, 0],
            { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
          );

          // Determine if this word should be accented (highlight important words)
          const shouldAccent = wordIndex % 3 === 1; // Every 3rd word gets accent
          const accentColor = accentColors[wordIndex % accentColors.length];

          // Only show revealed words
          if (!isRevealed) {
            return (
              <div key={`${word}-${wordIndex}-${currentChunkIndex}`} style={{ opacity: 0 }}>
                <p style={{ fontSize: '52px', margin: 0 }}>{word}</p>
              </div>
            );
          }

          return (
            <div
              key={`${word}-${wordIndex}-${currentChunkIndex}`}
              style={{
                transform: isCurrentWord
                  ? `translateY(${translateY}px) scale(${scale}) rotate(${rotation}deg)`
                  : 'translateY(0) scale(1) rotate(0deg)',
                opacity: isCurrentWord ? wordOpacity : 1,
              }}
            >
              <p
                style={{
                  color: shouldAccent ? accentColor : (brandKit?.textColor ?? '#FFFFFF'),
                  fontSize: '52px',
                  fontWeight: 900,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.1,
                  fontFamily: brandKit?.fontFamily ?? 'Montserrat, system-ui, sans-serif',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  // Stroke effect (uses primaryColor or default gold)
                  textShadow: `
                    -3px -3px 0 ${brandKit?.primaryColor ?? '#FFD700'},
                    3px -3px 0 ${brandKit?.primaryColor ?? '#FFD700'},
                    -3px 3px 0 ${brandKit?.primaryColor ?? '#FFD700'},
                    3px 3px 0 ${brandKit?.primaryColor ?? '#FFD700'},
                    0 0 20px ${brandKit?.primaryColor ? `${brandKit.primaryColor}80` : 'rgba(255, 215, 0, 0.5)'}
                  `,
                  WebkitTextStroke: `2px ${brandKit?.primaryColor ?? '#FFD700'}`,
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
