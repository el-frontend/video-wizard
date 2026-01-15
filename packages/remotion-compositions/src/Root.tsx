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
  template: z.enum(['default', 'viral', 'minimal', 'modern']),
  backgroundColor: zColor().optional(),
  videoStartTime: z.number().optional(),
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
        defaultProps={{
          videoUrl: 'https://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4',
          subtitles: [
            {
              id: 1,
              start: 0,
              end: 2,
              text: 'Welcome to Video Wizard',
            },
            {
              id: 2,
              start: 2,
              end: 4,
              text: 'Create amazing videos with AI-powered subtitles',
            },
            {
              id: 3,
              start: 4,
              end: 6,
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
