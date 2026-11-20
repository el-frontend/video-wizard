import { existsSync, constants } from 'node:fs';
import { lstat, mkdir, open, realpath, type FileHandle } from 'node:fs/promises';
import { dirname, isAbsolute, join, resolve } from 'node:path';
import { z } from 'zod';

const uuid = z.uuid();
const sha256 = /^[a-f0-9]{64}$/;

export class UnsafeAssetPathError extends Error {}

export function resolveStudioDataDir(config = process.env.STUDIO_DATA_DIR, cwd = process.cwd()) {
  if (config && isAbsolute(config)) return resolve(config);

  let directory = resolve(cwd);
  while (!existsSync(join(directory, 'pnpm-workspace.yaml'))) {
    const parent = dirname(directory);
    if (parent === directory) {
      throw new Error('Set STUDIO_DATA_DIR to an absolute path outside the workspace.');
    }
    directory = parent;
  }
  return resolve(directory, config || '.studio-data');
}

export function isFileError(error: unknown, ...codes: string[]) {
  return error instanceof Error && 'code' in error && codes.includes(String(error.code));
}

async function ensureDirectory(path: string, create = false) {
  if (create) {
    try {
      await mkdir(path, { mode: 0o700 });
    } catch (error) {
      if (!isFileError(error, 'EEXIST')) throw error;
    }
  }
  if (!(await lstat(path)).isDirectory()) throw new UnsafeAssetPathError();
  return path;
}

async function assetsDirectory(dataDir: string, create: boolean) {
  if (create) await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await ensureDirectory(dataDir);
  return ensureDirectory(join(await realpath(dataDir), 'assets'), create);
}

export async function incomingDirectory(dataDir: string) {
  return ensureDirectory(join(await assetsDirectory(dataDir, true), '.incoming'), true);
}

export function assetLocator(ownerId: string, hash: string) {
  if (!uuid.safeParse(ownerId).success || !sha256.test(hash)) throw new UnsafeAssetPathError();
  return `assets/${ownerId.toLowerCase()}/${hash}`;
}

export async function assetPath(dataDir: string, ownerId: string, hash: string, create = false) {
  const locator = assetLocator(ownerId, hash);
  const root = dirname(await assetsDirectory(dataDir, create));
  const path = join(root, locator);
  await ensureDirectory(dirname(path), create);
  return path;
}

export async function openAssetFile(path: string) {
  if (!(await lstat(path)).isFile()) throw new UnsafeAssetPathError();
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
  try {
    const stat = await file.stat();
    if (!stat.isFile()) throw new UnsafeAssetPathError();
    return { file, size: stat.size };
  } catch (error) {
    await file.close();
    throw error;
  }
}

export function streamAssetFile(file: FileHandle, start: number, end: number) {
  let position = start;
  let cancelled = false;

  return new ReadableStream<Uint8Array>(
    {
      async pull(controller) {
        try {
          const bytes = new Uint8Array(Math.min(64 * 1024, end - position + 1));
          const { bytesRead } = await file.read(bytes, 0, bytes.length, position);
          if (cancelled) return;
          if (bytesRead === 0) throw new Error('Studio asset ended before its expected length.');

          position += bytesRead;
          controller.enqueue(bytes.subarray(0, bytesRead));
          if (position > end) {
            await file.close();
            if (!cancelled) controller.close();
          }
        } catch (error) {
          await file.close();
          if (!cancelled) throw error;
        }
      },
      cancel() {
        // A pending read can finish after Chrome aborts to seek to another byte range.
        cancelled = true;
        return file.close();
      },
    },
    { highWaterMark: 0 }
  );
}
