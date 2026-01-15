import { AbsoluteFill, interpolate, spring, useCurrentFrame, useVideoConfig } from 'remotion';
import type { CaptionTemplateProps } from '../types';

/**
 * Modern Caption Template
 * 
 * Contemporary design with gradient accents
 * Smooth animations and modern typography
 */
export function ModernTemplate({
  currentWord,
  currentSegment,
  isActive,
}: CaptionTemplateProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  if (!isActive || !currentSegment) return null;

  // Slide up animation
  const slideY = spring({
    frame,
    fps,
    from: 50,
    to: 0,
    config: {
      damping: 100,
    },
  });

  // Fade in
  const opacity = interpolate(frame, [0, 15], [0, 1], {
    extrapolateRight: 'clamp',
  });

  return (
    <AbsoluteFill
      style={{
        justifyContent: 'flex-end',
        alignItems: 'center',
        padding: '0 40px 140px',
      }}
    >
      <div
        style={{
          transform: `translateY(${slideY}px)`,
          opacity,
          background: 'linear-gradient(135deg, rgba(99, 102, 241, 0.9) 0%, rgba(168, 85, 247, 0.9) 100%)',
          padding: '24px 48px',
          borderRadius: '12px',
          maxWidth: '88%',
          boxShadow: '0 4px 24px rgba(0, 0, 0, 0.3)',
          border: '2px solid rgba(255, 255, 255, 0.2)',
        }}
      >
        <p
          style={{
            color: '#FFFFFF',
            fontSize: '52px',
            fontWeight: 700,
            textAlign: 'center',
            margin: 0,
            lineHeight: 1.3,
            fontFamily: 'system-ui, -apple-system, sans-serif',
            letterSpacing: '-0.5px',
          }}
        >
          {currentSegment.text}
        </p>
      </div>
    </AbsoluteFill>
  );
}
