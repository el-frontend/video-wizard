import { registerRoot } from 'remotion';
import { RemotionRoot } from './Root';

/**
 * Remotion Entry Point
 * 
 * This file is the entry point for Remotion CLI and bundler
 * Registers all available compositions
 */
registerRoot(RemotionRoot);

// Export compositions
export { CaptionOverlay } from './compositions/CaptionOverlay';
export { VideoComposition } from './compositions/VideoComposition';

// Export types
export type {
    CaptionTemplate, CaptionTemplateProps, SubtitleSegment, VideoCompositionProps, WordTiming
} from './types';

// Export hooks
export { useActiveSubtitle } from './hooks/useActiveSubtitle';
