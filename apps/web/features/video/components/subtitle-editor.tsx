'use client';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { ScrollArea } from '@workspace/ui/components/scroll-area';
import { Download, FileText } from 'lucide-react';
import { useState } from 'react';
import type { SubtitleSegment } from '../hooks/use-subtitle-generation';
import { downloadSrt, downloadVtt } from '../lib/subtitle-export';
import { SilenceFillerPanel } from './silence-filler-panel';

interface SubtitleEditorProps {
  subtitles: SubtitleSegment[];
  onSubtitlesChange: (subtitles: SubtitleSegment[]) => void;
  disabled?: boolean;
}

/**
 * Format time from seconds to MM:SS.ms format
 * @param seconds - Time in seconds (e.g., 1.5, 65.37)
 * @returns Formatted time string (e.g., "00:01.50", "01:05.37")
 */
function formatTime(seconds: number): string {
  const totalSeconds = Math.floor(seconds);
  const minutes = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  const ms = Math.floor((seconds % 1) * 100);

  return `${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')}.${String(ms).padStart(2, '0')}`;
}

export function SubtitleEditor({
  subtitles,
  onSubtitlesChange,
  disabled = false,
}: SubtitleEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  const handleTextChange = (index: number, newText: string) => {
    const updated = [...subtitles];
    updated[index] = { ...updated[index], text: newText };
    onSubtitlesChange(updated);
  };

  const handleDelete = (index: number) => {
    const updated = subtitles.filter((_, i) => i !== index);
    onSubtitlesChange(updated);
  };

  const handleMergeWithNext = (index: number) => {
    if (index >= subtitles.length - 1) return;

    const updated = [...subtitles];
    updated[index] = {
      ...updated[index],
      end: updated[index + 1].end,
      text: `${updated[index].text} ${updated[index + 1].text}`,
    };
    updated.splice(index + 1, 1);
    onSubtitlesChange(updated);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">Edit Subtitles</h3>
          <p className="text-sm text-muted-foreground">
            {subtitles.length} subtitle segments • Click to edit text
          </p>
        </div>
        {subtitles.length > 0 && (
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadSrt(subtitles)}
              disabled={disabled}
            >
              <Download className="w-3.5 h-3.5 mr-1.5" />
              SRT
            </Button>
            <Button
              size="sm"
              variant="outline"
              onClick={() => downloadVtt(subtitles)}
              disabled={disabled}
            >
              <FileText className="w-3.5 h-3.5 mr-1.5" />
              VTT
            </Button>
          </div>
        )}
      </div>

      {/* Silence/Filler Cleanup Panel */}
      {subtitles.length > 0 && (
        <SilenceFillerPanel
          subtitles={subtitles}
          onSubtitlesChange={onSubtitlesChange}
          disabled={disabled}
        />
      )}

      <ScrollArea className="h-[500px] rounded-md border">
        <div className="p-4 space-y-2">
          {subtitles.map((subtitle, index) => (
            <Card key={index} className="p-4">
              <div className="space-y-3">
                <div className="flex items-center justify-between text-sm text-muted-foreground">
                  <span>
                    {formatTime(subtitle.start)} → {formatTime(subtitle.end)}
                  </span>
                  <span className="text-xs">
                    Duration: {(subtitle.end - subtitle.start).toFixed(2)}s
                  </span>
                </div>

                {editingIndex === index ? (
                  <div className="space-y-2">
                    <Input
                      value={subtitle.text}
                      onChange={(e) => handleTextChange(index, e.target.value)}
                      disabled={disabled}
                      autoFocus
                      onBlur={() => setEditingIndex(null)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          setEditingIndex(null);
                        }
                      }}
                    />
                  </div>
                ) : (
                  <p
                    className="cursor-pointer hover:bg-muted/50 p-2 rounded"
                    onClick={() => !disabled && setEditingIndex(index)}
                  >
                    {subtitle.text}
                  </p>
                )}

                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingIndex(index)}
                    disabled={disabled || editingIndex === index}
                  >
                    Edit
                  </Button>
                  {index < subtitles.length - 1 && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleMergeWithNext(index)}
                      disabled={disabled}
                    >
                      Merge with Next
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => handleDelete(index)}
                    disabled={disabled}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </ScrollArea>
    </div>
  );
}
