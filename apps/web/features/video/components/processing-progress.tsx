'use client';

import { Card } from '@workspace/ui/components/card';
import type { ProcessingStep, StepStatus } from '../types';

interface ProcessingProgressProps {
  currentStep: ProcessingStep;
  progress: string;
  error?: string;
}

interface ProcessingStepData {
  label: string;
  description: string;
  step: ProcessingStep;
}

const PROCESSING_STEPS: ProcessingStepData[] = [
  {
    label: 'Upload video',
    description: 'Transfer file to server',
    step: 'uploading',
  },
  {
    label: 'Extract audio and subtitles',
    description: 'Generate transcription with timestamps',
    step: 'transcribing',
  },
  {
    label: 'AI content analysis',
    description: 'Identify viral clips with GPT-4o',
    step: 'analyzing',
  },
];

/**
 * Processing Progress Component
 * 
 * Displays the current processing step and progress
 */
export function ProcessingProgress({
  currentStep,
  progress,
  error,
}: ProcessingProgressProps) {
  const getStepStatus = (step: ProcessingStep): StepStatus => {
    if (currentStep === step) return 'current';
    if (currentStep === 'error') return 'error';
    
    const steps: ProcessingStep[] = ['idle', 'uploading', 'transcribing', 'analyzing', 'complete'];
    const currentIndex = steps.indexOf(currentStep);
    const stepIndex = steps.indexOf(step);
    
    return stepIndex < currentIndex ? 'complete' : 'pending';
  };

  const getStepColor = (status: StepStatus): string => {
    switch (status) {
      case 'complete': return 'bg-green-500';
      case 'current': return 'bg-blue-500 animate-pulse';
      case 'error': return 'bg-red-500';
      default: return 'bg-gray-300';
    }
  };

  if (currentStep === 'idle') return null;

  return (
    <Card className="p-6 mb-6">
      <h2 className="text-xl font-semibold mb-4">2. Automatic process</h2>
      
      {/* Progress Steps */}
      <div className="space-y-4 mb-6">
        {PROCESSING_STEPS.map((stepData, index) => {
          const status = getStepStatus(stepData.step);
          return (
            <div key={stepData.step} className="flex items-center gap-3">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white text-sm font-semibold ${getStepColor(status)}`}>
                {index + 1}
              </div>
              <div className="flex-1">
                <p className="font-semibold">{stepData.label}</p>
                <p className="text-sm text-gray-600">{stepData.description}</p>
              </div>
              {status === 'complete' && <span className="text-green-500">✓</span>}
            </div>
          );
        })}
      </div>

      {/* Current Progress */}
      {progress && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800 font-semibold">Current status:</p>
          <p className="text-sm text-blue-700">{progress}</p>
        </div>
      )}

      {/* Error Display */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
          <p className="text-sm text-red-800 font-semibold">Error:</p>
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}
    </Card>
  );
}
