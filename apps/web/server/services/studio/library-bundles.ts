import { createHash } from 'node:crypto';
import { link, lstat, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { z } from 'zod';

import {
  isFileError,
  openAssetFile,
  resolveStudioDataDir,
  UnsafeAssetPathError,
} from './asset-paths';

const ownerSchema = z.uuid();
const hashSchema = z.string().regex(/^[a-f0-9]{64}$/);

export class LibraryBundleError extends Error {
  constructor() {
    super('El código de la versión no está disponible o está dañado.');
    this.name = 'LibraryBundleError';
  }
}

export function hashBundle(bytes: Uint8Array) {
  return createHash('sha256').update(bytes).digest('hex');
}

export class LibraryBundles {
  constructor(private readonly configuredDataDir?: string) {}

  private async path(ownerId: string, hash: string, create: boolean) {
    if (!ownerSchema.safeParse(ownerId).success || !hashSchema.safeParse(hash).success) {
      throw new LibraryBundleError();
    }

    const root = resolveStudioDataDir(this.configuredDataDir);
    if (create) await mkdir(root, { recursive: true, mode: 0o700 });
    if (!(await lstat(root)).isDirectory()) throw new LibraryBundleError();

    const store = join(await realpath(root), 'library');
    const owner = join(store, ownerId.toLowerCase());
    for (const directory of [store, owner]) {
      if (create) {
        try {
          await mkdir(directory, { mode: 0o700 });
        } catch (error) {
          if (!isFileError(error, 'EEXIST')) throw error;
        }
      }
      if (!(await lstat(directory)).isDirectory()) throw new LibraryBundleError();
    }

    return join(owner, hash);
  }

  private async readVerified(path: string, hash: string) {
    const { file } = await openAssetFile(path);
    try {
      const bytes = await file.readFile();
      if (hashBundle(bytes) !== hash) throw new LibraryBundleError();
      return bytes;
    } finally {
      await file.close();
    }
  }

  async read(ownerId: string, hash: string) {
    try {
      return await this.readVerified(await this.path(ownerId, hash, false), hash);
    } catch (error) {
      if (
        error instanceof UnsafeAssetPathError ||
        isFileError(error, 'ENOENT', 'ELOOP', 'ENOTDIR')
      ) {
        throw new LibraryBundleError();
      }
      throw error;
    }
  }

  async store(ownerId: string, hash: string, bytes: Uint8Array) {
    const path = await this.path(ownerId, hash, true);
    const tempDir = await mkdtemp(join(dirname(path), '.pending-'));
    const temporary = join(tempDir, 'bytes');
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o600 });
      try {
        await link(temporary, path);
      } catch (error) {
        if (!isFileError(error, 'EEXIST')) throw error;
        await this.read(ownerId, hash);
      }
    } finally {
      // A complete shared bundle can outlive an aborted publish and be reused on retry.
      await rm(tempDir, { recursive: true, force: true });
    }
  }
}
