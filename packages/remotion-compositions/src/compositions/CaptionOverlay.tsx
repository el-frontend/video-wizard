import { AbsoluteFill, Img } from 'remotion';
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
import type { BrandKit, CaptionTemplate, SubtitleSegment } from '../types';

interface CaptionOverlayProps {
  subtitles: SubtitleSegment[];
  currentTime: number;
  template: CaptionTemplate;
  language?: string;
  brandKit?: BrandKit;
}

/**
 * Caption Overlay Component
 *
 * Displays synchronized captions over the video
 * Selects appropriate template based on props
 * Renders brand kit logo overlay if configured
 */
export function CaptionOverlay({
  subtitles,
  currentTime,
  template,
  language = 'en',
  brandKit,
}: CaptionOverlayProps) {
  const { currentWord, currentSegment, isActive } = useActiveSubtitle(subtitles, currentTime);

  // Logo position styles
  const logoPositionStyle = (() => {
    if (!brandKit?.logoUrl) return {};
    const pos = brandKit.logoPosition ?? 'top-right';
    return {
      justifyContent: pos.startsWith('bottom') ? 'flex-end' : 'flex-start',
      alignItems: pos.endsWith('right') ? 'flex-end' : 'flex-start',
      padding: '20px',
    } as const;
  })();

  return (
    <>
      {/* Brand Kit Logo Overlay */}
      {brandKit?.logoUrl && (
        <AbsoluteFill style={logoPositionStyle}>
          <Img
            src={brandKit.logoUrl}
            style={{
              maxWidth: '120px',
              maxHeight: '80px',
              transform: `scale(${brandKit.logoScale ?? 1})`,
              objectFit: 'contain' as const,
            }}
          />
        </AbsoluteFill>
      )}

      {/* Caption Templates */}
      {isActive && currentSegment && (
        <AbsoluteFill>
          {(() => {
            const templateProps = {
              currentWord,
              currentSegment,
              isActive,
              language,
              brandKit,
            };

            switch (template) {
              case 'viral':
                return <ViralTemplate {...templateProps} />;
              case 'minimal':
                return <MinimalTemplate {...templateProps} />;
              case 'modern':
                return <ModernTemplate {...templateProps} />;
              case 'default':
                return <DefaultTemplate {...templateProps} />;
              case 'highlight':
                return <HighlightTemplate {...templateProps} />;
              case 'colorshift':
                return <ColorShiftTemplate {...templateProps} />;
              case 'hormozi':
                return <HormoziTemplate {...templateProps} />;
              case 'mrbeast':
                return <MrBeastTemplate {...templateProps} />;
              case 'mrbeastemoji':
                return <MrBeastEmojiTemplate {...templateProps} />;
              default:
                return <DefaultTemplate {...templateProps} />;
            }
          })()}
        </AbsoluteFill>
      )}
    </>
  );
}
