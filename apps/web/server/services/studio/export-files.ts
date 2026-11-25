import { createHash } from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { mkdir, realpath, rename, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { openAssetFile, resolveStudioDataDir } from '@workspace/render-contract/storage';
import { verifyRenderResult } from '@workspace/render-contract/export';
import type { ExportSnapshot, RenderResult } from '@workspace/render-contract';
import { z } from 'zod';

const runtime = () =>
  resolve(process.env.STUDIO_EXPORT_DIR || join(resolveStudioDataDir(), 'export-runtime'));
function ids(...values: string[]) {
  return values.map((v) => z.uuid().parse(v));
}
export function publishedDirectory(
  owner: string,
  project: string,
  revision: string,
  job: string,
  attempt: string
) {
  return join(runtime(), 'published', ...ids(owner, project, revision, job, attempt));
}
export async function preparePublication(
  owner: string,
  job: string,
  attempt: string,
  snapshot: ExportSnapshot,
  snapshotHash: string,
  raw: RenderResult,
  signal: AbortSignal
) {
  const result = verifyRenderResult(snapshot, raw);
  const root = runtime();
  const source = join(root, 'staging', ...ids(job, attempt));
  if ((await realpath(source)) !== join(await realpath(root), 'staging', job, attempt))
    throw Error('Directorio de intento no válido.');
  const dest = publishedDirectory(owner, snapshot.document.id, snapshot.revision, job, attempt);
  const ready = join(root, 'incoming', ...ids(job, attempt));
  await mkdir(dirname(ready), { recursive: true, mode: 0o700 });
  await mkdir(ready, { mode: 0o700 });
  try {
    for (const a of result.artifacts) {
      signal.throwIfAborted();
      const { file } = await openAssetFile(join(source, a.relativePath));
      try {
        if (a.kind === 'snapshot') {
          const header = Buffer.alloc(24);
          const { bytesRead } = await file.read(header, 0, 24, 0);
          if (
            bytesRead !== 24 ||
            header.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a' ||
            header.readUInt32BE(16) !== result.width ||
            header.readUInt32BE(20) !== result.height
          )
            throw Error('La captura tiene dimensiones no válidas.');
        }
        const hash = createHash('sha256');
        await pipeline(
          file.createReadStream(),
          new Transform({
            transform(chunk: Buffer, _enc, cb) {
              hash.update(chunk);
              cb(null, chunk);
            },
          }),
          createWriteStream(join(ready, a.relativePath), { flags: 'wx', mode: 0o600 }),
          { signal }
        );
        if (hash.digest('hex') !== a.sha256)
          throw Error('El hash del archivo generado no coincide.');
      } finally {
        await file.close();
      }
    }
    const manifest = JSON.stringify({
      version: 1,
      projectId: snapshot.document.id,
      revision: snapshot.revision,
      jobId: job,
      attemptId: attempt,
      engine: snapshot.document.engine,
      snapshotHash,
      dependencies: snapshot.dependencies,
      bundles: Object.fromEntries(
        Object.entries(snapshot.bundles).map(([key, b]) => [key, b.sha256])
      ),
      ...result,
    });
    const manifestHash = createHash('sha256').update(manifest).digest('hex');
    await writeFile(join(ready, 'manifest.json'), manifest, { flag: 'wx', mode: 0o600 });
    await mkdir(dirname(dest), { recursive: true, mode: 0o700 });
    return {
      published: { result, manifestHash },
      rename: () => rename(ready, dest),
      cleanup: () => rm(ready, { force: true, recursive: true }),
    };
  } catch (e) {
    await rm(ready, { force: true, recursive: true });
    throw e;
  }
}
export async function removeStoppedWorkspace(job: string, attempt: string) {
  await rm(join(runtime(), 'staging', ...ids(job, attempt)), { recursive: true, force: true });
}
