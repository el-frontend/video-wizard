'use client';

import { Button } from '@workspace/ui/components/button';
import type { CaptionTemplate } from '@/remotion/types';
import { SubtitleSegment } from '@/server/types/video-render';
import { useState } from 'react';

interface ExportControlsProps {
  videoUrl: string;
  subtitles: SubtitleSegment[];
  template: CaptionTemplate;
  disabled?: boolean;
}

/**
 * Export Controls Component
 * 
 * Provides export functionality with progress tracking
 * Calls the /api/render-final endpoint for server-side rendering
 */
export function ExportControls({
  videoUrl,
  subtitles,
  template,
  disabled = false,
}: ExportControlsProps) {
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportError, setExportError] = useState<string | null>(null);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleExport = async () => {
    try {
      setIsExporting(true);
      setExportError(null);
      setProgress(0);

      const response = await fetch('/api/render-final', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          videoUrl,
          subtitles,
          template,
        }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Export failed');
      }

      const result = await response.json();
      setDownloadUrl(result.outputUrl);
      setProgress(100);
    } catch (error) {
      console.error('Export error:', error);
      setExportError(error instanceof Error ? error.message : 'Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Export Button */}
      <Button
        onClick={handleExport}
        disabled={disabled || isExporting}
        className="w-full"
        size="lg"
      >
        {isExporting ? 'Exporting...' : 'Export Video'}
      </Button>

      {/* Progress Bar */}
      {isExporting && (
        <div className="space-y-2">
          <div className="w-full bg-gray-200 rounded-full h-2">
            <div
              className="bg-blue-600 h-2 rounded-full transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
          <p className="text-sm text-gray-600 text-center">{progress}% complete</p>
        </div>
      )}

      {/* Error Message */}
      {exportError && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
          <p className="text-sm text-red-600">{exportError}</p>
        </div>
      )}

      {/* Download Link */}
      {downloadUrl && (
        <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
          <p className="text-sm text-green-700 mb-2">Export complete!</p>
          <a
            href={downloadUrl}
            download
            className="text-blue-600 hover:underline font-medium"
          >
            Download Video
          </a>
        </div>
      )}
    </div>
  );
}
