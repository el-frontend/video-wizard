import { mkdtemp, rename, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { sceneFrames, videoPlayback, type ExportSnapshot } from '@workspace/render-contract';
import { fileHash } from '@workspace/render-contract/storage';
import type { Layer } from '@workspace/video-project';
import type { MaterializedMedia } from './media';
import { runProcess } from './process';

type Sound = { startMs: number; durationMs: number; audioOnly: boolean };

// A native media element is activated on a preview tick. If an audible interval
// falls outside every visual frame, put the audible tracks on one sample clock.
export function interframeSoundtrackPlan({ document, dependencies }: ExportSnapshot) {
  const sounds = new Map<string, Sound>();
  let needsMix = false;
  function add(layer: Layer, startMs: number, noFrame: boolean) {
    if (!layer.visible || (layer.type !== 'audio' && layer.type !== 'video') || layer.volume <= 0)
      return;
    if (layer.type === 'video' && !dependencies.assets[videoPlayback(layer).assetId]?.hasAudio)
      return;
    needsMix ||= noFrame;
    sounds.set(layer.id, {
      startMs,
      durationMs: layer.endMs - layer.startMs,
      audioOnly: layer.type === 'audio' || noFrame,
    });
  }
  for (const [i, range] of sceneFrames(document).entries()) {
    for (const layer of document.scenes[i]!.layers) {
      const start = range.originMs + layer.startMs;
      const firstFrame = Math.floor((start * document.canvas.fps) / 1000);
      add(layer, start, firstFrame >= range.from + range.durationInFrames);
    }
  }
  for (const layer of document.globalAudio) add(layer, layer.startMs, false);
  return needsMix ? sounds : undefined;
}

export async function mixSoundtrack(
  plan: Map<string, Sound>,
  media: Map<string, MaterializedMedia>,
  durationMs: number,
  directory: string,
  signal: AbortSignal,
  channels: (src: string) => Promise<number>
) {
  const inputs: string[] = [],
    filters: string[] = [],
    labels: string[] = [];
  const tracks = [];
  for (const [id, { startMs, durationMs: span, audioOnly }] of plan) {
    const { src, sourceInMs, volume } = media.get(id)!;
    const index = labels.length,
      label = '[a' + index + ']';
    inputs.push(
      '-ss',
      String(sourceInMs / 1000),
      '-t',
      String(span / 1000),
      '-vn',
      '-i',
      join(directory, src)
    );
    // The pinned producer duplicates mono and uses FFmpeg's stereo downmix for other layouts.
    const stereo =
      (await channels(src)) === 1
        ? 'pan=stereo|FL=FL+FC|FR=FR+FC'
        : 'aformat=channel_layouts=stereo';
    const segment = [
      stereo,
      // Input seek already makes PTS relative to the cut. Pad a late stream before counting samples.
      'aresample=48000:async=1:first_pts=0',
      'atrim=end_sample=' + span * 48,
      'volume=' + volume,
      'adelay=' + startMs + ':all=1',
    ];
    filters.push('[' + index + ':a:0]' + segment.join(',') + label);
    labels.push(label);
    tracks.push({ id, audioOnly, src, sourceInMs, volume, startMs, durationMs: span });
  }
  const samples = durationMs * 48;
  filters.push(
    labels.join('') +
      'amix=inputs=' +
      labels.length +
      ':normalize=0:duration=longest:dropout_transition=0,apad=whole_len=' +
      samples +
      ',atrim=end_sample=' +
      samples +
      '[mix]'
  );
  const temp = await mkdtemp(join(directory, 'soundtrack-')),
    file = join(temp, 'mix.flac');
  try {
    await runProcess(
      'ffmpeg',
      [
        '-v',
        'error',
        ...inputs,
        '-filter_complex',
        filters.join(';'),
        '-map',
        '[mix]',
        '-c:a',
        'flac',
        '-sample_fmt',
        's32',
        '-bits_per_raw_sample',
        '24',
        '-map_metadata',
        '-1',
        file,
      ],
      { signal }
    );
    const [audio] = JSON.parse(
      await runProcess(
        'ffprobe',
        [
          '-v',
          'error',
          '-select_streams',
          'a:0',
          '-show_entries',
          'stream=codec_name,channels,time_base,duration_ts,bits_per_raw_sample',
          '-of',
          'json',
          file,
        ],
        { signal }
      )
    ).streams;
    if (
      audio?.codec_name !== 'flac' ||
      audio.channels !== 2 ||
      audio.time_base !== '1/48000' ||
      Number(audio.duration_ts) !== samples ||
      Number(audio.bits_per_raw_sample) !== 24
    )
      throw new Error('La pista de audio compartida no tiene el formato o duración del proyecto.');
    const hash = await fileHash(file, signal),
      src = 'media/' + hash + '.flac';
    await rename(file, join(directory, src));
    return { hash, src, durationMs, tracks };
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}
