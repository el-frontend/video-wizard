'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Button } from '@workspace/ui/components/button';
import { Card, CardContent, CardFooter, CardHeader } from '@workspace/ui/components/card';
import { Edit, Play, Sparkles } from 'lucide-react';
import { useState } from 'react';

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

interface ClipCardProps {
  index: number;
  summary: string;
  viralScore: number;
  duration: number;
  videoUrl?: string;
  subtitles?: SubtitleSegment[];
  isLoading: boolean;
  onEdit: () => void;
  onPlay: () => void;
}

/**
 * ClipCard Component
 * 
 * Displays a viral clip with:
 * - Skeleton placeholder during loading
 * - Video preview when ready
 * - Viral score and clip info
 * - Play and Edit actions
 */
export function ClipCard({
  index,
  summary,
  viralScore,
  duration,
  videoUrl,
  subtitles,
  isLoading,
  onEdit,
  onPlay,
}: ClipCardProps) {
  const [imageError, setImageError] = useState(false);
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

  return (
    <Card className="overflow-hidden hover:shadow-lg transition-shadow">
      <CardHeader className="pb-3">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold text-muted-foreground">
              Clip {index + 1}
            </span>
            <Badge variant="secondary" className="text-xs">
              {formatDuration(duration)}
            </Badge>
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
        {/* Video Preview or Skeleton */}
        <div className="aspect-9/16 max-w-70 mx-auto mb-4 rounded-lg overflow-hidden bg-muted">
          {isLoading ? (
            <div className="w-full h-full flex flex-col items-center justify-center bg-linear-to-br from-muted to-muted-foreground/10 animate-pulse">
              <div className="w-16 h-16 border-4 border-primary border-t-transparent rounded-full animate-spin mb-3" />
              <p className="text-sm text-muted-foreground font-medium">
                Generating clip...
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                This may take a few moments
              </p>
            </div>
          ) : videoUrl && !imageError ? (
            <video
              src={videoUrl}
              className="w-full h-full object-contain bg-black"
              controls
              playsInline
              onError={() => setImageError(true)}
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
        <p className="text-sm text-foreground line-clamp-3 leading-relaxed">
          {summary}
        </p>

        {/* Subtitle Count */}
        {subtitles && subtitles.length > 0 && (
          <p className="text-xs text-muted-foreground mt-2">
            {subtitles.length} subtitle segments
          </p>
        )}
      </CardContent>

      <CardFooter className="pt-3 gap-2">
        <Button
          onClick={onPlay}
          disabled={isLoading || !videoUrl}
          className="flex-1"
          variant="default"
        >
          <Play className="w-4 h-4 mr-2" />
          {isPlaying ? 'Playing' : 'Play'}
        </Button>
        
        <Button
          onClick={onEdit}
          disabled={isLoading || !videoUrl}
          className="flex-1"
          variant="outline"
        >
          <Edit className="w-4 h-4 mr-2" />
          Edit
        </Button>
      </CardFooter>
    </Card>
  );
}
