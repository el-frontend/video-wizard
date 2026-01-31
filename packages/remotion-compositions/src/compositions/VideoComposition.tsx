import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from 'remotion';
import type { VideoCompositionProps } from '../types';
import { CaptionOverlay } from './CaptionOverlay';

/**
 * Video Composition Component
 * 
 * Main composition that renders:
 * 1. Video background layer (source video)
 * 2. Caption overlay layer (synchronized subtitles)
 */
export const VideoComposition: React.FC<VideoCompositionProps> = ({
  videoUrl,
  subtitles,
  template,
  language = 'en',
  backgroundColor = '#000000',
}) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate current time in seconds
  const currentTime = frame / fps;

  return (
    <AbsoluteFill style={{ backgroundColor }}>
      {/* Layer 1: Video Background */}
      <Sequence from={0}>
        <AbsoluteFill>
          <OffthreadVideo
            src={videoUrl}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'cover',
            }}
          />
        </AbsoluteFill>
      </Sequence>

      {/* Layer 2: Caption Overlay */}
      <Sequence from={0}>
        <CaptionOverlay
          subtitles={subtitles}
          currentTime={currentTime}
          template={template}
          language={language}
        />
      </Sequence>
    </AbsoluteFill>
  );
};
