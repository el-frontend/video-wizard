import { Composition } from 'remotion';
import { VideoComposition } from './compositions/VideoComposition';
import type { VideoCompositionProps } from './types';

/**
 * Aspect ratio dimension map for calculating composition width/height
 */
const ASPECT_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
  '4:5': { width: 1080, height: 1350 },
  '16:9': { width: 1920, height: 1080 },
};

/**
 * Remotion Root Component
 *
 * Registers all video compositions available for rendering
 * Each composition defines a timeline with video + subtitles
 */
export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="VideoWithSubtitles"
        component={VideoComposition as unknown as React.ComponentType<Record<string, unknown>>}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        calculateMetadata={({ props }) => {
          const { subtitles, durationInFrames, aspectRatio } =
            props as unknown as VideoCompositionProps & {
              aspectRatio?: string;
              durationInFrames?: number;
            };
          const fps = 30;

          // Calculate dimensions from aspect ratio (default to 9:16 if not provided)
          const ratioKey = aspectRatio || '9:16';
          const dims = ASPECT_DIMENSIONS[ratioKey];

          if (!dims) {
            console.warn(`[Remotion] Invalid aspect ratio: ${ratioKey}, falling back to 9:16`);
          }

          const dimensionOverrides = dims ? { width: dims.width, height: dims.height } : {};

          console.log('[Remotion] Dimension calculation:', {
            aspectRatio: ratioKey,
            dimensions: dimensionOverrides,
          });

          // If durationInFrames is explicitly provided, use it
          if (durationInFrames) {
            console.log(
              '[Remotion] Using explicit durationInFrames:',
              durationInFrames,
              'with aspect ratio:',
              ratioKey,
              'and dimensions:',
              dimensionOverrides
            );
            return { durationInFrames, ...dimensionOverrides };
          }

          // Calculate from last subtitle's end time
          // NOTE: Subtitles come in SECONDS, not milliseconds
          if (subtitles && subtitles.length > 0) {
            const lastSubtitle = subtitles[subtitles.length - 1];
            const durationInSeconds = lastSubtitle.end; // Already in seconds
            const calculatedDuration = Math.ceil(durationInSeconds * fps);

            console.log('[Remotion] Calculated duration from subtitles:', {
              lastSubtitleEnd: lastSubtitle.end,
              durationInSeconds,
              durationInFrames: calculatedDuration,
              subtitleCount: subtitles.length,
              aspectRatio: ratioKey,
              dimensions: dimensionOverrides,
            });

            return {
              durationInFrames: calculatedDuration,
              ...dimensionOverrides,
            };
          }

          // Fallback to default 10 seconds
          console.log(
            '[Remotion] Using fallback duration: 300 frames with dimensions:',
            dimensionOverrides
          );
          return { durationInFrames: 300, ...dimensionOverrides };
        }}
        defaultProps={
          {
            videoUrl:
              'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
            subtitles: [
              {
                id: 1,
                start: 0,
                end: 2000,
                text: 'Welcome to Video Wizard',
              },
              {
                id: 2,
                start: 2000,
                end: 4000,
                text: 'Create amazing videos with AI-powered subtitles',
              },
              {
                id: 3,
                start: 4000,
                end: 6000,
                text: 'Choose from multiple templates',
              },
            ],
            template: 'default',
            backgroundColor: '#000000',
          } as VideoCompositionProps
        }
      />
    </>
  );
};
