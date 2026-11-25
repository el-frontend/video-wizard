'use client';

import { durationFrames } from '@/features/video/lib/legacy-timing';
import { cn } from '@/lib/utils';
import { VideoComposition } from '@/remotion/compositions/VideoComposition';
import { REMOTION_CONFIG } from '@/remotion/config';
import type { CaptionTemplate, SubtitleSegment } from '@/remotion/types';
import { Player } from '@remotion/player';
import { useCallback, useState } from 'react';

interface VideoEditorPreviewProps {
  videoUrl: string;
  sourceDurationMs: number;
  subtitles: SubtitleSegment[];
  initialTemplate?: CaptionTemplate;
  onTemplateChange?: (template: CaptionTemplate) => void;
  className?: string;
}

/**
 * Video Editor Preview Component (Phase T)
 *
 * Provides real-time preview of video with subtitles
 * Uses Remotion Player for interactive playback
 */
export function VideoEditorPreview({
  videoUrl,
  sourceDurationMs,
  subtitles,
  className,
  initialTemplate = 'default',
  onTemplateChange,
}: VideoEditorPreviewProps) {
  const [template, setTemplate] = useState<CaptionTemplate>(initialTemplate);

  const handleTemplateChange = useCallback(
    (newTemplate: CaptionTemplate) => {
      setTemplate(newTemplate);
      onTemplateChange?.(newTemplate);
    },
    [onTemplateChange]
  );

  return (
    <div className="flex flex-col gap-4">
      {/* Template Selector */}
      <div className="flex gap-2 flex-wrap">
        <TemplateButton
          label="Default"
          isActive={template === 'default'}
          onClick={() => handleTemplateChange('default')}
        />
        <TemplateButton
          label="Viral"
          isActive={template === 'viral'}
          onClick={() => handleTemplateChange('viral')}
        />
        <TemplateButton
          label="Minimal"
          isActive={template === 'minimal'}
          onClick={() => handleTemplateChange('minimal')}
        />
        <TemplateButton
          label="Modern"
          isActive={template === 'modern'}
          onClick={() => handleTemplateChange('modern')}
        />
      </div>

      {/* Video Player */}
      <div
        className={cn(
          'relative aspect-9/16 bg-black rounded-lg overflow-hidden shadow-2xl',
          className
        )}
      >
        <Player
          component={VideoComposition}
          inputProps={{
            videoUrl,
            subtitles,
            template,
            backgroundColor: '#000000',
          }}
          durationInFrames={durationFrames(sourceDurationMs, REMOTION_CONFIG.DEFAULT_FPS)}
          fps={REMOTION_CONFIG.DEFAULT_FPS}
          compositionWidth={REMOTION_CONFIG.DEFAULT_WIDTH}
          compositionHeight={REMOTION_CONFIG.DEFAULT_HEIGHT}
          style={{
            width: '100%',
            height: '100%',
          }}
          controls
          loop
        />
      </div>
    </div>
  );
}

interface TemplateButtonProps {
  label: string;
  isActive: boolean;
  onClick: () => void;
}

function TemplateButton({ label, isActive, onClick }: TemplateButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-2 rounded-lg font-medium transition-all ${
        isActive
          ? 'bg-blue-600 text-white shadow-lg scale-105'
          : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
      }`}
    >
      {label}
    </button>
  );
}
