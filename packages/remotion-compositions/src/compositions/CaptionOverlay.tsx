import { AbsoluteFill } from 'remotion';
import { useActiveSubtitle } from '../hooks/useActiveSubtitle';
import { DefaultTemplate } from '../templates/DefaultTemplate';
import { MinimalTemplate } from '../templates/MinimalTemplate';
import { ModernTemplate } from '../templates/ModernTemplate';
import { ViralTemplate } from '../templates/ViralTemplate';
import type { CaptionTemplate, SubtitleSegment } from '../types';

interface CaptionOverlayProps {
  subtitles: SubtitleSegment[];
  currentTime: number;
  template: CaptionTemplate;
}

/**
 * Caption Overlay Component
 * 
 * Displays synchronized captions over the video
 * Selects appropriate template based on props
 */
export function CaptionOverlay({ subtitles, currentTime, template }: CaptionOverlayProps) {
  const { currentWord, currentSegment, isActive } = useActiveSubtitle(subtitles, currentTime);

  if (!isActive || !currentSegment) {
    return null;
  }

  // Render appropriate template
  const templateProps = {
    currentWord,
    currentSegment,
    isActive,
  };

  return (
    <AbsoluteFill>
      {template === 'viral' && <ViralTemplate {...templateProps} />}
      {template === 'minimal' && <MinimalTemplate {...templateProps} />}
      {template === 'modern' && <ModernTemplate {...templateProps} />}
      {template === 'default' && <DefaultTemplate {...templateProps} />}
    </AbsoluteFill>
  );
}
