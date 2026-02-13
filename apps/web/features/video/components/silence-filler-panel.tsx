'use client';

import { useMemo, useState } from 'react';
import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Badge } from '@workspace/ui/components/badge';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { ScrollArea } from '@workspace/ui/components/scroll-area';
import { ChevronDown, ChevronUp, Settings2, Sparkles, Trash2, Type, VolumeX } from 'lucide-react';
import {
  cleanFillerWordsFromText,
  detectIssues,
  getDefaultFillerWords,
  removeDetectedIssues,
} from '../lib/silence-filler-detection';
import type { DetectedIssue, DetectionResult, SilenceFillerConfig } from '../types/silence-filler';

interface SubtitleInput {
  start: number;
  end: number;
  text: string;
}

interface SilenceFillerPanelProps {
  subtitles: SubtitleInput[];
  onSubtitlesChange: (subtitles: SubtitleInput[]) => void;
  disabled?: boolean;
  /** Time scale multiplier: 1 for ms (default), 1000 for seconds */
  timeScale?: number;
}

/**
 * SilenceFillerPanel Component
 *
 * Detects silences, filler words, and short segments in subtitle data.
 * Provides one-click cleanup actions and per-issue removal.
 */
export function SilenceFillerPanel({
  subtitles,
  onSubtitlesChange,
  disabled = false,
  timeScale = 1,
}: SilenceFillerPanelProps) {
  const [showSettings, setShowSettings] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [config, setConfig] = useState<Partial<SilenceFillerConfig>>({});

  // Run detection whenever subtitles or config changes
  const result: DetectionResult = useMemo(
    () => detectIssues(subtitles, config, timeScale),
    [subtitles, config, timeScale]
  );

  const totalIssues = result.issues.length;
  const hasIssues = totalIssues > 0;

  const formatDuration = (duration: number): string => {
    const ms = duration * timeScale;
    return `${(ms / 1000).toFixed(1)}s`;
  };

  const handleRemoveFillers = () => {
    const fillerIssues = result.issues.filter((i) => i.type === 'filler');
    const cleaned = removeDetectedIssues(subtitles, fillerIssues);
    onSubtitlesChange(cleaned);
  };

  const handleCleanFillerText = () => {
    const fillerWords = config.fillerWords ?? getDefaultFillerWords();
    const cleaned = cleanFillerWordsFromText(subtitles, fillerWords);
    onSubtitlesChange(cleaned);
  };

  const handleRemoveShortSegments = () => {
    const shortIssues = result.issues.filter((i) => i.type === 'short-segment');
    const cleaned = removeDetectedIssues(subtitles, shortIssues);
    onSubtitlesChange(cleaned);
  };

  const handleAutoCleanAll = () => {
    // First clean filler text, then remove short segments
    const fillerWords = config.fillerWords ?? getDefaultFillerWords();
    let cleaned = cleanFillerWordsFromText(subtitles, fillerWords);

    // Re-detect short segments on the cleaned array
    const shortResult = detectIssues(cleaned, config, timeScale);
    const shortIssues = shortResult.issues.filter((i) => i.type === 'short-segment');
    cleaned = removeDetectedIssues(cleaned, shortIssues);

    onSubtitlesChange(cleaned);
  };

  const handleRemoveSingleIssue = (issue: DetectedIssue) => {
    if (issue.segmentIndex >= 0 && issue.type !== 'silence') {
      const cleaned = subtitles.filter((_, index) => index !== issue.segmentIndex);
      onSubtitlesChange(cleaned);
    }
  };

  const getBadgeVariant = (type: DetectedIssue['type']) => {
    switch (type) {
      case 'silence':
        return 'secondary' as const;
      case 'filler':
        return 'default' as const;
      case 'short-segment':
        return 'destructive' as const;
    }
  };

  const getIssueIcon = (type: DetectedIssue['type']) => {
    switch (type) {
      case 'silence':
        return <VolumeX className="w-3 h-3" />;
      case 'filler':
        return <Type className="w-3 h-3" />;
      case 'short-segment':
        return <Sparkles className="w-3 h-3" />;
    }
  };

  if (subtitles.length === 0) return null;

  return (
    <Card className="p-4 space-y-3">
      {/* Summary */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Cleanup Tools</span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          {result.silenceCount > 0 && (
            <Badge variant="secondary" className="text-xs">
              {result.silenceCount} silence{result.silenceCount !== 1 ? 's' : ''} (
              {formatDuration(result.totalSilenceDuration)})
            </Badge>
          )}
          {result.fillerCount > 0 && (
            <Badge variant="default" className="text-xs">
              {result.fillerCount} filler{result.fillerCount !== 1 ? 's' : ''}
            </Badge>
          )}
          {result.shortSegmentCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {result.shortSegmentCount} short
            </Badge>
          )}
          {!hasIssues && (
            <span className="text-green-600 dark:text-green-400">No issues detected</span>
          )}
        </div>
      </div>

      {/* Action Buttons */}
      {hasIssues && (
        <div className="flex flex-wrap gap-2">
          <Button size="sm" variant="default" onClick={handleAutoCleanAll} disabled={disabled}>
            <Sparkles className="w-3.5 h-3.5 mr-1.5" />
            Auto-Clean All
          </Button>
          {result.fillerCount > 0 && (
            <>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCleanFillerText}
                disabled={disabled}
              >
                <Type className="w-3.5 h-3.5 mr-1.5" />
                Clean Filler Text
              </Button>
              <Button size="sm" variant="outline" onClick={handleRemoveFillers} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Remove Filler Segments
              </Button>
            </>
          )}
          {result.shortSegmentCount > 0 && (
            <Button
              size="sm"
              variant="outline"
              onClick={handleRemoveShortSegments}
              disabled={disabled}
            >
              <Trash2 className="w-3.5 h-3.5 mr-1.5" />
              Remove Short Segments
            </Button>
          )}
        </div>
      )}

      {/* Collapsible Issues List */}
      {hasIssues && (
        <div>
          <button
            type="button"
            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
            onClick={() => setShowIssues(!showIssues)}
          >
            {showIssues ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            {totalIssues} issue{totalIssues !== 1 ? 's' : ''} detected
          </button>

          {showIssues && (
            <ScrollArea className="max-h-[200px] mt-2">
              <div className="space-y-1">
                {result.issues.map((issue, idx) => (
                  <div
                    key={`${issue.type}-${issue.segmentIndex}-${idx}`}
                    className="flex items-center justify-between gap-2 p-2 rounded-md hover:bg-muted/50 text-sm"
                  >
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <Badge variant={getBadgeVariant(issue.type)} className="text-xs shrink-0">
                        <span className="flex items-center gap-1">
                          {getIssueIcon(issue.type)}
                          {issue.type}
                        </span>
                      </Badge>
                      <span className="truncate text-muted-foreground">{issue.description}</span>
                    </div>
                    {issue.segmentIndex >= 0 && issue.type !== 'silence' && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-6 px-2 shrink-0"
                        onClick={() => handleRemoveSingleIssue(issue)}
                        disabled={disabled}
                      >
                        <Trash2 className="w-3 h-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            </ScrollArea>
          )}
        </div>
      )}

      {/* Collapsible Settings */}
      <div>
        <button
          type="button"
          className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
          onClick={() => setShowSettings(!showSettings)}
        >
          <Settings2 className="w-3.5 h-3.5" />
          Settings
        </button>

        {showSettings && (
          <div className="mt-2 space-y-3 p-3 rounded-md bg-muted/30">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label className="text-xs">Silence threshold (ms)</Label>
                <Input
                  type="number"
                  min={100}
                  max={5000}
                  step={100}
                  value={config.silenceThresholdMs ?? 1000}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      silenceThresholdMs: Number(e.target.value),
                    }))
                  }
                  className="h-8 text-sm"
                  disabled={disabled}
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Min segment duration (ms)</Label>
                <Input
                  type="number"
                  min={50}
                  max={2000}
                  step={50}
                  value={config.minSegmentDurationMs ?? 300}
                  onChange={(e) =>
                    setConfig((prev) => ({
                      ...prev,
                      minSegmentDurationMs: Number(e.target.value),
                    }))
                  }
                  className="h-8 text-sm"
                  disabled={disabled}
                />
              </div>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
