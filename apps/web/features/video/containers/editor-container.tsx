'use client';

import { ExportControls, VideoEditorPreview } from '@/components/video-editor';
import type { CaptionTemplate } from '@/remotion/types';
import type { SubtitleSegment } from '@/server/types/video-render';
import { useState } from 'react';

interface VideoEditorContainerProps {
  sourceAssetId: string;
  sourceDurationMs: number;
  subtitles: SubtitleSegment[];
}

/**
 * Video Editor Container Component
 *
 * Client-side container for the video editor
 * Manages state for preview and export
 */
export function VideoEditorContainer({
  sourceAssetId,
  sourceDurationMs,
  subtitles,
}: VideoEditorContainerProps) {
  const [selectedTemplate, setSelectedTemplate] = useState<CaptionTemplate>('default');

  return (
    <div className="container mx-auto py-8 px-4 max-w-7xl">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Preview Section */}
        <div className="lg:col-span-2">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2">Preview</h2>
            <p className="text-gray-600">Choose a caption style and preview your video</p>
          </div>
          <VideoEditorPreview
            videoUrl={'/api/studio/assets/' + sourceAssetId}
            sourceDurationMs={sourceDurationMs}
            subtitles={subtitles}
            initialTemplate={selectedTemplate}
            onTemplateChange={setSelectedTemplate}
            className="w-90 h-auto"
          />
        </div>

        {/* Export Section */}
        <div className="lg:col-span-1">
          <div className="mb-4">
            <h2 className="text-2xl font-bold mb-2">Export</h2>
            <p className="text-gray-600">Ready to export your video?</p>
          </div>
          <div className="bg-white rounded-lg shadow-lg p-6 border border-gray-200">
            <ExportControls
              sourceAssetId={sourceAssetId}
              subtitles={subtitles}
              template={selectedTemplate}
            />
          </div>

          {/* Video Info */}
          <div className="mt-6 p-4 bg-gray-50 rounded-lg">
            <h3 className="font-semibold mb-2">Video Information</h3>
            <dl className="space-y-1 text-sm">
              <div className="flex justify-between">
                <dt className="text-gray-600">Template:</dt>
                <dd className="font-medium">{selectedTemplate}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Subtitles:</dt>
                <dd className="font-medium">{subtitles.length} segments</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-gray-600">Format:</dt>
                <dd className="font-medium">9:16 Vertical</dd>
              </div>
            </dl>
          </div>
        </div>
      </div>
    </div>
  );
}
