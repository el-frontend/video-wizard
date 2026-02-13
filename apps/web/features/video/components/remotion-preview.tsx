'use client';

import { Player } from '@remotion/player';
import { VideoComposition } from '@workspace/remotion-compositions';
import { useMemo } from 'react';
import type { AspectRatio, SubtitleSegment, SubtitleTemplate } from '../types';
import type { BrandKit } from '../types/brand-kit';
import { getDimensions } from '../lib/aspect-ratios';

interface RemotionPreviewProps {
  videoUrl: string;
  subtitles: SubtitleSegment[];
  template: SubtitleTemplate;
  language?: string;
  aspectRatio?: AspectRatio;
  brandKit?: BrandKit;
  className?: string;
}

/**
 * Remotion Preview Component
 *
 * Renders a real-time preview of the video with subtitles using Remotion Player
 * This allows users to see exactly what the final render will look like
 * without actually rendering the video on the server
 */
export function RemotionPreview({
  videoUrl,
  subtitles,
  template,
  language = 'en',
  aspectRatio = '9:16',
  brandKit,
  className = '',
}: RemotionPreviewProps) {
  const { width: compositionWidth, height: compositionHeight } = getDimensions(aspectRatio);
  // Convert subtitles to Remotion format (timestamps in seconds)
  const remotionSubtitles = useMemo(
    () =>
      subtitles.map((sub, index) => ({
        id: index + 1,
        start: sub.start, // Keep in seconds - Remotion expects seconds
        end: sub.end,
        text: sub.text,
      })),
    [subtitles]
  );

  // Calculate duration from last subtitle
  const durationInFrames = useMemo(() => {
    if (remotionSubtitles.length === 0) return 300; // 10 seconds default
    const lastSubtitle = remotionSubtitles[remotionSubtitles.length - 1];
    const fps = 30;
    // end is already in seconds
    return Math.ceil(lastSubtitle.end * fps);
  }, [remotionSubtitles]);

  // Input props for the composition
  const inputProps = useMemo(
    () => ({
      videoUrl,
      subtitles: remotionSubtitles,
      template,
      language,
      backgroundColor: '#000000',
      brandKit,
    }),
    [videoUrl, remotionSubtitles, template, language, brandKit]
  );

  return (
    <div
      className={`remotion-preview-container ${className}`}
      style={{ width: '100%', height: '100%' }}
    >
      <Player
        component={VideoComposition}
        inputProps={inputProps}
        durationInFrames={durationInFrames}
        compositionWidth={compositionWidth}
        compositionHeight={compositionHeight}
        fps={30}
        style={{
          width: '100%',
          height: '100%',
          objectFit: 'contain',
        }}
        controls
        loop
        clickToPlay
      />
    </div>
  );
}
