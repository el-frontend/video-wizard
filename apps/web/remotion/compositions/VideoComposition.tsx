import {
  VideoComposition as SharedVideo,
  type VideoCompositionProps,
} from '@workspace/remotion-compositions';

export function VideoComposition(props: VideoCompositionProps) {
  return <SharedVideo {...props} captionOffsetSeconds={0} />;
}
