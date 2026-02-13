import { AbsoluteFill, interpolate, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * MrBeast Caption Template
 *
 * Comic-style captions inspired by MrBeast's viral videos:
 * - Bold comic/playful font style
 * - White text with thick black stroke
 * - Key words highlighted in green
 * - Pop animation on appearance
 * - Clean single-line display
 */
export function MrBeastTemplate({
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

  // Calculate which word is active
  const wordsInChunk = currentChunk.length;
  const durationPerWord = durationPerChunk / wordsInChunk;
  const currentWordIndex = Math.floor(frameInChunk / durationPerWord);

  // Chunk pop-in animation
  const popDuration = 12;
  const chunkScale = interpolate(frameInChunk, [0, popDuration * 0.4, popDuration], [0.3, 1.1, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  const chunkOpacity = interpolate(frameInChunk, [0, popDuration * 0.5], [0, 1], {
    extrapolateLeft: 'clamp',
    extrapolateRight: 'clamp',
  });

  // Exit animation
  const exitDuration = 8;
  const exitOpacity = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const exitScale = interpolate(
    frameInChunk,
    [durationPerChunk - exitDuration, durationPerChunk],
    [1, 0.8],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const finalOpacity = Math.min(chunkOpacity, exitOpacity);
  const finalScale = Math.min(chunkScale, exitScale);

  // MrBeast green color for highlights (brandKit primary overrides)
  const mrBeastGreen = brandKit?.primaryColor ?? '#00FF00';

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 20px 450px 20px',
      }}
    >
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          flexWrap: 'nowrap',
          gap: '16px',
          justifyContent: 'center',
          alignItems: 'center',
          maxWidth: '85%',
          opacity: finalOpacity,
          transform: `scale(${finalScale})`,
        }}
      >
        {currentChunk.map((word, wordIndex) => {
          // Calculate word-specific animation
          const wordStartFrame = wordIndex * durationPerWord;
          const frameInWord = frameInChunk - wordStartFrame;

          const isCurrentWord = wordIndex === currentWordIndex;

          // Individual word pop effect
          const wordPopDuration = 10;
          const wordScale = isCurrentWord
            ? interpolate(frameInWord, [0, wordPopDuration * 0.4, wordPopDuration], [1, 1.15, 1], {
                extrapolateLeft: 'clamp',
                extrapolateRight: 'clamp',
              })
            : 1;

          // Determine if word should be green (highlight keywords)
          // Highlight every 2nd word or words that are longer (likely important)
          const isKeyword = wordIndex % 2 === 1 || word.length > 5;
          const textColor = isKeyword ? mrBeastGreen : (brandKit?.textColor ?? '#FFFFFF');

          return (
            <div
              key={`${word}-${wordIndex}-${currentChunkIndex}`}
              style={{
                transform: `scale(${wordScale})`,
              }}
            >
              <p
                style={{
                  color: textColor,
                  fontSize: '56px',
                  fontWeight: 900,
                  textAlign: 'center',
                  margin: 0,
                  lineHeight: 1.1,
                  // Comic-style font
                  fontFamily:
                    brandKit?.fontFamily ?? 'Impact, Bangers, Comic Sans MS, cursive, sans-serif',
                  textTransform: 'uppercase',
                  whiteSpace: 'nowrap',
                  letterSpacing: '1px',
                  // Thick black stroke - MrBeast signature style
                  textShadow: `
                    -4px -4px 0 #000,
                    4px -4px 0 #000,
                    -4px 4px 0 #000,
                    4px 4px 0 #000,
                    -4px 0 0 #000,
                    4px 0 0 #000,
                    0 -4px 0 #000,
                    0 4px 0 #000,
                    0 6px 12px rgba(0, 0, 0, 0.6)
                  `,
                  WebkitTextStroke: '3px #000000',
                  paintOrder: 'stroke fill',
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
