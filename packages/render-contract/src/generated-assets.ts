import { open } from 'node:fs/promises';
import type { Diagnostic } from '@workspace/video-project';
import type { ExportSnapshot } from './snapshot';
import { assetPath, resolveStudioDataDir } from './storage';

// PNG animation control precedes the first image chunk. Extended WebP flags declare animation.
async function isStatic(path: string, mime: string) {
  if (mime === 'image/jpeg' || mime.startsWith('font/')) return true;
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(22);
    if ((await file.read(header, 0, 22, 0)).bytesRead !== 22) return false;
    if (mime === 'image/webp')
      return (
        header.toString('ascii', 0, 4) === 'RIFF' &&
        header.toString('ascii', 8, 12) === 'WEBP' &&
        (header.toString('ascii', 12, 16) !== 'VP8X' || (header[20]! & 2) === 0)
      );
    if (mime !== 'image/png' || header.readUInt32BE(0) !== 0x89504e47) return false;
    let offset = 8;
    for (let i = 0; i < 4096; i++) {
      if ((await file.read(header, 0, 8, offset)).bytesRead !== 8) return false;
      const type = header.toString('ascii', 4, 8);
      if (type === 'acTL' || type === 'IEND') return false;
      if (type === 'IDAT') return true;
      offset += 12 + header.readUInt32BE(0);
    }
    return false;
  } finally {
    await file.close();
  }
}
export async function generatedAssetDiagnostics(
  snapshot: ExportSnapshot,
  dataDir?: string
): Promise<Diagnostic[]> {
  const ids = new Set(
      Object.values(snapshot.dependencies.libraries).flatMap((e) =>
        e.kind === 'component' && 'schemaVersion' in e.manifest ? e.assetIds : []
      )
    ),
    diagnostics: Diagnostic[] = [];
  for (const id of ids) {
    const asset = snapshot.dependencies.assets[id];
    try {
      if (
        !asset ||
        !(await isStatic(
          await assetPath(resolveStudioDataDir(dataDir), snapshot.ownerId, asset.hash),
          asset.mediaType
        ))
      )
        throw Error();
    } catch {
      diagnostics.push({
        severity: 'error',
        code: 'component-asset',
        message: 'El recurso ' + id + ' debe ser una imagen estática o una fuente verificada.',
      });
    }
  }
  return diagnostics;
}
