'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader } from '@workspace/ui/components/card';
import { Download, Edit, FileText, Film, Loader2, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { getAspectClass } from '../lib/aspect-ratios';
import { downloadSrt, downloadVtt } from '../lib/subtitle-export';
import type { AspectRatio, SubtitleSegment, SubtitleTemplate } from '../types';
import type { BrandKit } from '../types/brand-kit';
import { RemotionPreview } from './remotion-preview';
import { SubtitleTemplateSelector } from './subtitle-template-selector';

interface ClipCardProps {
  index: number;
  summary: string;
  viralScore: number;
  duration: number;
  videoUrl?: string; // Cropped video (without subtitles)
  renderedVideoUrl?: string; // Final rendered video from Remotion server
  subtitles?: SubtitleSegment[];
  template?: SubtitleTemplate;
  language?: string; // Language code for emoji template
  aspectRatio?: AspectRatio;
  brandKit?: BrandKit;
  isLoading: boolean;
  isRendering?: boolean;
  onEdit: () => void;
  onTemplateChange: (template: SubtitleTemplate) => void;
  onRenderFinal: () => void;
}

/**
 * ClipCard Component
 *
 * Displays a viral clip with:
 * - Remotion Player preview (instant client-side preview)
 * - Template selector to change subtitle style
 * - Edit button to modify subtitles
 * - Render button to create final video with Remotion server
 */
export function ClipCard({
  index,
  summary,
  viralScore,
  duration,
  videoUrl,
  renderedVideoUrl,
  subtitles,
  template = 'viral',
  language = 'en',
  aspectRatio = '9:16',
  brandKit,
  isLoading,
  isRendering,
  onEdit,
  onTemplateChange,
  onRenderFinal,
}: ClipCardProps) {
  const [isPlaying, setIsPlaying] = useState(false);

  // Calculate viral score color
  const getScoreColor = (score: number) => {
    if (score >= 8) return 'bg-green-500';
    if (score >= 6) return 'bg-yellow-500';
    return 'bg-orange-500';
  };

  // Format duration
  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const hasSubtitles = subtitles && subtitles.length > 0;

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">Clip {index + 1}</span>
            <Badge variant="secondary" className="text-xs">
              {formatDuration(duration)}
            </Badge>
            {renderedVideoUrl && (
              <Badge variant="default" className="text-xs bg-green-600">
                Rendered
              </Badge>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-yellow-500" />
            <Badge className={`${getScoreColor(viralScore)} text-white border-0`}>
              {viralScore.toFixed(1)}
            </Badge>
          </div>
        </div>
      </CardHeader>

      <CardContent className="pb-3">
        {/* Video Preview */}
        <div
          className={`${getAspectClass(aspectRatio)} max-w-70 mx-auto mb-4 rounded-lg overflow-hidden bg-muted`}
        >
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-muted to-muted-foreground/10 animate-pulse">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground font-medium">Generating clip...</p>
              <p className="text-xs text-muted-foreground mt-1">
                Cropping video with face tracking
              </p>
            </div>
          ) : videoUrl && hasSubtitles ? (
            /* Show Remotion Player for real-time preview */
            <RemotionPreview
              videoUrl={videoUrl}
              subtitles={subtitles}
              template={template}
              language={language}
              aspectRatio={aspectRatio}
              brandKit={brandKit}
              className="w-full h-full"
            />
          ) : videoUrl ? (
            /* Fallback to regular video if no subtitles */
            <video
              src={videoUrl}
              className="w-full h-full object-contain bg-black"
              controls
              playsInline
              onPlay={() => setIsPlaying(true)}
              onPause={() => setIsPlaying(false)}
            >
              Your browser does not support the video tag.
            </video>
          ) : (
            <div className="w-full h-full flex items-center justify-center bg-linear-to-br from-muted to-muted-foreground/10">
              <Play className="w-12 h-12 text-muted-foreground/50" />
            </div>
          )}
        </div>

        {/* Clip Summary */}
        <p className="text-sm text-foreground line-clamp-3 leading-relaxed mb-3">{summary}</p>

        {/* Template Selector */}
        {hasSubtitles && videoUrl && !isLoading && (
          <SubtitleTemplateSelector
            value={template}
            onValueChange={onTemplateChange}
            className="mb-3"
          />
        )}

        {/* Subtitle Count & Export */}
        {hasSubtitles && (
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{subtitles.length} subtitle segments</p>
            <div className="flex gap-1">
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => downloadSrt(subtitles, `clip-${index + 1}`)}
              >
                <Download className="w-3 h-3 mr-1" />
                SRT
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 px-2 text-xs"
                onClick={() => downloadVtt(subtitles, `clip-${index + 1}`)}
              >
                <FileText className="w-3 h-3 mr-1" />
                VTT
              </Button>
            </div>
          </div>
        )}
      </CardContent>

      <CardFooter className="pt-3 flex-col gap-2">
        {/* Top Row: Edit + Render Final */}
        <div className="flex gap-2 w-full">
          <Button
            onClick={onEdit}
            disabled={isLoading || !videoUrl || isRendering}
            className="flex-1"
            variant="outline"
          >
            <Edit className="w-4 h-4 mr-2" />
            Edit
          </Button>

          <Button
            onClick={onRenderFinal}
            disabled={isLoading || !videoUrl || !hasSubtitles || isRendering}
            className="flex-1"
            variant="default"
          >
            {isRendering ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Rendering...
              </>
            ) : renderedVideoUrl ? (
              <>
                <Film className="w-4 h-4 mr-2" />
                Re-render
              </>
            ) : (
              <>
                <Film className="w-4 h-4 mr-2" />
                Render Final
              </>
            )}
          </Button>
        </div>

        {/* Download Button (if rendered) */}
        {renderedVideoUrl && !isRendering && (
          <Button
            onClick={() => window.open(renderedVideoUrl, '_blank')}
            className="w-full"
            variant="secondary"
          >
            <Play className="w-4 h-4 mr-2" />
            Download Final Video
          </Button>
        )}
      </CardFooter>
    </Card>
  );
}
