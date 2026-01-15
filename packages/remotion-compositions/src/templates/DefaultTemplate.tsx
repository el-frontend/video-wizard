import { AbsoluteFill, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Default Caption Template
 * 
 * Simple, clean text at the bottom of the screen
 * Professional appearance with subtle animations
 */
export function DefaultTemplate({
  currentWord,
  currentSegment,
  isActive,
}: CaptionTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Subtle fade-in animation
  const opacity = spring({
    frame,
    fps,
    from: 0,
    to: 1,
    durationInFrames: 10,
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 40px 100px',
      }}
    >
      <div
        style={{
          opacity,
          backgroundColor: 'rgba(0, 0, 0, 0.7)',
          padding: '20px 40px',
          borderRadius: '8px',
          maxWidth: '90%',
        }}
      >
        <p
          style={{
            color: '#FFFFFF',
            fontSize: '48px',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.4,
            fontFamily: 'Inter, system-ui, sans-serif',
          }}
        >
          {currentSegment.text}
        </p>
      </div>
    </AbsoluteFill>
  );
}
