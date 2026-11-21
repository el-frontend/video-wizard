import { createHash } from 'node:crypto';
import { rename } from 'node:fs/promises';
import { join } from 'node:path';
import { type ExportSnapshot, type ResolvedAsset, videoPlayback } from '@workspace/render-contract';
import { fileHash, stageMedia } from '@workspace/render-contract/storage';
import { runProcess } from './process';

const extensions: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/avif': 'avif',
  'audio/wav': 'wav',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'm4a',
  'audio/aac': 'aac',
  'audio/ogg': 'ogg',
  'audio/webm': 'webm',
  'audio/flac': 'flac',
  'video/mp4': 'mp4',
  'video/quicktime': 'mov',
  'video/webm': 'webm',
  'video/x-matroska': 'mkv',
  'font/woff2': 'woff2',
  'font/woff': 'woff',
  'font/ttf': 'ttf',
  'font/otf': 'otf',
};
export function mediaFilename(asset: ResolvedAsset) {
  // FFmpeg probes legacy containers by content; only standard browser media go directly into the timeline.
  const extension = extensions[asset.mediaType] ?? 'bin';
  return asset.hash + '.' + extension;
}
export interface MaterializedMedia {
  src: string;
  sourceInMs: number;
  volume: number;
  derivative?: {
    hash: string;
    durationMs: number;
    sourceHash: string;
    sourceInMs: number;
    gain: number;
  };
}
export async function materialize(
  snapshot: ExportSnapshot,
  directory: string,
  dataDir: string | undefined,
  signal: AbortSignal
) {
  await stageMedia(snapshot, join(directory, 'media'), dataDir, signal, mediaFilename);
  const layers = new Map<string, MaterializedMedia>();
  const streams = new Map<string, { codec_type: string; codec_name: string; pix_fmt?: string }[]>();
  async function codecs(src: string) {
    let result = streams.get(src);
    if (!result) {
      const output = await runProcess(
        'ffprobe',
        [
          '-v',
          'error',
          '-show_entries',
          'stream=codec_type,codec_name,pix_fmt',
          '-of',
          'json',
          join(directory, src),
        ],
        { signal }
      );
      result = JSON.parse(output).streams;
      if (!result) throw new Error('No se pudieron medir los códecs del recurso.');
      streams.set(src, result);
    }
    return result;
  }
  for (const layer of [
    ...snapshot.document.scenes.flatMap((s) => s.layers),
    ...snapshot.document.globalAudio,
  ]) {
    if (!layer.visible || !('assetId' in layer)) continue;
    const selected = layer.type === 'video' ? videoPlayback(layer) : layer;
    const asset = snapshot.dependencies.assets[selected.assetId]!;
    const src = 'media/' + mediaFilename(asset);
    const sourceInMs = 'sourceInMs' in selected ? selected.sourceInMs : 0;
    const volume = 'volume' in layer ? layer.volume : 0;
    // HTMLMediaElement cannot amplify above unity. Some audio layers reference video containers.
    const needsGain = volume > 1;
    const tracks = layer.type === 'image' ? [] : await codecs(src);
    const sound = tracks.find((s) => s.codec_type === 'audio');
    const picture = tracks.find((s) => s.codec_type === 'video');
    const directAudio =
      (asset.mediaType === 'audio/wav' &&
        ['pcm_s16le', 'pcm_s24le', 'pcm_f32le'].includes(sound?.codec_name ?? '')) ||
      (asset.mediaType === 'audio/mpeg' && sound?.codec_name === 'mp3') ||
      (asset.mediaType === 'audio/mp4' && sound?.codec_name === 'aac');
    const directVideo =
      asset.mediaType === 'video/mp4' &&
      picture?.codec_name === 'h264' &&
      picture.pix_fmt === 'yuv420p' &&
      (!sound || sound.codec_name === 'aac');
    const needsAudio = layer.type === 'audio' && (!directAudio || needsGain);
    const needsVideo = layer.type === 'video' && (!directVideo || needsGain);
    if (!needsAudio && !needsVideo) {
      layers.set(layer.id, { src, sourceInMs, volume });
      continue;
    }
    const duration = (layer.endMs - layer.startMs) / 1000;
    const key = createHash('sha256')
      .update(JSON.stringify([asset.hash, sourceInMs, duration, volume, layer.type]))
      .digest('hex');
    const ext = needsVideo ? 'mp4' : 'wav';
    const temp = join(directory, 'media', key + '.working.' + ext);
    const audio =
      needsVideo && !asset.hasAudio
        ? ['-an']
        : ['-af', 'volume=' + volume, '-c:a', needsVideo ? 'aac' : 'pcm_s24le'];
    const video = needsVideo
      ? ['-map', '0:v:0', '-map', '0:a:0?', '-c:v', 'libx264', '-pix_fmt', 'yuv420p']
      : ['-map', '0:a:0', '-vn'];
    await runProcess(
      'ffmpeg',
      [
        '-v',
        'error',
        '-y',
        '-i',
        join(directory, src),
        '-ss',
        String(sourceInMs / 1000),
        '-t',
        String(duration),
        ...video,
        ...audio,
        '-map_metadata',
        '-1',
        temp,
      ],
      { signal }
    );
    const hash = await fileHash(temp, signal),
      measured = await runProcess(
        'ffprobe',
        ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', temp],
        { signal }
      );
    const durationMs = Math.round(Number(measured.trim()) * 1000);
    if (!Number.isFinite(durationMs) || durationMs <= 0)
      throw new Error('El medio derivado no tiene duración medible.');
    const out = 'media/' + hash + '.' + ext;
    await rename(temp, join(directory, out));
    layers.set(layer.id, {
      src: out,
      sourceInMs: 0,
      volume: 1,
      derivative: { hash, durationMs, sourceHash: asset.hash, sourceInMs, gain: volume },
    });
  }
  return layers;
}
