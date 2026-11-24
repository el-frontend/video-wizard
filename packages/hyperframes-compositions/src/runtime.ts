import {
  libraryKey,
  layerSampleMs,
  projectAppearance,
  sceneFrames,
  type ExportSnapshot,
} from '@workspace/render-contract';
import { containsTime, styleFamily, type Layer } from '@workspace/video-project';
import { mediaFilename, type MaterializedMedia } from './media';

function escape(value: string) {
  return value.replace(
    /[&<>"']/g,
    (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!
  );
}
type Window = { from: number; end: number };
export function nativeDocument(snapshot: ExportSnapshot, media: Map<string, MaterializedMedia>) {
  const { document, dependencies } = snapshot,
    { width, height, fps } = document.canvas;
  const appearance = projectAppearance(document, dependencies);
  const fonts = Object.values(dependencies.libraries).flatMap((entry) =>
    'fonts' in entry ? (entry.fonts ?? []) : []
  );
  const families = [...new Set(fonts.map((f) => f.family))];
  const font = (family: string) =>
    family === 'sans-serif' ? 'sans-serif' : 'StudioFont' + families.indexOf(family);
  const style = document.styleRef && dependencies.libraries[libraryKey(document.styleRef)];
  const family = style?.kind === 'style' ? styleFamily(style)?.id : undefined;
  const total = Math.ceil((document.durationMs * fps) / 1000);
  const blocks: string[] = [],
    motion: string[] = [];
  let serial = 0;
  function attrs(range: Window) {
    return (
      'id="clip-' +
      ++serial +
      '" class="clip" data-start="' +
      range.from +
      '" data-duration="' +
      (range.end - range.from) +
      '" data-track-index="' +
      serial +
      '"'
    );
  }
  function backdrop(range: Window) {
    if (!family) return;
    const id = 'decor-' + serial,
      unit = width / 1080;
    let content = '',
      animation = '';
    if (family === 'noticias-liquid-glass') {
      content =
        '<div data-decoration="' +
        id +
        '" style="position:absolute;inset:0;background:radial-gradient(ellipse at 22% 12%,#A5C4FF,transparent 54%),radial-gradient(ellipse at 90% 80%,#B9E8D1,transparent 48%)"></div><div style="position:absolute;inset:' +
        24 * unit +
        'px;border-radius:' +
        48 * unit +
        'px;border:1px solid #ffffffbb;background:linear-gradient(135deg,#ffffff99,#ffffff22)"></div>';
      animation =
        '{x:0},{x:' +
        8 * unit +
        ',ease:"sine.inOut",yoyo:true,repeat:1,duration:' +
        (range.end - range.from) / 2 +
        '}';
    } else {
      const web = family === 'noticias-elfrontend-web';
      if (web)
        content =
          '<div style="position:absolute;inset:' +
          16 * unit +
          'px;border:1px solid #0002;border-radius:' +
          32 * unit +
          'px;background:' +
          appearance.surface +
          '"></div>';
      else
        content =
          '<div style="position:absolute;right:0;bottom:0;width:' +
          160 * unit +
          'px;height:' +
          160 * unit +
          'px;border:1px solid ' +
          appearance.foreground +
          ';opacity:.4;border-radius:100%"></div>';
      content +=
        '<div data-decoration="' +
        id +
        '" style="position:absolute;' +
        (web ? 'bottom:' + 16 * unit + 'px;left:3%;width:93%' : 'top:0;left:0;width:100%') +
        ';height:' +
        (web ? 5 : 9) * unit +
        'px;background:' +
        appearance.accent +
        ';transform-origin:left"></div>';
      animation = '{scaleX:0.06},{scaleX:1,ease:"none",duration:' + (range.end - range.from) + '}';
    }
    blocks.push(content.replaceAll('<div ', () => '<div ' + attrs(range) + ' '));
    motion.push(
      'tl.fromTo(' +
        JSON.stringify('[data-decoration="' + id + '"]') +
        ',' +
        animation +
        ',' +
        range.from +
        ');'
    );
  }
  function add(layer: Layer, origin: number, bounds: Window, headline = '') {
    if (!layer.visible) return;
    const start = origin + layer.startMs,
      end = origin + layer.endMs;
    const range = {
      from: Math.max(bounds.from, Math.floor((start * fps) / 1000) / fps),
      end: Math.min(bounds.end, Math.ceil((end * fps) / 1000) / fps),
    };
    if (range.from >= range.end) return;
    const m = media.get(layer.id);
    const box =
      'box' in layer
        ? 'position:absolute;left:' +
          layer.box.x +
          'px;top:' +
          layer.box.y +
          'px;width:' +
          layer.box.width +
          'px;height:' +
          layer.box.height +
          'px;overflow:hidden;'
        : '';
    if (layer.type === 'audio' || layer.type === 'video') {
      const playback = m!;
      const asset =
        dependencies.assets[
          layer.type === 'video' && layer.playbackVariant
            ? layer.playbackVariant.assetId
            : layer.assetId
        ]!;
      const audible = layer.volume > 0 && (layer.type === 'audio' || asset.hasAudio);
      const mediaAttrs = (window: Window, volume: number) =>
        attrs(window) +
        ' src="' +
        playback.src +
        '" data-media-start="' +
        playback.sourceInMs / 1000 +
        '" data-volume="' +
        volume +
        '"';
      // Keep embedded audio sample-accurate even when its picture begins on an earlier frame.
      if (audible) {
        const exact = { from: start / 1000, end: end / 1000 };
        blocks.push('<audio ' + mediaAttrs(exact, playback.volume) + ' preload="auto"></audio>');
      }
      if (layer.type === 'video')
        blocks.push(
          '<video ' +
            mediaAttrs(range, 0) +
            ' playsinline preload="auto" muted' +
            ' style="' +
            box +
            'object-fit:' +
            layer.fit +
            ';object-position:' +
            layer.focalPoint.x * 100 +
            '% ' +
            layer.focalPoint.y * 100 +
            '%"></video>'
        );
      return;
    }
    if (layer.type === 'image') {
      blocks.push(
        '<img ' + attrs(range) + ' src="' + m!.src + '" alt="" style="' + box + 'object-fit:cover">'
      );
      return;
    }
    const look = projectAppearance(document, dependencies, layer);
    const textStyle =
      box +
      'white-space:pre-wrap;overflow-wrap:anywhere;font-family:' +
      font(look.family) +
      ';font-size:' +
      look.size +
      'px;font-weight:' +
      look.weight +
      ';line-height:' +
      look.lineHeight +
      ';color:' +
      look.foreground +
      ';';
    const factory =
      layer.type === 'component' || (layer.type === 'captions' && !!layer.templateRef);
    function label(text: string, r: Window, word?: string) {
      if (r.from >= r.end) return;
      const content = factory
        ? '<span style="display:inline-block;padding:0.12em 0.36em;border-radius:.2em;background:' +
          look.background +
          ';border-left:.12em solid ' +
          look.accent +
          '">' +
          escape(word ?? text) +
          '</span>'
        : escape(text);
      blocks.push(
        '<div ' +
          attrs(r) +
          ' style="' +
          textStyle +
          (factory ? 'display:flex;align-items:center;justify-content:center;' : '') +
          '">' +
          content +
          '</div>'
      );
    }
    if (layer.type !== 'captions') {
      label(layer.type === 'text' ? layer.text : headline, range);
      return;
    }
    // Only cue/word boundaries can change the sampled state. Earliest matching cue wins on overlaps.
    const frames = new Set([Math.round(range.from * fps), Math.round(range.end * fps)]);
    for (const cue of layer.cues) {
      const times = [
        cue.startMs,
        cue.endMs,
        ...(factory
          ? (cue.words ?? []).flatMap((w) => [cue.startMs + w.startMs, cue.startMs + w.endMs])
          : []),
      ];
      for (const t of times) {
        const frame = Math.ceil(((start + t) * fps) / 1000);
        if (frame / fps > range.from && frame / fps < range.end) frames.add(frame);
      }
    }
    const points = [...frames].sort((a, b) => a - b);
    for (let i = 0; i < points.length - 1; i++) {
      const time = layerSampleMs(points[i]!, fps, start);
      const cue = layer.cues.find((c) => containsTime(c, time));
      if (!cue) continue;
      const word = factory
        ? cue.words?.find((w) => containsTime(w, time - cue.startMs))?.text
        : undefined;
      label(cue.text, { from: points[i]! / fps, end: points[i + 1]! / fps }, word);
    }
  }
  const frames = sceneFrames(document);
  for (const [i, scene] of document.scenes.entries()) {
    const { from, originMs, durationInFrames } = frames[i]!;
    if (!durationInFrames) continue;
    const bounds = { from: from / fps, end: (from + durationInFrames) / fps };
    backdrop(bounds);
    for (const layer of [...scene.layers].sort((a, b) => a.zIndex - b.zIndex))
      add(layer, originMs, bounds, scene.editorial?.headline);
  }
  for (const layer of document.globalAudio) add(layer, 0, { from: 0, end: total / fps });
  const faces = fonts
    .map(
      (f) =>
        '@font-face{font-family:' +
        font(f.family) +
        ';font-weight:' +
        f.weight.min +
        ' ' +
        f.weight.max +
        ';src:url("media/' +
        mediaFilename(dependencies.assets[f.assetId]!) +
        '")}'
    )
    .join('\n');
  // The native checker treats console errors as diagnostics, including an OTS rejection in Chrome.
  const fontCheck = fonts.length
    ? 'Promise.all(Array.from(document.fonts,face=>face.load())).catch(()=>console.error("No se pudo decodificar la fuente vinculada."));\n'
    : '';
  const timeline =
    fontCheck +
    'window.__timelines=window.__timelines||{};const tl=gsap.timeline({paused:true});\n' +
    motion.join('\n') +
    '\nwindow.__timelines["main"]=tl;';
  const html =
    '<!doctype html><html lang="es"><head><meta charset="utf-8"><title>' +
    escape(document.title) +
    '</title><script src="gsap.min.js"></script><style>' +
    faces +
    '\n*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}#main{position:relative;width:100%;height:100%;overflow:hidden;background:' +
    appearance.background +
    '}</style></head><body><main id="main" data-composition-id="main" data-start="0" data-duration="' +
    total / fps +
    '" data-width="' +
    width +
    '" data-height="' +
    height +
    '" data-fps="' +
    fps +
    '">' +
    blocks.join('\n') +
    '</main><script>' +
    timeline +
    '</script></body></html>';
  return { html, timeline };
}
