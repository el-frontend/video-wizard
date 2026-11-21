import type { LibraryManifest } from '@workspace/video-project';

type Preset = NonNullable<LibraryManifest['builtin']>['preset'];

// These weights come from the corresponding immutable studio-presets/v1 sources.
// The Remotion registry verifies the pinned code against the same source by export name.
export const remotionCaptionPresets = {
  default: { source: 'DefaultTemplate', weight: 700 },
  viral: { source: 'ViralTemplate', weight: 900 },
  minimal: { source: 'MinimalTemplate', weight: 500 },
  modern: { source: 'ModernTemplate', weight: 700 },
  highlight: { source: 'HighlightTemplate', weight: 800 },
  colorshift: { source: 'ColorShiftTemplate', weight: 900 },
  hormozi: { source: 'HormoziTemplate', weight: 900 },
  mrbeast: { source: 'MrBeastTemplate', weight: 900 },
  mrbeastemoji: { source: 'MrBeastEmojiTemplate', weight: 900 },
} satisfies Record<Preset, { source: string; weight: number }>;
