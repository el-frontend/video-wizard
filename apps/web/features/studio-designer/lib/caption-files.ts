import type { CaptionCue } from '@workspace/video-project';
import { checkCue } from './caption-editing';

type Format = 'srt' | 'vtt';
function timestamp(value: string, format: Format) {
  const match = (
    format === 'srt'
      ? /^(\d{2,}):([0-5]\d):([0-5]\d),(\d{3})$/
      : /^(?:(\d{2,}):)?([0-5]\d):([0-5]\d)\.(\d{3})$/
  ).exec(value);
  if (!match) throw new RangeError('Marca de tiempo inválida: ' + value);
  return (
    ((Number(match[1] ?? 0) * 60 + Number(match[2])) * 60 + Number(match[3])) * 1000 +
    Number(match[4])
  );
}
export function parseCaptionFile(text: string, format: Format): CaptionCue[] {
  const blocks = text
    .replace(/^\uFEFF/, '')
    .replace(/\r\n?/g, '\n')
    .trim()
    .split(/\n[ \t]*\n+/);
  if (format === 'vtt') {
    const header = blocks.shift() ?? '';
    if (header.includes('-->'))
      throw new RangeError('Separa la cabecera WEBVTT y los subtítulos con una línea en blanco.');
    if (!/^WEBVTT(?:[ \t].*)?(?:\n|$)/.test(header))
      throw new RangeError('Falta la cabecera WEBVTT.');
  }
  const cues: CaptionCue[] = [];
  for (const block of blocks) {
    if (format === 'vtt' && /^(?:NOTE(?:[ \t\n]|$)|STYLE\n|REGION\n)/.test(block)) continue;
    const lines = block.split('\n');
    if (!lines[0]?.includes('-->')) lines.shift();
    const times = /^(\S+)[ \t]+-->[ \t]+(\S+)(?:[ \t]+.*)?$/.exec(lines.shift() ?? '');
    if (!times)
      throw new RangeError('Intervalo inválido en el subtítulo ' + (cues.length + 1) + '.');
    if (lines.some((line) => /^\S+\s+-->\s+\S+/.test(line)))
      throw new RangeError('Separa cada subtítulo con una línea en blanco.');
    const cue = {
      id: crypto.randomUUID(),
      startMs: timestamp(times[1]!, format),
      endMs: timestamp(times[2]!, format),
      text: lines.join('\n'),
    };
    checkCue(cue);
    cues.push(cue);
  }
  if (!cues.length) throw new RangeError('El archivo debe contener al menos un subtítulo.');
  return cues;
}
function formatTime(ms: number, format: Format) {
  const parts = [Math.floor(ms / 3600000), Math.floor(ms / 60000) % 60, Math.floor(ms / 1000) % 60];
  return (
    parts.map((n) => String(n).padStart(2, '0')).join(':') +
    (format === 'srt' ? ',' : '.') +
    String(ms % 1000).padStart(3, '0')
  );
}
export function serializeCaptionFile(cues: CaptionCue[], format: Format): string {
  const blocks = cues.map((cue, i) => {
    checkCue(cue);
    if (/\n[ \t]*\n/.test(cue.text))
      throw new RangeError('Quita las líneas en blanco dentro del subtítulo para exportarlo.');
    return [
      String(i + 1),
      formatTime(cue.startMs, format) + ' --> ' + formatTime(cue.endMs, format),
      cue.text,
    ].join('\n');
  });
  return (format === 'vtt' ? 'WEBVTT\n\n' : '') + blocks.join('\n\n') + '\n';
}
export async function readCaptionFile(file: File) {
  const extension = file.name.split('.').pop()?.toLowerCase();
  if (extension !== 'srt' && extension !== 'vtt')
    throw new RangeError('Selecciona un archivo SRT o VTT.');
  return parseCaptionFile(await file.text(), extension);
}
