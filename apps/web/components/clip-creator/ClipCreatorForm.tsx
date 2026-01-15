'use client';

import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { useClipWorkflow } from '@/lib/hooks/useClipWorkflow';
import type { SubtitleSegment } from '@/server/types/video-render';
import { useState } from 'react';

interface ClipCreatorFormProps {
  videoPath: string;
  onClipCreated?: (clipUrl: string, subtitles: SubtitleSegment[]) => void;
}

/**
 * Clip Creator Form Component
 * 
 * UI for creating clips from a video with integration to Python backend
 */
export function ClipCreatorForm({
  videoPath,
  onClipCreated,
}: ClipCreatorFormProps) {
  const [startTime, setStartTime] = useState<number>(0);
  const [endTime, setEndTime] = useState<number>(30);
  const [cropMode, setCropMode] = useState<'dynamic' | 'static'>('dynamic');
  const [includeTranscription, setIncludeTranscription] = useState(true);

  const { isProcessing, currentStep, error, createClip } = useClipWorkflow();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const result = await createClip({
        videoPath,
        startTime,
        endTime,
        cropMode,
        includeTranscription,
      });

      if (result.clipUrl) {
        onClipCreated?.(result.clipUrl, result.subtitles || []);
      }
    } catch (error) {
      console.error('Failed to create clip:', error);
    }
  };

  const getStepMessage = () => {
    switch (currentStep) {
      case 'creating-clip':
        return 'Creating vertical clip with smart cropping...';
      case 'transcribing':
        return 'Generating subtitles...';
      case 'ready':
        return 'Clip ready! Redirecting to editor...';
      case 'error':
        return error || 'An error occurred';
      default:
        return null;
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Time Range */}
      <div className="grid grid-cols-2 gap-4">
        <div>
          <Label htmlFor="start-time">Start Time (seconds)</Label>
          <Input
            id="start-time"
            type="number"
            min="0"
            step="0.1"
            value={startTime}
            onChange={(e) => setStartTime(parseFloat(e.target.value))}
            disabled={isProcessing}
          />
        </div>
        <div>
          <Label htmlFor="end-time">End Time (seconds)</Label>
          <Input
            id="end-time"
            type="number"
            min="0"
            step="0.1"
            value={endTime}
            onChange={(e) => setEndTime(parseFloat(e.target.value))}
            disabled={isProcessing}
          />
        </div>
      </div>

      {/* Crop Mode */}
      <div>
        <Label htmlFor="crop-mode">Crop Mode</Label>
        <select
          id="crop-mode"
          value={cropMode}
          onChange={(e) => setCropMode(e.target.value as 'dynamic' | 'static')}
          disabled={isProcessing}
          className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-md"
        >
          <option value="dynamic">Dynamic (Face Tracking)</option>
          <option value="static">Static (Fixed Center)</option>
        </select>
        <p className="text-sm text-gray-500 mt-1">
          {cropMode === 'dynamic'
            ? 'Tracks speaker\'s face for smooth camera movement'
            : 'Fixed crop at center position'}
        </p>
      </div>

      {/* Include Transcription */}
      <div className="flex items-center gap-2">
        <input
          type="checkbox"
          id="include-transcription"
          checked={includeTranscription}
          onChange={(e) => setIncludeTranscription(e.target.checked)}
          disabled={isProcessing}
          className="rounded"
        />
        <Label htmlFor="include-transcription" className="cursor-pointer">
          Generate subtitles automatically
        </Label>
      </div>

      {/* Progress Message */}
      {getStepMessage() && (
        <div
          className={`p-4 rounded-lg ${
            currentStep === 'error'
              ? 'bg-red-50 text-red-700'
              : 'bg-blue-50 text-blue-700'
          }`}
        >
          <p className="text-sm font-medium">{getStepMessage()}</p>
        </div>
      )}

      {/* Submit Button */}
      <Button type="submit" disabled={isProcessing} className="w-full" size="lg">
        {isProcessing ? 'Creating Clip...' : 'Create Clip'}
      </Button>

      {/* Clip Info */}
      <div className="text-sm text-gray-600">
        <p>Duration: {endTime - startTime} seconds</p>
        <p>Output: 9:16 vertical video (1080x1920)</p>
      </div>
    </form>
  );
}
