import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Minimal Caption Template
 * 
 * Ultra-clean design with minimal styling
 * Perfect for professional or educational content
 */
export function MinimalTemplate({
  currentWord,
  currentSegment,
  isActive,
}: CaptionTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Gentle fade-in
  const opacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    durationInFrames: 8,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 60px 120px',
      }}
    >
      <div style={{ opacity }}>
        <p
          style={{
            color: '#FFFFFF',
            fontSize: '44px',
            fontWeight: 500,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.5,
            fontFamily: 'Helvetica Neue, sans-serif',
            maxWidth: '85%',
          }}
        >
          {currentSegment.text}
        </p>
      </div>
    </AbsoluteFill>
  );
}
