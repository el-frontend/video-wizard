import { CaptionOverlay as SharedOverlay } from '@workspace/remotion-compositions';
import type { ComponentProps } from 'react';

export function CaptionOverlay(props: ComponentProps<typeof SharedOverlay>) {
  return <SharedOverlay {...props} captionOffsetSeconds={0} />;
}
