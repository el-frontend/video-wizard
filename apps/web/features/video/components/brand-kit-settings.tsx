'use client';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select';
import { ChevronDown, ChevronUp, Palette, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import type { BrandKit, LogoPosition } from '../types/brand-kit';
import { DEFAULT_FONT_OPTIONS } from '../types/brand-kit';

interface BrandKitSettingsProps {
  brandKit: BrandKit | null;
  onBrandKitChange: (kit: BrandKit | null) => void;
  disabled?: boolean;
}

const LOGO_POSITIONS: Array<{ value: LogoPosition; label: string }> = [
  { value: 'top-left', label: 'Top Left' },
  { value: 'top-right', label: 'Top Right' },
  { value: 'bottom-left', label: 'Bottom Left' },
  { value: 'bottom-right', label: 'Bottom Right' },
];

/**
 * BrandKitSettings Component
 *
 * Allows users to configure brand customization:
 * - Logo URL and positioning
 * - Primary, secondary, text, and background colors
 * - Font family selection
 *
 * All changes are persisted via the parent's onBrandKitChange callback.
 */
export function BrandKitSettings({
  brandKit,
  onBrandKitChange,
  disabled = false,
}: BrandKitSettingsProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const updateField = (field: keyof BrandKit, value: string | number | undefined) => {
    const updated = { ...(brandKit ?? {}), [field]: value } as BrandKit;
    onBrandKitChange(updated);
  };

  const handleClear = () => {
    onBrandKitChange(null);
  };

  const handleReset = () => {
    onBrandKitChange({
      logoPosition: 'top-right',
      logoScale: 1,
    });
  };

  const hasAnyValue =
    brandKit &&
    (brandKit.logoUrl ||
      brandKit.primaryColor ||
      brandKit.secondaryColor ||
      brandKit.textColor ||
      brandKit.backgroundColor ||
      brandKit.fontFamily);

  return (
    <Card className="p-4">
      <button
        type="button"
        className="flex items-center justify-between w-full"
        onClick={() => setIsExpanded(!isExpanded)}
      >
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-muted-foreground" />
          <span className="text-sm font-medium">Brand Kit</span>
          {hasAnyValue && <span className="text-xs text-muted-foreground">(Active)</span>}
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        )}
      </button>

      {isExpanded && (
        <div className="mt-4 space-y-5">
          {/* Logo Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Logo</h4>
            <div className="space-y-2">
              <Label className="text-xs">Logo URL</Label>
              <Input
                placeholder="https://example.com/logo.png"
                value={brandKit?.logoUrl ?? ''}
                onChange={(e) => updateField('logoUrl', e.target.value || undefined)}
                disabled={disabled}
                className="h-8 text-sm"
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label className="text-xs">Position</Label>
                <Select
                  value={brandKit?.logoPosition ?? 'top-right'}
                  onValueChange={(v) => updateField('logoPosition', v)}
                  disabled={disabled}
                >
                  <SelectTrigger className="h-8 text-sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {LOGO_POSITIONS.map((pos) => (
                      <SelectItem key={pos.value} value={pos.value}>
                        {pos.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="text-xs">
                  Scale ({brandKit?.logoScale?.toFixed(1) ?? '1.0'}x)
                </Label>
                <input
                  type="range"
                  min="0.1"
                  max="2"
                  step="0.1"
                  value={brandKit?.logoScale ?? 1}
                  onChange={(e) => updateField('logoScale', parseFloat(e.target.value))}
                  disabled={disabled}
                  className="w-full h-8"
                />
              </div>
            </div>
          </div>

          {/* Colors Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Colors</h4>
            <div className="grid grid-cols-2 gap-3">
              <ColorInput
                label="Primary"
                value={brandKit?.primaryColor}
                onChange={(v) => updateField('primaryColor', v)}
                disabled={disabled}
              />
              <ColorInput
                label="Secondary"
                value={brandKit?.secondaryColor}
                onChange={(v) => updateField('secondaryColor', v)}
                disabled={disabled}
              />
              <ColorInput
                label="Text"
                value={brandKit?.textColor}
                onChange={(v) => updateField('textColor', v)}
                disabled={disabled}
              />
              <ColorInput
                label="Background"
                value={brandKit?.backgroundColor}
                onChange={(v) => updateField('backgroundColor', v)}
                disabled={disabled}
              />
            </div>
          </div>

          {/* Typography Section */}
          <div className="space-y-3">
            <h4 className="text-sm font-medium text-muted-foreground">Typography</h4>
            <Select
              value={brandKit?.fontFamily ?? ''}
              onValueChange={(v) => updateField('fontFamily', v || undefined)}
              disabled={disabled}
            >
              <SelectTrigger className="h-8 text-sm">
                <SelectValue placeholder="Use template default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">Use template default</SelectItem>
                {DEFAULT_FONT_OPTIONS.map((font) => (
                  <SelectItem key={font.value} value={font.value}>
                    <span style={{ fontFamily: font.value }}>{font.label}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <Button size="sm" variant="outline" onClick={handleReset} disabled={disabled}>
              <RotateCcw className="w-3.5 h-3.5 mr-1.5" />
              Reset
            </Button>
            {hasAnyValue && (
              <Button size="sm" variant="destructive" onClick={handleClear} disabled={disabled}>
                <Trash2 className="w-3.5 h-3.5 mr-1.5" />
                Clear All
              </Button>
            )}
          </div>
        </div>
      )}
    </Card>
  );
}

/**
 * Color input with native color picker and hex text input
 */
function ColorInput({
  label,
  value,
  onChange,
  disabled,
}: {
  label: string;
  value: string | undefined;
  onChange: (value: string | undefined) => void;
  disabled: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label className="text-xs">{label}</Label>
      <div className="flex gap-2 items-center">
        <input
          type="color"
          value={value ?? '#000000'}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          className="w-8 h-8 rounded border cursor-pointer disabled:opacity-50"
        />
        <Input
          placeholder="#000000"
          value={value ?? ''}
          onChange={(e) => {
            const v = e.target.value;
            if (v === '') {
              onChange(undefined);
            } else if (/^#[0-9A-Fa-f]{0,6}$/.test(v)) {
              onChange(v);
            }
          }}
          disabled={disabled}
          className="h-8 text-sm font-mono flex-1"
        />
      </div>
    </div>
  );
}
