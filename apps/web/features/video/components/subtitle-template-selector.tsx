'use client';

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import type { SubtitleTemplate } from '../types';

interface SubtitleTemplateSelectorProps {
  value: SubtitleTemplate;
  onValueChange: (template: SubtitleTemplate) => void;
  className?: string;
  label?: string;
  showLabel?: boolean;
}

/**
 * SubtitleTemplateSelector Component
 *
 * Reusable dropdown for selecting subtitle templates.
 * Used in ClipCard and ClipEditModal for consistent template selection.
 */
export function SubtitleTemplateSelector({
  value,
  onValueChange,
  className,
  label = 'Subtitle Style',
  showLabel = true,
}: SubtitleTemplateSelectorProps) {
  return (
    <div className={className}>
      {showLabel && <label className="text-xs text-muted-foreground mb-1.5 block">{label}</label>}
      <Select value={value} onValueChange={onValueChange}>
        <SelectTrigger className="w-full">
          <SelectValue placeholder="Select template" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="viral">🔥 Viral - Bold & Energetic</SelectItem>
          <SelectItem value="hormozi">💪 Hormozi - High Energy</SelectItem>
          <SelectItem value="mrbeast">🎮 MrBeast - Comic Style</SelectItem>
          <SelectItem value="mrbeastemoji">😎 MrBeast + Emoji</SelectItem>
          <SelectItem value="highlight">💜 Highlight - Word Sweep</SelectItem>
          <SelectItem value="colorshift">🌈 Color Shift - Yellow to Green</SelectItem>
          <SelectItem value="modern">🎨 Modern - Contemporary</SelectItem>
          <SelectItem value="minimal">✨ Minimal - Clean & Simple</SelectItem>
          <SelectItem value="default">📝 Default - Standard</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
