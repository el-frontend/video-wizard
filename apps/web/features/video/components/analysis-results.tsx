'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Card } from '@workspace/ui/components/card';
import { ViralClipsList } from '@/components/viral-clips-list';
import type { ContentAnalysis, ViralClip } from '@/server/types/content-analysis';

interface AnalysisResultsProps {
  analysis: ContentAnalysis;
  onClipSelect?: (clip: ViralClip) => void;
}

/**
 * Analysis Results Component
 * 
 * Displays AI analysis results and viral clips
 */
export function AnalysisResults({ analysis, onClipSelect }: AnalysisResultsProps) {
  const averageScore = analysis.clips.length > 0
    ? analysis.clips.reduce((acc, clip) => acc + clip.viral_score, 0) / analysis.clips.length
    : 0;

  return (
    <div className="space-y-6">
      <Card className="p-6">
        <h2 className="text-xl font-semibold mb-2">4. AI analysis completed</h2>
        <p className="text-gray-700 mb-4">{analysis.analysis_summary}</p>
        <div className="flex gap-2">
          <Badge className="bg-green-500">
            {analysis.total_clips} clips found
          </Badge>
          <Badge variant="outline">
            Average score: {averageScore.toFixed(1)}
          </Badge>
        </div>
      </Card>

      <ViralClipsList
        clips={analysis.clips}
        onClipSelect={(clip) => {
          console.log('Selected clip:', clip);
          onClipSelect?.(clip);
        }}
      />
    </div>
  );
}
