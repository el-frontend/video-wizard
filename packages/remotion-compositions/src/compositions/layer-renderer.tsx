import type { ComponentType, CSSProperties } from 'react';
import { Audio, Img, OffthreadVideo, useCurrentFrame } from 'remotion';
import { contrastRatio, libraryKey, type ResolvedDependencies } from '@workspace/render-contract';
import type { Layer, ProjectDraft } from '@workspace/video-project';
import type { CaptionTemplateProps } from '../types';
import { captionAt } from './project-timing';
import { projectAppearance } from './project-appearance';

export type ProjectRegistry = Record<string, ComponentType<CaptionTemplateProps>>;
export interface LayerRendererProps {
  layer: Layer;
  document: ProjectDraft;
  dependencies: ResolvedDependencies;
  registry: ProjectRegistry;
  origin: number;
  headline?: string;
}

export function LayerRenderer({
  layer,
  document,
  dependencies,
  registry,
  origin,
  headline,
}: LayerRendererProps) {
  const frame = useCurrentFrame();
  const { fps } = document.canvas;
  const src = 'assetId' in layer ? dependencies.assets[layer.assetId]?.url : undefined;
  const trimBefore = 'sourceInMs' in layer ? Math.floor((layer.sourceInMs * fps) / 1000) : 0;
  if (layer.type === 'audio')
    return src ? <Audio src={src} volume={layer.volume} trimBefore={trimBefore} /> : null;

  const { x, y, width, height } = layer.box;
  const style: CSSProperties = {
    position: 'absolute',
    left: x,
    top: y,
    width,
    height,
    overflow: 'hidden',
  };
  const fill: CSSProperties = { width: '100%', height: '100%', objectFit: 'cover' };
  const appearance = projectAppearance(document, dependencies, layer);
  const textStyle: CSSProperties = {
    ...style,
    color: appearance.foreground,
    fontFamily: appearance.family,
    fontSize: appearance.size,
    fontWeight: appearance.weight,
    lineHeight: appearance.lineHeight,
    whiteSpace: 'pre-wrap',
    overflowWrap: 'anywhere',
  };
  if (layer.type === 'text') return <div style={textStyle}>{layer.text}</div>;
  if (layer.type === 'image')
    return src ? (
      <div style={style}>
        <Img src={src} style={fill} />
      </div>
    ) : null;
  if (layer.type === 'video')
    return src ? (
      <div style={style}>
        <OffthreadVideo
          src={src}
          trimBefore={trimBefore}
          volume={layer.volume}
          style={{
            ...fill,
            objectFit: layer.fit,
            objectPosition: layer.focalPoint.x * 100 + '% ' + layer.focalPoint.y * 100 + '%',
          }}
        />
      </div>
    ) : null;

  const offset =
    (Math.floor(((origin + layer.startMs) * fps) / 1000) * 1000) / fps - (origin + layer.startMs);
  const text = layer.type === 'component' ? (headline ?? '') : '';
  const caption =
    layer.type === 'captions'
      ? captionAt(layer.cues, (frame * 1000) / fps + offset)
      : {
          currentSegment: { id: 0, text, start: 0, end: (layer.endMs - layer.startMs) / 1000 },
          currentWord: text,
          isActive: true,
        };
  if (!caption) return null;
  const ref = layer.type === 'captions' ? layer.templateRef : layer.componentRef;
  if (!ref) return <div style={textStyle}>{caption.currentSegment?.text}</div>;
  const Component = registry[libraryKey(ref)];
  if (!Component) throw new Error('Falta el componente fijado.');
  const entry = dependencies.libraries[libraryKey(ref)];
  const preset = entry?.kind === 'component' && entry.manifest.builtin?.preset;
  const accentBackground = preset && ['default', 'viral', 'modern'].includes(preset);
  const ink =
    accentBackground &&
    (contrastRatio(appearance.accent, appearance.background) ?? 0) >
      (contrastRatio(appearance.accent, appearance.foreground) ?? 0)
      ? appearance.background
      : appearance.foreground;
  const brandKit =
    document.styleRef || document.brandSnapshot || layer.overrides
      ? { fontFamily: appearance.family, primaryColor: appearance.accent, textColor: ink }
      : undefined;
  // The archived presets were authored on a 1080 × 1920 stage.
  const scale = Math.min(width / 1080, height / 1920);
  return (
    <div style={style}>
      <div
        style={{
          position: 'relative',
          width: width / scale,
          height: height / scale,
          transform: 'scale(' + scale + ')',
          transformOrigin: 'top left',
        }}
      >
        <Component {...caption} language="es" brandKit={brandKit} />
      </div>
    </div>
  );
}
