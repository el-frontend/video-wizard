import { libraryKey, type ResolvedDependencies } from './dependencies';
import { resolveAppearance } from './appearance';
import { remotionCaptionPresets } from './remotion-caption-presets';
import type { JsonValue, Layer, ProjectDraft } from '@workspace/video-project';

const defaults = {
  tokens: {
    colors: { background: '#101010', foreground: '#FFFFFF', accent: '#FFFFFF' },
    typography: { display: { fontFamily: 'sans-serif', weight: 700, cqw: 6, lineHeight: 1.15 } },
  },
  contrast: [{ foreground: 'colors.foreground', background: 'colors.background', min: 3 }],
  limits: [{ role: 'typography.display.cqw', min: 0.1, max: 100 }],
  exposedRoles: ['colors.accent', 'typography.display.fontFamily'],
};
function fields(value: JsonValue | undefined) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function projectAppearance(
  document: ProjectDraft,
  dependencies: ResolvedDependencies,
  layer?: Layer
) {
  const pinned = document.styleRef && dependencies.libraries[libraryKey(document.styleRef)];
  const ref =
    layer?.type === 'component'
      ? layer.componentRef
      : layer?.type === 'captions'
        ? layer.templateRef
        : undefined;
  const implementation = ref && dependencies.libraries[libraryKey(ref)];
  const builtin = implementation?.kind === 'component' && implementation.manifest.builtin;
  const componentDefaults =
    implementation && 'manifest' in implementation && implementation.manifest.exposedRoles
      ? { ...defaults, exposedRoles: implementation.manifest.exposedRoles }
      : defaults;
  const { tokens, diagnostics } = resolveAppearance({
    defaults: componentDefaults,
    style: pinned?.kind === 'style' ? pinned : undefined,
    brand: document.brandSnapshot ?? undefined,
    overrides: layer?.overrides,
  });
  const colors = fields(tokens.colors),
    display = fields(fields(tokens.typography).display);
  const displayWeight = typeof display.weight === 'number' ? display.weight : 700;
  const color = (value: JsonValue | undefined, fallback: string) =>
    typeof value === 'string' && /^#[0-9a-f]{3,8}$/i.test(value) ? value : fallback;
  return {
    diagnostics,
    surface: color(colors.surface, '#FFFFFF'),
    background: color(colors.background, '#101010'),
    foreground: color(colors.foreground, '#FFFFFF'),
    accent: color(colors.accent, '#FFFFFF'),
    family: typeof display.fontFamily === 'string' ? display.fontFamily : 'sans-serif',
    weight: builtin ? remotionCaptionPresets[builtin.preset].weight : displayWeight,
    size: ((typeof display.cqw === 'number' ? display.cqw : 6) * document.canvas.width) / 100,
    lineHeight: typeof display.lineHeight === 'number' ? display.lineHeight : 1.15,
  };
}
