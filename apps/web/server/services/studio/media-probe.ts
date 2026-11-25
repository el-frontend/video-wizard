import { execFile, spawn } from 'node:child_process';
import { open } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { promisify } from 'node:util';

import { ValidationError } from '@/server/lib/utils';

import { isFileError } from './asset-paths';

const execute = promisify(execFile);
const PROBE_TIMEOUT_MS = 30_000;
const EBML_HEADER_ID = 0x1a45dfa3;
const EBML_DOC_TYPE_ID = 0x4282;
const WEBM_VIDEO_CODECS = new Set(['vp8', 'vp9', 'av1']);
const WEBM_AUDIO_CODECS = new Set(['vorbis', 'opus']);
const MEDIA_FORMAT = {
  'video/mp4': 'mov',
  'video/quicktime': 'mov',
  'video/webm': 'matroska',
  'video/x-msvideo': 'avi',
  'video/avi': 'avi',
  'video/msvideo': 'avi',
  'video/vnd.avi': 'avi',
  'video/x-matroska': 'matroska',
  'video/mpeg': 'mpeg',
  'video/mp2t': 'mpegts',
  'video/x-ms-wmv': 'asf',
  'video/x-flv': 'flv',
  'video/vnd.rn-realvideo': 'rm',
  'video/x-pn-realvideo': 'rm',
  'video/mxf': 'mxf',
  'video/ogg': 'ogg',
  'video/x-m4v': 'mov',
  'video/3gpp': 'mov',
  'video/3gpp2': 'mov',
  'audio/webm': 'matroska',
  'audio/mpeg': 'mp3',
  'audio/mp4': 'mov',
  'audio/aac': 'aac',
  'audio/wav': 'wav',
  'audio/ogg': 'ogg',
  'audio/flac': 'flac',
  'image/png': 'png_pipe',
  'image/jpeg': 'jpeg_pipe',
  'image/webp': 'webp_pipe',
  'image/gif': 'gif',
} as const;
const FORMATS = [...new Set(Object.values(MEDIA_FORMAT))];
const IMAGE_FORMATS = new Set<string>([
  MEDIA_FORMAT['image/png'],
  MEDIA_FORMAT['image/jpeg'],
  MEDIA_FORMAT['image/webp'],
  MEDIA_FORMAT['image/gif'],
]);
const PROBE_ARGS = [
  '-v',
  'error',
  '-protocol_whitelist',
  'file',
  '-format_whitelist',
  FORMATS.join(','),
];

type MediaType = keyof typeof MEDIA_FORMAT;
interface ProbeStream {
  index: number;
  codec_type: string;
  codec_name?: string;
  width?: number;
  height?: number;
  disposition?: { attached_pic?: number; timed_thumbnails?: number };
}
interface ProbeResult {
  streams: ProbeStream[];
  format: { format_name: string; start_time?: string; duration?: string };
}
interface MediaMetadata {
  durationMs?: number;
  width?: number;
  height?: number;
  hasAudio: boolean;
}

export function isProbedMediaType(value: string): value is MediaType {
  return Object.hasOwn(MEDIA_FORMAT, value);
}

function readEbmlInteger(bytes: Buffer, offset: number, kind: 'id' | 'size') {
  const first = bytes[offset];
  if (!first) return undefined;
  let width = 1;
  let marker = 0x80;
  while ((first & marker) === 0) {
    width += 1;
    marker >>= 1;
  }
  if (offset + width > bytes.length || (kind === 'id' && width > 4)) return undefined;

  let value = kind === 'id' ? first : first & (marker - 1);
  for (let index = 1; index < width; index++) value = value * 256 + bytes[offset + index]!;
  if (!Number.isSafeInteger(value) || (kind === 'size' && value === 2 ** (7 * width) - 1)) {
    return undefined;
  }
  return { value, next: offset + width };
}

async function hasWebmDocType(path: string) {
  // ffprobe uses one demuxer for both document types. Read the EBML Header (RFC 8794).
  const file = await open(path, 'r');
  const bytes = Buffer.alloc(12); // Up to four ID and eight size bytes.
  try {
    const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
    if (bytesRead < 5 || bytes.readUInt32BE(0) !== EBML_HEADER_ID) return false;
    const header = readEbmlInteger(bytes.subarray(0, bytesRead), 4, 'size');
    const fileSize = (await file.stat()).size;
    if (!header || !Number.isSafeInteger(fileSize) || header.value > fileSize - header.next) {
      return false;
    }

    const end = header.next + header.value;
    let foundDocType = false;
    for (let offset = header.next; offset < end; ) {
      const { bytesRead } = await file.read(bytes, 0, Math.min(bytes.length, end - offset), offset);
      const chunk = bytes.subarray(0, bytesRead);
      const id = readEbmlInteger(chunk, 0, 'id');
      if (!id) return false;
      const size = readEbmlInteger(chunk, id.next, 'size');
      if (!size || size.value > end - offset - size.next) return false;
      const valueStart = offset + size.next;
      offset = valueStart + size.value;
      if (id.value !== EBML_DOC_TYPE_ID) continue;
      if (foundDocType || size.value < 4) return false;

      // EBML strings end at the first NUL, so only a possible terminator is needed.
      const length = Math.min(5, size.value);
      const docType = await file.read(bytes, 0, length, valueStart);
      if (
        docType.bytesRead !== length ||
        bytes.toString('latin1', 0, 4) !== 'webm' ||
        (length === 5 && bytes[4] !== 0)
      ) {
        return false;
      }
      foundDocType = true;
    }
    return foundDocType;
  } finally {
    await file.close();
  }
}

function seconds(value?: string) {
  if (value === undefined || value === '') return undefined;
  const timestamp = Number(value);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

async function packetDuration(path: string, streamIndices: Set<string>, start?: number) {
  // Consume incrementally so recorded media can be scanned without buffering its packet list.
  const child = spawn(
    'ffprobe',
    [
      ...PROBE_ARGS,
      '-show_entries',
      'packet=stream_index,pts_time,dts_time,duration_time',
      '-of',
      'compact=p=0',
      '-i',
      path,
    ],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  );
  const exit = new Promise<number | null>((resolve, reject) => {
    child.once('close', resolve);
    child.once('error', reject);
  });
  // A spawn error may happen before stdout has finished closing.
  void exit.catch(() => {});
  const lines = createInterface({ input: child.stdout, crlfDelay: Infinity });
  const timeout = setTimeout(() => child.kill('SIGKILL'), PROBE_TIMEOUT_MS);
  let first = Infinity;
  let end = -Infinity;

  try {
    for await (const line of lines) {
      const fields = Object.fromEntries(line.split('|').map((part) => part.split('=')));
      if (!streamIndices.has(fields.stream_index ?? '')) continue;
      const timestamp = seconds(fields.pts_time) ?? seconds(fields.dts_time);
      if (timestamp === undefined) continue;
      first = Math.min(first, timestamp);
      end = Math.max(end, timestamp + (seconds(fields.duration_time) ?? 0));
    }
    if ((await exit) !== 0) throw new Error('ffprobe could not read packets');
    return end - (start ?? first);
  } finally {
    clearTimeout(timeout);
    lines.close();
    child.kill('SIGKILL');
  }
}

export async function mediaProbe(path: string, mediaType?: MediaType): Promise<MediaMetadata> {
  try {
    const { stdout } = await execute(
      'ffprobe',
      [
        ...PROBE_ARGS,
        '-show_entries',
        'stream=index,codec_type,codec_name,width,height:stream_disposition=attached_pic,timed_thumbnails:format=format_name,duration,start_time',
        '-of',
        'json',
        '-i',
        path,
      ],
      { timeout: PROBE_TIMEOUT_MS, killSignal: 'SIGKILL' }
    );
    const { streams, format }: ProbeResult = JSON.parse(stdout);
    const formats = format.format_name.split(',');
    const videos = streams.filter(
      (stream) =>
        stream.codec_type === 'video' &&
        !stream.disposition?.attached_pic &&
        !stream.disposition?.timed_thumbnails
    );
    const [video] = videos;
    const audio = streams.filter((stream) => stream.codec_type === 'audio');
    const isImage = formats.some((name) => IMAGE_FORMATS.has(name));
    const hasAudio = audio.length > 0;
    if (
      mediaType &&
      (!formats.includes(MEDIA_FORMAT[mediaType]) ||
        (mediaType.startsWith('audio/') ? !hasAudio || video : !video))
    ) {
      throw new Error('Declared media type does not match the file');
    }
    if (
      (mediaType === 'audio/webm' || mediaType === 'video/webm') &&
      (videos.some(({ codec_name }) => !WEBM_VIDEO_CODECS.has(codec_name ?? '')) ||
        audio.some(({ codec_name }) => !WEBM_AUDIO_CODECS.has(codec_name ?? '')) ||
        !(await hasWebmDocType(path)))
    ) {
      throw new Error('Declared WebM does not have a WebM document type and compatible tracks');
    }
    if (!video && !hasAudio) throw new Error('No audio or video stream');
    const metadata: MediaMetadata = { hasAudio };
    if (video) {
      const { width, height } = video;
      if (!width || !height || width < 1 || height < 1) throw new Error('Invalid dimensions');
      Object.assign(metadata, { width, height });
    }
    if (!isImage) {
      let duration = seconds(format.duration);
      if (!duration || duration <= 0) {
        const indices = new Set([...audio, ...videos].map((stream) => String(stream.index)));
        duration = await packetDuration(path, indices, seconds(format.start_time));
      }
      const milliseconds = Math.round(duration * 1000);
      if (!Number.isSafeInteger(milliseconds) || duration <= 0) throw new Error('Invalid duration');
      metadata.durationMs = Math.max(1, milliseconds);
    }
    return metadata;
  } catch (error) {
    if (isFileError(error, 'ENOENT'))
      throw new Error('ffprobe is required for Studio media uploads.');
    throw new ValidationError('El archivo no es válido o no coincide con el tipo indicado.');
  }
}
