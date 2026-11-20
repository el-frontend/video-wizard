import { AbsoluteFill, interpolate, useCurrentFrame } from 'remotion';
import type { ProjectDraft } from '@workspace/video-project';
import type { ResolvedDependencies } from '@workspace/render-contract';
import { projectAppearance } from './project-appearance';

export function StyleBackdrop({
  document,
  dependencies,
  durationMs,
}: {
  document: ProjectDraft;
  dependencies: ResolvedDependencies;
  durationMs: number;
}) {
  const frame = useCurrentFrame();
  const pin = document.styleRef;
  if (!pin || pin.version < 2) return null;
  const { foreground, accent, surface } = projectAppearance(document, dependencies);
  const progress = Math.min(1, (frame * 1000) / (document.canvas.fps * durationMs));
  const unit = document.canvas.width / 1080;
  if (pin.id === 'noticias-liquid-glass') {
    const drift = Math.sin(progress * Math.PI) * 8;
    return (
      <AbsoluteFill
        style={{
          background:
            'radial-gradient(ellipse at ' +
            (22 + drift) +
            '% 12%, #A5C4FF, transparent 54%), radial-gradient(ellipse at 90% 80%, #B9E8D1, transparent 48%)',
        }}
      >
        <div
          style={{
            position: 'absolute',
            inset: 24 * unit,
            borderRadius: 48 * unit,
            border: '1px solid #FFFFFFBB',
            background: 'linear-gradient(135deg,#FFFFFF99,#FFFFFF22)',
            backdropFilter: 'blur(12px)',
            boxShadow: '0 8px 32px #385E8B22',
          }}
        />
      </AbsoluteFill>
    );
  }
  if (pin.id === 'noticias-elfrontend-web')
    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            inset: 16 * unit,
            background: surface,
            border: '1px solid #0002',
            borderRadius: 32 * unit,
            transform:
              'translateY(' + interpolate(progress, [0, 0.1, 1], [24 * unit, 0, 0]) + 'px)',
          }}
        />
        <div
          style={{
            position: 'absolute',
            bottom: 16 * unit,
            left: 32 * unit,
            width: 4 + progress * 89 + '%',
            height: 5 * unit,
            background: accent,
          }}
        />
      </AbsoluteFill>
    );
  if (pin.id === 'noticias-modern-editorial')
    return (
      <AbsoluteFill>
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            width: 6 + progress * 94 + '%',
            height: 9 * unit,
            background: accent,
          }}
        />
        <div
          style={{
            position: 'absolute',
            right: -76 * unit,
            bottom: -76 * unit,
            width: 245 * unit,
            height: 245 * unit,
            border: '1px solid ' + foreground,
            borderRadius: '50%',
            opacity: 0.4,
          }}
        />
      </AbsoluteFill>
    );
  return null;
}
