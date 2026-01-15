'use client';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import type { ProcessingStep } from '../types';

interface VideoUploaderProps {
  file: File | null;
  currentStep: ProcessingStep;
  onFileSelect: (file: File | null) => void;
  onProcess: () => void;
  onReset: () => void;
  error?: string;
}

/**
 * Video Uploader Component
 * 
 * Presentational component for file selection and upload controls
 */
export function VideoUploader({
  file,
  currentStep,
  onFileSelect,
  onProcess,
  onReset,
  error,
}: VideoUploaderProps) {
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0] || null;
    onFileSelect(selectedFile);
  };

  const isProcessing = currentStep !== 'idle' && currentStep !== 'error';
  const canProcess = file && (currentStep === 'idle' || currentStep === 'error');
  const canReset = currentStep === 'complete' || currentStep === 'error';

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">1. Select your video</h2>
      
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

        {error && (
          <div className="bg-red-50 border border-red-200 rounded-lg p-4">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            onClick={onProcess}
            disabled={!canProcess}
            className='w-full'
          >
            {currentStep === 'idle' ? '🚀 Process Video' : 'Processing...'}
          </Button>
          
          {currentStep !== 'idle' && (
            <Button
              variant="outline"
              onClick={onReset}
              disabled={!canReset}
            >
              Reset
            </Button>
          )}
        </div>
      </div>
    </Card>
  );
}
