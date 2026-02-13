'use client';

import { Button } from '@workspace/ui/components/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { Loader2, Save } from 'lucide-react';
import { useEffect, useState } from 'react';
import type { AspectRatio, SubtitleSegment, SubtitleTemplate } from '../types';
import type { BrandKit } from '../types/brand-kit';
import { getAspectClass } from '../lib/aspect-ratios';
import { RemotionPreview } from './remotion-preview';
import { SilenceFillerPanel } from './silence-filler-panel';

interface ClipEditModalProps {
  open: boolean;
  onClose: () => void;
  clipIndex: number;
  clipSummary: string;
  videoUrl: string;
  subtitles: SubtitleSegment[];
  template: SubtitleTemplate;
  aspectRatio?: AspectRatio;
  brandKit?: BrandKit;
  onSave: (editedSubtitles: SubtitleSegment[], template: SubtitleTemplate) => Promise<void>;
}

/**
 * ClipEditModal Component
 *
 * Modal for editing clip subtitles and template:
 * - Shows Remotion Player preview on the left (updates in real-time)
 * - Editable subtitle list on the right
 * - Template selector at the top
 * - Save triggers preview update (no server render yet)
 */
export function ClipEditModal({
  open,
  onClose,
  clipIndex,
  clipSummary,
  videoUrl,
  subtitles,
  template: initialTemplate,
  aspectRatio = '9:16',
  brandKit,
  onSave,
}: ClipEditModalProps) {
  const [editedSubtitles, setEditedSubtitles] = useState<SubtitleSegment[]>(subtitles);
  const [selectedTemplate, setSelectedTemplate] = useState<SubtitleTemplate>(initialTemplate);
  const [isSaving, setIsSaving] = useState(false);

  // Reset state when modal opens with new data using useEffect
  useEffect(() => {
    if (open) {
      setEditedSubtitles(subtitles);
      setSelectedTemplate(initialTemplate);
    }
  }, [open, subtitles, initialTemplate]);

  // Format timestamp for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, '0')}`;
  };

  // Handle subtitle text edit
  const handleSubtitleEdit = (index: number, newText: string) => {
    const updated = [...editedSubtitles];
    updated[index] = { ...updated[index], text: newText };
    setEditedSubtitles(updated);
  };

  // Handle save
  const handleSave = async () => {
    setIsSaving(true);
    try {
      await onSave(editedSubtitles, selectedTemplate);
      // Note: onSave in parent will close the modal
    } catch (error) {
      console.error('Failed to save subtitles:', error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-6xl max-w-[calc(100%-2rem)] max-h-[90vh] overflow-hidden flex flex-col p-6">
        <DialogHeader className="pb-4">
          <DialogTitle>Edit Clip {clipIndex + 1}</DialogTitle>
          <DialogDescription>{clipSummary}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 flex-1 min-h-0">
          {/* Left: Video Preview - Takes all available height */}
          <div className="shrink-0 flex flex-col" style={{ width: '420px' }}>
            <div
              className={`${getAspectClass(aspectRatio)} rounded-lg overflow-hidden bg-black w-full`}
            >
              <RemotionPreview
                videoUrl={videoUrl}
                subtitles={editedSubtitles}
                template={selectedTemplate}
                aspectRatio={aspectRatio}
                brandKit={brandKit}
                className="w-full h-full"
              />
            </div>
          </div>

          {/* Right: Controls and Subtitle Editor */}
          <div className="flex-1 flex flex-col min-h-0 min-w-0">
            {/* Template Selector */}
            <div className="mb-4 shrink-0">
              <label className="text-sm font-medium text-muted-foreground mb-2 block">
                Subtitle Style
              </label>
              <Select
                value={selectedTemplate}
                onValueChange={(v) => setSelectedTemplate(v as SubtitleTemplate)}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select template" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="viral">
                    <div className="flex items-center gap-2">
                      <span>🔥</span>
                      <span>Viral - Bold & Energetic</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="minimal">
                    <div className="flex items-center gap-2">
                      <span>✨</span>
                      <span>Minimal - Clean & Simple</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="modern">
                    <div className="flex items-center gap-2">
                      <span>🎨</span>
                      <span>Modern - Contemporary</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="default">
                    <div className="flex items-center gap-2">
                      <span>📝</span>
                      <span>Default - Standard</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Subtitle Editor - Scrollable */}
            <div className="flex-1 overflow-y-auto pr-2 min-h-0">
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-4 sticky top-0 bg-background z-10 pb-2">
                  <h3 className="font-semibold text-sm text-muted-foreground">
                    Subtitles ({editedSubtitles.length})
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    Edit the text - preview updates in real-time
                  </p>
                </div>

                {/* Silence/Filler Cleanup */}
                {editedSubtitles.length > 0 && (
                  <SilenceFillerPanel
                    subtitles={editedSubtitles}
                    onSubtitlesChange={setEditedSubtitles}
                    timeScale={1000}
                  />
                )}

                {editedSubtitles.map((subtitle, index) => (
                  <div
                    key={index}
                    className="border rounded-lg p-3 hover:border-primary/50 transition-colors"
                  >
                    <div className="flex items-center gap-2 mb-2">
                      <span className="text-xs font-mono text-muted-foreground bg-muted px-2 py-1 rounded">
                        {formatTime(subtitle.start)} - {formatTime(subtitle.end)}
                      </span>
                    </div>

                    <textarea
                      value={subtitle.text}
                      onChange={(e) => handleSubtitleEdit(index, e.target.value)}
                      className="w-full min-h-15 p-2 text-sm border rounded resize-none focus:outline-none focus:ring-2 focus:ring-primary"
                      placeholder="Enter subtitle text..."
                    />
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save Changes
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
