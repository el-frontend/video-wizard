import { AbsoluteFill } from 'remotion';
import { useActiveSubtitle } from '../hooks/useActiveSubtitle';
import { ColorShiftTemplate } from '../templates/ColorShiftTemplate';
import { DefaultTemplate } from '../templates/DefaultTemplate';
import { HighlightTemplate } from '../templates/HighlightTemplate';
import { HormoziTemplate } from '../templates/HormoziTemplate';
import { MinimalTemplate } from '../templates/MinimalTemplate';
import { ModernTemplate } from '../templates/ModernTemplate';
import { MrBeastEmojiTemplate } from '../templates/MrBeastEmojiTemplate';
import { MrBeastTemplate } from '../templates/MrBeastTemplate';
import { ViralTemplate } from '../templates/ViralTemplate';
import type { CaptionTemplate, SubtitleSegment } from '../types';

interface CaptionOverlayProps {
  subtitles: SubtitleSegment[];
  currentTime: number;
  template: CaptionTemplate;
  language?: string;
}

/**
 * Caption Overlay Component
 * 
 * Displays synchronized captions over the video
 * Selects appropriate template based on props
 */
export function CaptionOverlay({ subtitles, currentTime, template, language = 'en' }: CaptionOverlayProps) {
  const { currentWord, currentSegment, isActive } = useActiveSubtitle(subtitles, currentTime);

  if (!isActive || !currentSegment) {
    return null;
  }

  // Render appropriate template
  const templateProps = {
    currentWord,
    currentSegment,
    isActive,
    language,
  };

  return (
    <AbsoluteFill>
      {template === 'viral' && <ViralTemplate {...templateProps} />}
      {template === 'minimal' && <MinimalTemplate {...templateProps} />}
      {template === 'modern' && <ModernTemplate {...templateProps} />}
      {template === 'default' && <DefaultTemplate {...templateProps} />}
      {template === 'highlight' && <HighlightTemplate {...templateProps} />}
      {template === 'colorshift' && <ColorShiftTemplate {...templateProps} />}
      {template === 'hormozi' && <HormoziTemplate {...templateProps} />}
      {template === 'mrbeast' && <MrBeastTemplate {...templateProps} />}
      {template === 'mrbeastemoji' && <MrBeastEmojiTemplate {...templateProps} />}
    </AbsoluteFill>
  );
}
