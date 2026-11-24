import { type ExportSnapshot, type ResolvedAsset, videoPlayback } from '@workspace/render-contract';
import { checkFontWeight, fontWeightRange } from '@workspace/render-contract/font';
import type { Diagnostic } from '@workspace/video-project';
import { runProcess } from './process';

type Stream = { pix_fmt?: string; nb_read_packets?: string; tags?: { alpha_mode?: string } };

async function inspectPicture(file: string, gif: boolean, signal: AbortSignal): Promise<Stream> {
  const output = await runProcess(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-select_streams',
      'v:0',
      ...(gif ? ['-read_intervals', '%+#2', '-count_packets'] : []),
      '-show_entries',
      'stream=pix_fmt,nb_read_packets:stream_tags=alpha_mode',
      '-of',
      'json',
      file,
    ],
    { signal }
  );
  return JSON.parse(output).streams[0] ?? {};
}

export async function mediaDiagnostics(
  snapshot: ExportSnapshot,
  path: (asset: ResolvedAsset) => Promise<string>,
  signal: AbortSignal
) {
  const diagnostics: Diagnostic[] = [];
  const assets = snapshot.dependencies.assets;
  const fonts = new Map<string, Awaited<ReturnType<typeof fontWeightRange>>>();
  for (const entry of Object.values(snapshot.dependencies.libraries)) {
    if (!('fonts' in entry)) continue;
    for (const binding of entry.fonts ?? []) {
      const asset = assets[binding.assetId]!;
      const file = await path(asset);
      try {
        const range = fonts.get(asset.hash) ?? (await fontWeightRange(file, asset.hash));
        fonts.set(asset.hash, range);
        checkFontWeight(range, binding.weight);
      } catch (error) {
        diagnostics.push({
          code: 'native-font',
          severity: 'error',
          message:
            binding.family + ': ' + (error instanceof Error ? error.message : 'Fuente no válida.'),
        });
      }
    }
  }
  const streams = new Map<string, Stream>();
  let formats: { name: string; flags: { alpha: number } }[] | undefined;
  for (const scene of snapshot.document.scenes) {
    for (const layer of scene.layers) {
      if (!layer.visible || (layer.type !== 'image' && layer.type !== 'video')) continue;
      const asset = assets[layer.type === 'video' ? videoPlayback(layer).assetId : layer.assetId]!;
      const gif = asset.mediaType === 'image/gif';
      if (layer.type === 'image' && !gif) continue;
      const stream =
        streams.get(asset.hash) ?? (await inspectPicture(await path(asset), gif, signal));
      streams.set(asset.hash, stream);
      const location = { sceneId: scene.id, layerId: layer.id, severity: 'error' as const };
      if (gif && stream.nb_read_packets !== '1')
        diagnostics.push({
          ...location,
          code: 'animated-image',
          message:
            'HyperFrames no puede sincronizar este GIF animado. Vincula un video o una imagen fija.',
        });
      if (layer.type !== 'video') continue;
      if (!formats) {
        const output = await runProcess(
          'ffprobe',
          [
            '-v',
            'error',
            '-show_pixel_formats',
            '-show_entries',
            'pixel_format=name:pixel_format_flags=alpha',
            '-of',
            'json',
          ],
          { signal }
        );
        formats = JSON.parse(output).pixel_formats;
      }
      const pixel = formats?.find((format) => format.name === stream.pix_fmt);
      if (!pixel || pixel.flags.alpha || stream.tags?.alpha_mode === '1')
        diagnostics.push({
          ...location,
          code: 'video-alpha',
          message:
            'HyperFrames no conserva el canal alfa de este video. Vincula una versión compuesta sobre el fondo deseado.',
        });
    }
  }
  return diagnostics;
}
