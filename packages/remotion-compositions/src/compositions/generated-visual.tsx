import { createElement, type ReactNode } from 'react';
import { Img, interpolate } from 'remotion';
import type { VisualInput, VisualTag, VisualStyle } from '@workspace/video-project';
type Create = (
  tag: VisualTag,
  attrs: null | { style?: VisualStyle; assetId?: string },
  ...children: ReactNode[]
) => ReactNode;
type Factory = (host: {
  createElement: Create;
  interpolate: typeof interpolate;
}) => (input: VisualInput) => ReactNode;
export function GeneratedVisual({ sourceHash, ...input }: VisualInput & { sourceHash: string }) {
  const modules = (
    globalThis as typeof globalThis & { __studioVisualModules?: Record<string, Factory> }
  ).__studioVisualModules;
  const factory = modules?.[sourceHash];
  if (!factory) throw Error('Falta el módulo visual fijado.');
  const visual: Create = (tag, attrs, ...children) => {
    if (!['div', 'span', 'strong', 'p', 'img'].includes(tag))
      throw Error('Etiqueta visual no admitida.');
    const style: VisualStyle = {};
    for (const [k, v] of Object.entries(attrs?.style ?? {})) {
      if (k === 'fontFamily') {
        if (typeof v !== 'string' || !input.context.fontFamilies.includes(v))
          throw Error('La fuente del componente no está declarada.');
        style[k] = v;
        continue;
      }
      if (
        !/^(color|backgroundColor|fontSize|fontWeight|lineHeight|textAlign|whiteSpace|display|width|height|padding|margin|borderRadius|opacity|transform|alignItems|justifyContent|gap|flexDirection|objectFit)$/.test(
          k
        ) ||
        !['string', 'number'].includes(typeof v) ||
        !/^[-#%.,()\w\s]+$/.test(String(v)) ||
        /url\s*\(|image-set\s*\(/i.test(String(v))
      )
        throw Error('Estilo visual no admitido.');
      style[k] = v;
    }
    if (tag === 'img') {
      const asset = attrs?.assetId && input.context.assets[attrs.assetId];
      if (!asset || !asset.mediaType.startsWith('image/')) throw Error('Imagen no declarada.');
      return <Img src={asset.url} style={style} />;
    }
    return createElement(tag, { style }, ...children);
  };
  return factory({ createElement: visual, interpolate })(input);
}
