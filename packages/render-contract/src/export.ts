import { createHash } from 'node:crypto';
import { z } from 'zod';
import type { ExportSnapshot } from './snapshot';
import type { RenderResult } from './index';
import { videoPlayback } from './video-playback';

// JSONB does not preserve the insertion order of object keys.
export function snapshotDigest(value: unknown) {
  const canonical = JSON.stringify(value, (_key, item: unknown) =>
    item && typeof item === 'object' && !Array.isArray(item)
      ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
      : item
  );
  return createHash('sha256').update(canonical).digest('hex');
}
export function exportTimes(durationMs: number) {
  return [...new Set([0, Math.floor(durationMs / 2)])];
}
const artifact = z.strictObject({
  kind: z.enum(['video', 'snapshot']),
  relativePath: z.string().regex(/^(video\.mp4|frame-[0-9]+\.png)$/),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
});
export const resultSchema = z.strictObject({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  durationMs: z.number().int().positive(),
  hasAudio: z.boolean(),
  artifacts: z.array(artifact),
});
export function hasExportAudio(snapshot: ExportSnapshot) {
  const doc = snapshot.document;
  return [...doc.globalAudio, ...doc.scenes.flatMap((s) => s.layers)].some(
    (l) =>
      l.visible &&
      (l.type === 'audio' || l.type === 'video') &&
      l.volume > 0 &&
      (l.type === 'audio' || snapshot.dependencies.assets[videoPlayback(l).assetId]?.hasAudio)
  );
}

export function verifyRenderResult(snapshot: ExportSnapshot, input: unknown): RenderResult {
  const result = resultSchema.parse(input);
  const doc = snapshot.document;
  const expected = [
    'video.mp4',
    ...exportTimes(doc.durationMs).map((t) => 'frame-' + t + '.png'),
  ].sort();
  if (Math.abs(result.durationMs - doc.durationMs) > 1000 / doc.canvas.fps + 1)
    throw Error(
      'La duración medida del MP4 (' +
        result.durationMs +
        ' ms) difiere de la revisión (' +
        doc.durationMs +
        ' ms).'
    );
  if (result.width !== doc.canvas.width || result.height !== doc.canvas.height)
    throw Error('Las dimensiones medidas del MP4 difieren del lienzo guardado.');
  if (result.hasAudio !== hasExportAudio(snapshot))
    throw Error('Las pistas de audio del MP4 difieren de la revisión.');
  if (
    result.artifacts.some((a) => (a.kind === 'video') !== (a.relativePath === 'video.mp4')) ||
    expected.join(',') !==
      result.artifacts
        .map((a) => a.relativePath)
        .sort()
        .join(',')
  ) {
    throw Error('El archivo generado no coincide con el proyecto guardado.');
  }
  return result;
}
