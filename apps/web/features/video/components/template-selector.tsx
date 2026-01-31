'use client';

import type { CaptionTemplate } from '@remotion/compositions/types';
import { Card } from '@workspace/ui/components/card';
import { Label } from '@workspace/ui/components/label';
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group';

interface TemplateSelectorProps {
  selectedTemplate: CaptionTemplate;
  onTemplateChange: (template: CaptionTemplate) => void;
  disabled?: boolean;
}

interface TemplateOption {
  value: CaptionTemplate;
  label: string;
  description: string;
}

const TEMPLATE_OPTIONS: TemplateOption[] = [
  {
    value: 'viral',
    label: 'Viral',
    description: 'Bold, eye-catching style perfect for social media',
  },
  {
    value: 'minimal',
    label: 'Minimal',
    description: 'Clean and simple design',
  },
  {
    value: 'modern',
    label: 'Modern',
    description: 'Contemporary style with smooth animations',
  },
  {
    value: 'default',
    label: 'Default',
    description: 'Standard subtitle style',
  },
  {
    value: 'highlight',
    label: 'Highlight',
    description: 'Emphasizes key words with color',
  },
  {
    value: 'colorshift',
    label: 'Color Shift',
    description: 'Dynamic color transitions',
  },
  {
    value: 'hormozi',
    label: 'Hormozi',
    description: 'High-impact style inspired by Alex Hormozi',
  },
  {
    value: 'mrbeast',
    label: 'MrBeast',
    description: 'Bold and energetic MrBeast style',
  },
  {
    value: 'mrbeastemoji',
    label: 'MrBeast Emoji',
    description: 'MrBeast style with dynamic emoji reactions',
  },
];

export function TemplateSelector({
  selectedTemplate,
  onTemplateChange,
  disabled = false,
}: TemplateSelectorProps) {
  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-lg font-semibold mb-2">Select Subtitle Template</h3>
        <p className="text-sm text-muted-foreground">
          Choose a style for your video subtitles
        </p>
      </div>

      <RadioGroup
        value={selectedTemplate}
        onValueChange={(value) => onTemplateChange(value as CaptionTemplate)}
        disabled={disabled}
        className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4"
      >
        {TEMPLATE_OPTIONS.map((template) => (
          <Card
            key={template.value}
            className={`cursor-pointer transition-all hover:shadow-md ${
              selectedTemplate === template.value
                ? 'ring-2 ring-primary'
                : 'hover:ring-1 hover:ring-muted-foreground'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            <label
              htmlFor={template.value}
              className="flex items-start space-x-3 p-4 cursor-pointer"
            >
              <RadioGroupItem
                value={template.value}
                id={template.value}
                className="mt-1"
              />
              <div className="flex-1 space-y-1">
                <p className="font-medium leading-none">{template.label}</p>
                <p className="text-sm text-muted-foreground">
                  {template.description}
                </p>
              </div>
            </label>
          </Card>
        ))}
      </RadioGroup>
    </div>
  );
}
