"use client";

import { Button } from "@workspace/ui/components/button";
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from "@workspace/ui/components/dialog";
import { Loader2, Save } from "lucide-react";
import { useState } from "react";

interface SubtitleSegment {
  start: number;
  end: number;
  text: string;
}

interface ClipEditModalProps {
  open: boolean;
  onClose: () => void;
  clipIndex: number;
  clipSummary: string;
  videoUrl: string;
  subtitles: SubtitleSegment[];
  onSave: (editedSubtitles: SubtitleSegment[]) => Promise<void>;
}

/**
 * ClipEditModal Component
 *
 * Modal for editing clip subtitles inline:
 * - Shows video preview on the left
 * - Editable subtitle list on the right
 * - Save triggers Remotion re-render with new subtitles
 */
export function ClipEditModal({
  open,
  onClose,
  clipIndex,
  clipSummary,
  videoUrl,
  subtitles,
  onSave,
}: ClipEditModalProps) {
  const [editedSubtitles, setEditedSubtitles] =
    useState<SubtitleSegment[]>(subtitles);
  const [isSaving, setIsSaving] = useState(false);

  // Format timestamp for display
  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${mins}:${secs.padStart(4, "0")}`;
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
      await onSave(editedSubtitles);
      onClose();
    } catch (error) {
      console.error("Failed to save subtitles:", error);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>Edit Clip {clipIndex + 1}</DialogTitle>
          <DialogDescription>{clipSummary}</DialogDescription>
        </DialogHeader>

        <div className="flex gap-6 flex-1 overflow-hidden">
          {/* Video Preview */}
          <div className="shrink-0 w-75">
            <div className="aspect-9/16 rounded-lg overflow-hidden bg-black sticky top-0">
              <video
                src={videoUrl}
                controls
                className="w-full h-full object-contain"
              >
                Your browser does not support the video tag.
              </video>
            </div>
          </div>

          {/* Subtitle Editor */}
          <div className="flex-1 overflow-y-auto pr-2">
            <div className="space-y-3">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-semibold text-sm text-muted-foreground">
                  Subtitles ({editedSubtitles.length})
                </h3>
                <p className="text-xs text-muted-foreground">
                  Edit the text to update subtitles
                </p>
              </div>

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

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Regenerating Video...
              </>
            ) : (
              <>
                <Save className="w-4 h-4 mr-2" />
                Save & Regenerate
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
