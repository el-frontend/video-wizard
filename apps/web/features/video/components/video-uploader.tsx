'use client';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs';
import { Link, Upload } from 'lucide-react';
import { isYouTubeUrl } from '../lib/youtube';
import type { ProcessingStep, VideoInputMode } from '../types';

interface VideoUploaderProps {
  file: File | null;
  youtubeUrl: string;
  inputMode: VideoInputMode;
  currentStep: ProcessingStep;
  onFileSelect: (file: File | null) => void;
  onYoutubeUrlChange: (url: string) => void;
  onInputModeChange: (mode: VideoInputMode) => void;
  onProcess: () => void;
  onReset: () => void;
  error?: string;
}

/**
 * Video Uploader Component
 *
 * Presentational component for file upload or YouTube URL input
 */
export function VideoUploader({
  file,
  youtubeUrl,
  inputMode,
  currentStep,
  onFileSelect,
  onYoutubeUrlChange,
  onInputModeChange,
  onProcess,
  onReset,
  error,
}: VideoUploaderProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    onFileSelect(selectedFile);
  };

  const isProcessing = currentStep !== 'idle' && currentStep !== 'error';
  const isYouTubeValid = youtubeUrl.trim() !== '' && isYouTubeUrl(youtubeUrl);
  const canProcess =
    (currentStep === 'idle' || currentStep === 'error') &&
    (inputMode === 'file' ? !!file : isYouTubeValid);
  const canReset = currentStep === 'complete' || currentStep === 'error';

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">1. Select your video</h2>

      <div className="space-y-4">
        <Tabs value={inputMode} onValueChange={(v) => onInputModeChange(v as VideoInputMode)}>
          <TabsList className="w-full">
            <TabsTrigger value="file" className="flex-1" disabled={isProcessing}>
              <Upload className="w-4 h-4 mr-2" />
              Upload File
            </TabsTrigger>
            <TabsTrigger value="youtube" className="flex-1" disabled={isProcessing}>
              <Link className="w-4 h-4 mr-2" />
              YouTube URL
            </TabsTrigger>
          </TabsList>

          <TabsContent value="file">
            <div className="space-y-4">
              <div className="flex items-center gap-4">
                <input
                  type="file"
                  accept="video/*"
                  onChange={handleFileChange}
                  disabled={isProcessing}
                  className="block w-full text-sm text-gray-500
                    file:mr-4 file:py-2 file:px-4
                    file:rounded-lg file:border-0
                    file:text-sm file:font-semibold
                    file:bg-blue-50 file:text-blue-700
                    hover:file:bg-blue-100
                    disabled:opacity-50 disabled:cursor-not-allowed"
                />
              </div>

              {file && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm font-semibold">Selected file:</p>
                  <p className="text-sm text-gray-700">{file.name}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    Size: {(file.size / (1024 * 1024)).toFixed(2)} MB
                  </p>
                </div>
              )}
            </div>
          </TabsContent>

          <TabsContent value="youtube">
            <div className="space-y-3">
              <Input
                type="url"
                placeholder="https://www.youtube.com/watch?v=..."
                value={youtubeUrl}
                onChange={(e) => onYoutubeUrlChange(e.target.value)}
                disabled={isProcessing}
              />
              {youtubeUrl && (
                <p className={`text-xs ${isYouTubeValid ? 'text-green-600' : 'text-red-500'}`}>
                  {isYouTubeValid ? 'Valid YouTube URL' : 'Please enter a valid YouTube URL'}
                </p>
              )}
              <p className="text-xs text-gray-500">
                Supports youtube.com/watch, youtu.be, and youtube.com/shorts URLs
              </p>
            </div>
          </TabsContent>
        </Tabs>

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-2 justify-between items-center">
          <Button onClick={onProcess} disabled={!canProcess} className="w-full flex-1">
            {isProcessing
              ? 'Processing...'
              : inputMode === 'youtube'
                ? '🔗 Process from YouTube'
                : '🚀 Process Video'}
          </Button>

          {currentStep !== 'idle' && (
            <Button className="w-32" variant="outline" onClick={onReset} disabled={!canReset}>
              Reset
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
