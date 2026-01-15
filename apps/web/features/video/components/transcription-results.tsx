'use client';

import { Badge } from '@workspace/ui/components/badge';
import { Card } from '@workspace/ui/components/card';
import { formatTranscriptForAI } from '../lib/utils';
import type { TranscriptionResult } from '../types';

interface TranscriptionResultsProps {
  transcription: TranscriptionResult;
}

/**
 * Transcription Results Component
 * 
 * Displays the generated transcription
 */
export function TranscriptionResults({ transcription }: TranscriptionResultsProps) {
  return (
    <Card className="p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">3. Generated transcription</h2>
      
      <div className="space-y-4">
        <div className="flex gap-2">
          <Badge>Segments: {transcription.segment_count}</Badge>
          <Badge variant="outline">Audio extracted</Badge>
        </div>

        <div className="bg-gray-50 rounded-lg p-4 max-h-60 overflow-y-auto">
          <p className="text-sm font-mono whitespace-pre-wrap text-gray-700">
            {formatTranscriptForAI(transcription.segments)}
          </p>
        </div>
      </div>
    </Card>
  );
}
