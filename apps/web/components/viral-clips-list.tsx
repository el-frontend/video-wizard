'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Card } from '@workspace/ui/components/card';
import type { ViralClip } from '@/server/types/content-analysis';

interface ViralClipCardProps {
  clip: ViralClip;
  index: number;
  onSelect?: (clip: ViralClip) => void;
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  
  // For seconds less than 1 minute, show decimal precision
  if (mins === 0) {
    return `0:${secs.toFixed(2)}`;
  }
  
  // For longer durations, show seconds with 1 decimal
  return `${mins}:${secs.toFixed(1).padStart(4, '0')}`;
}

function getScoreColor(score: number): string {
  if (score >= 90) return 'bg-green-500';
  if (score >= 70) return 'bg-blue-500';
  if (score >= 50) return 'bg-yellow-500';
  if (score >= 30) return 'bg-orange-500';
  return 'bg-red-500';
}

function getScoreLabel(score: number): string {
  if (score >= 90) return 'Extremely Viral';
  if (score >= 70) return 'High Potential';
  if (score >= 50) return 'Good Potential';
  if (score >= 30) return 'Moderate';
  return 'Low Potential';
}

export function ViralClipCard({ clip, index, onSelect }: ViralClipCardProps) {
  const duration = clip.end_time - clip.start_time;
  const scoreColor = getScoreColor(clip.viral_score);
  const scoreLabel = getScoreLabel(clip.viral_score);

  return (
    <Card 
      className="p-4 hover:shadow-lg transition-shadow cursor-pointer"
      onClick={() => onSelect?.(clip)}
    >
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg font-bold text-gray-700">#{index + 1}</span>
          <Badge variant="outline">
            {formatTime(clip.start_time)} - {formatTime(clip.end_time)}
          </Badge>
          <Badge variant="secondary">
            {duration >= 1 ? `${duration.toFixed(1)}s` : `${(duration * 1000).toFixed(0)}ms`}
          </Badge>
        </div>
        
        <div className="flex items-center gap-2">
          <div className={`px-3 py-1 rounded-full text-white text-sm font-semibold ${scoreColor}`}>
            {clip.viral_score}
          </div>
          <Badge className={scoreColor}>
            {scoreLabel}
          </Badge>
        </div>
      </div>

      <div className="space-y-3">
        <div>
          <h3 className="text-sm font-semibold text-gray-600 mb-1">Summary</h3>
          <p className="text-sm text-gray-800">{clip.summary}</p>
        </div>

        {clip.hook && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-1">🎣 Hook</h3>
            <p className="text-sm text-gray-700 italic">{clip.hook}</p>
          </div>
        )}

        {clip.conclusion && (
          <div>
            <h3 className="text-sm font-semibold text-gray-600 mb-1">✅ Conclusion</h3>
            <p className="text-sm text-gray-700 italic">{clip.conclusion}</p>
          </div>
        )}
      </div>
    </Card>
  );
}

interface ViralClipsListProps {
  clips: ViralClip[];
  onClipSelect?: (clip: ViralClip) => void;
}

export function ViralClipsList({ clips, onClipSelect }: ViralClipsListProps) {
  if (clips.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        No viral clips identified. Try analyzing a different transcript.
      </div>
    );
  }

  // Sort clips by viral score (highest first)
  const sortedClips = [...clips].sort((a, b) => b.viral_score - a.viral_score);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-2xl font-bold">
          Viral Clips Found: {clips.length}
        </h2>
        <Badge variant="outline" className="text-sm">
          Sorted by viral score
        </Badge>
      </div>
      
      <div className="grid gap-4">
        {sortedClips.map((clip, index) => (
          <ViralClipCard
            key={`${index}-${clip.start_time}-${clip.end_time}`}
            clip={clip}
            index={index}
            onSelect={onClipSelect}
          />
        ))}
      </div>
    </div>
  );
}
