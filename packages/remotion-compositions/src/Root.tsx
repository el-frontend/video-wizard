import { zColor } from '@remotion/zod-types';
import { Composition } from 'remotion';
import { z } from 'zod';
import { VideoComposition } from './compositions/VideoComposition';

/**
 * Zod Schema for VideoWithSubtitles composition
 * Ensures type safety for input props
 */
export const videoWithSubtitlesSchema = z.object({
  videoUrl: z.string().url(),
  subtitles: z.array(
    z.object({
      id: z.number(),
      start: z.number(),
      end: z.number(),
      text: z.string(),
      words: z
        .array(
          z.object({
            word: z.string(),
            start: z.number(),
            end: z.number(),
          })
        )
        .optional(),
    })
  ),
  template: z.enum(['default', 'viral', 'minimal', 'modern', 'highlight', 'colorshift', 'hormozi', 'mrbeast', 'mrbeastemoji']),
  backgroundColor: zColor().optional(),
  videoStartTime: z.number().optional(),
  durationInFrames: z.number().optional(),
  language: z.string().optional(),
});

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
        component={VideoComposition as React.ComponentType<any>}
        durationInFrames={300}
        fps={30}
        width={1080}
        height={1920}
        schema={videoWithSubtitlesSchema}
        calculateMetadata={({ props }) => {
          const { subtitles, durationInFrames } = props;
          const fps = 30;

          // If durationInFrames is explicitly provided, use it
          if (durationInFrames) {
            console.log('[Remotion] Using explicit durationInFrames:', durationInFrames);
            return { durationInFrames };
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
            });

            return {
              durationInFrames: calculatedDuration,
            };
          }

          // Fallback to default 10 seconds
          console.log('[Remotion] Using fallback duration: 300 frames');
          return { durationInFrames: 300 };
        }}
        defaultProps={{
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
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
        }}
      />
    </>
  );
};
