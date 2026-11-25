import { createHash, randomUUID } from 'node:crypto';
import { createWriteStream, type BigIntStats } from 'node:fs';
import { link, mkdtemp, open, readFile, rm, type FileHandle } from 'node:fs/promises';
import { join } from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { ReadableStream } from 'node:stream/web';
import { AssetDescriptorSchema, type AssetRecord, type Diagnostic } from '@workspace/video-project';
import { and, asc, eq, gt, like } from 'drizzle-orm';
import { z } from 'zod';

import type { db } from '@/server/db';
import { studioAssets } from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';

import {
  assetLocator,
  assetPath,
  incomingDirectory,
  isFileError,
  openAssetFile,
  resolveStudioDataDir,
  UnsafeAssetPathError,
} from './asset-paths';
import { isProbedMediaType, mediaProbe } from './media-probe';

const uuid = z.uuid();
const MAX_JSON_BYTES = 16 * 1024 * 1024;
const MAX_VERIFIED_ASSETS = 256;
const FONT_SIGNATURES = new Map([
  ['font/ttf', '\x00\x01\x00\x00'],
  ['font/otf', 'OTTO'],
  ['font/woff', 'wOFF'],
  ['font/woff2', 'wOF2'],
]);

type AssetDb = Pick<typeof db, 'select' | 'insert'>;
type StoredAsset = typeof studioAssets.$inferSelect;
interface AssetInput {
  stream: AsyncIterable<Uint8Array> | ReadableStream<Uint8Array>;
  filename: string;
  mediaType: string;
}

export class AssetNotFoundError extends Error {
  constructor() {
    super('Recurso no encontrado.');
    this.name = 'AssetNotFoundError';
  }
}

class AssetCorruptError extends AssetNotFoundError {
  constructor() {
    super();
    this.name = 'AssetCorruptError';
  }
}

function toRecord(asset: StoredAsset): AssetRecord {
  return {
    id: asset.id,
    ownerId: asset.ownerId,
    hash: asset.hash,
    name: asset.name,
    mediaType: asset.mediaType,
    locator: assetLocator(asset.ownerId, asset.hash),
    hasAudio: asset.hasAudio,
    ...(asset.durationMs === null ? {} : { durationMs: asset.durationMs }),
    ...(asset.width === null ? {} : { width: asset.width }),
    ...(asset.height === null ? {} : { height: asset.height }),
  };
}

async function hashFile(file: FileHandle, signal?: AbortSignal) {
  const hash = createHash('sha256');
  for await (const chunk of file.createReadStream({ start: 0, autoClose: false, signal }))
    hash.update(chunk);
  return hash.digest('hex');
}

function fileFingerprint(stat: BigIntStats) {
  return `${stat.dev}:${stat.ino}:${stat.size}:${stat.mtimeNs}:${stat.ctimeNs}`;
}

async function isFontFile(path: string, mediaType: string, fileSize: number) {
  const file = await open(path, 'r');
  try {
    const header = Buffer.alloc(48);
    const { bytesRead } = await file.read(header, 0, header.length, 0);
    if (bytesRead < 12 || header.toString('ascii', 0, 4) !== FONT_SIGNATURES.get(mediaType)) {
      return false;
    }
    if (mediaType === 'font/woff2') {
      return (
        bytesRead === 48 &&
        fileSize > 48 &&
        header.readUInt32BE(8) === fileSize &&
        header.readUInt16BE(12) > 0 &&
        header.readUInt16BE(14) === 0 &&
        header.readUInt32BE(20) > 0 &&
        header.readUInt32BE(20) < fileSize - 48
      );
    }

    const isWoff = mediaType === 'font/woff';
    if (
      isWoff &&
      (bytesRead < 44 || header.readUInt32BE(8) !== fileSize || header.readUInt16BE(14) !== 0)
    ) {
      return false;
    }
    const count = header.readUInt16BE(isWoff ? 12 : 4);
    const directoryStart = isWoff ? 44 : 12;
    const entrySize = isWoff ? 20 : 16;
    const directoryEnd = directoryStart + count * entrySize;
    if (count === 0 || directoryEnd >= fileSize) return false;
    const directory = Buffer.alloc(count * entrySize);
    if (
      (await file.read(directory, 0, directory.length, directoryStart)).bytesRead !==
      directory.length
    ) {
      return false;
    }
    for (let index = 0; index < directory.length; index += entrySize) {
      const offset = directory.readUInt32BE(index + (isWoff ? 4 : 8));
      const length = directory.readUInt32BE(index + (isWoff ? 8 : 12));
      if (offset < directoryEnd || offset + length > fileSize) return false;
    }
    return true;
  } finally {
    await file.close();
  }
}

async function readMetadata(path: string, mediaType: string, size: number) {
  if (isProbedMediaType(mediaType)) return mediaProbe(path, mediaType);
  if (mediaType === 'application/json') {
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(await readFile(path));
      JSON.parse(text);
    } catch (error) {
      if (!(error instanceof SyntaxError || error instanceof TypeError)) throw error;
      throw new ValidationError('El archivo no contiene JSON válido.');
    }
  } else if (!(await isFontFile(path, mediaType, size))) {
    throw new ValidationError('El archivo de fuente no es válido.');
  }
  return { hasAudio: false };
}

export class AssetService {
  private readonly verifiedFiles = new Map<string, string>();

  constructor(
    private readonly db: AssetDb,
    private readonly configuredDataDir?: string
  ) {}

  private async find(ownerId: string, id: string) {
    if (!uuid.safeParse(id).success) throw new AssetNotFoundError();
    const [asset] = await this.db
      .select()
      .from(studioAssets)
      .where(and(eq(studioAssets.ownerId, ownerId), eq(studioAssets.id, id)));
    if (!asset) throw new AssetNotFoundError();
    return asset;
  }

  async ingest(
    ownerId: string,
    { stream, filename, mediaType }: AssetInput,
    finalize: (register: (db: AssetDb) => Promise<AssetRecord>) => Promise<AssetRecord> = (
      register
    ) => register(this.db)
  ): Promise<AssetRecord> {
    if (
      !filename.trim() ||
      filename === '.' ||
      filename === '..' ||
      /[\\/\p{Cc}]/u.test(filename)
    ) {
      throw new ValidationError('El nombre del archivo no es válido.');
    }
    mediaType = mediaType.split(';', 1)[0]!.trim().toLowerCase();
    if (mediaType === 'audio/x-wav') mediaType = 'audio/wav';
    const isJson = mediaType === 'application/json';
    if (!isProbedMediaType(mediaType) && !FONT_SIGNATURES.has(mediaType) && !isJson) {
      throw new ValidationError('El tipo de archivo no es compatible.');
    }

    const dataDir = resolveStudioDataDir(this.configuredDataDir);
    const temporary = await mkdtemp(join(await incomingDirectory(dataDir), 'upload-'));
    const path = join(temporary, 'bytes');
    const digest = createHash('sha256');
    let sizeBytes = 0;

    try {
      await pipeline(
        stream,
        async function* (chunks: AsyncIterable<Uint8Array>) {
          for await (const chunk of chunks) {
            const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
            sizeBytes += bytes.length;
            if (isJson && sizeBytes > MAX_JSON_BYTES) {
              throw new ValidationError('El archivo JSON supera el límite de 16 MiB.');
            }
            digest.update(bytes);
            yield bytes;
          }
        },
        createWriteStream(path, { flags: 'wx', mode: 0o600 })
      );
      if (sizeBytes === 0) throw new ValidationError('El archivo está vacío.');
      const hash = digest.digest('hex');
      const metadata = await readMetadata(path, mediaType, sizeBytes);
      const destination = await assetPath(dataDir, ownerId, hash, true);

      try {
        // A hard link promotes complete bytes atomically without replacing another upload.
        await link(path, destination);
      } catch (error) {
        if (!isFileError(error, 'EEXIST')) throw error;
        const { file } = await openAssetFile(destination);
        try {
          if ((await hashFile(file)) !== hash) throw new AssetCorruptError();
        } finally {
          await file.close();
        }
      }

      return await finalize(async (db) => {
        const [inserted] = await db
          .insert(studioAssets)
          .values({
            id: randomUUID(),
            ownerId,
            hash,
            name: filename,
            mediaType,
            sizeBytes,
            ...metadata,
          })
          .onConflictDoNothing({ target: [studioAssets.ownerId, studioAssets.hash] })
          .returning();
        if (inserted) return toRecord(inserted);

        const [existing] = await db
          .select()
          .from(studioAssets)
          .where(and(eq(studioAssets.ownerId, ownerId), eq(studioAssets.hash, hash)));
        if (!existing) throw new Error('Studio asset was removed during ingestion.');
        return toRecord(existing);
      });
    } finally {
      // Leave promoted bytes intact on database failure so another upload can claim them safely.
      await rm(temporary, { recursive: true, force: true });
    }
  }

  async list(ownerId: string, cursor?: string, media?: string) {
    if (cursor !== undefined && !uuid.safeParse(cursor).success)
      throw new ValidationError('Cursor de recursos inválido.');
    if (media !== undefined && !['audio', 'video', 'image', 'font'].includes(media))
      throw new ValidationError('Tipo de recurso inválido.');
    const rows = await this.db
      .select()
      .from(studioAssets)
      .where(
        and(
          eq(studioAssets.ownerId, ownerId),
          cursor ? gt(studioAssets.id, cursor) : undefined,
          media ? like(studioAssets.mediaType, media + '/%') : undefined
        )
      )
      .orderBy(asc(studioAssets.id))
      .limit(26);
    const items = rows
      .slice(0, 25)
      .map((row) => AssetDescriptorSchema.strip().parse(toRecord(row)));
    return { items, nextCursor: rows.length > 25 ? items[24]!.id : null };
  }

  async get(ownerId: string, id: string): Promise<AssetRecord> {
    return toRecord(await this.find(ownerId, id));
  }

  private async openStoredFile(asset: StoredAsset, signal?: AbortSignal) {
    try {
      const path = await assetPath(
        resolveStudioDataDir(this.configuredDataDir),
        asset.ownerId,
        asset.hash
      );
      const { file, stat } = await openAssetFile(path);
      try {
        if (stat.size !== BigInt(asset.sizeBytes)) throw new AssetCorruptError();
        const fingerprint = fileFingerprint(stat);
        if (this.verifiedFiles.get(path) !== fingerprint) {
          // Verify the opened file and discard results if it changed during hashing.
          if (
            (await hashFile(file, signal)) !== asset.hash ||
            fileFingerprint(await file.stat({ bigint: true })) !== fingerprint
          ) {
            throw new AssetCorruptError();
          }
          this.verifiedFiles.set(path, fingerprint);
          if (this.verifiedFiles.size > MAX_VERIFIED_ASSETS) {
            const oldest = this.verifiedFiles.keys().next();
            if (!oldest.done) this.verifiedFiles.delete(oldest.value);
          }
        }
        return { file, size: asset.sizeBytes, path };
      } catch (error) {
        await file.close();
        throw error;
      }
    } catch (error) {
      if (isFileError(error, 'ENOENT')) throw new AssetNotFoundError();
      if (error instanceof UnsafeAssetPathError || isFileError(error, 'ELOOP', 'ENOTDIR')) {
        throw new AssetCorruptError();
      }
      throw error;
    }
  }

  async resolveFile(ownerId: string, id: string, signal?: AbortSignal): Promise<string> {
    const { file, path } = await this.openStoredFile(await this.find(ownerId, id), signal);
    await file.close();
    return path;
  }

  async openFile(ownerId: string, id: string) {
    const asset = await this.find(ownerId, id);
    const { file, size } = await this.openStoredFile(asset);
    return { asset: toRecord(asset), file, size };
  }

  async verify(ownerId: string, ids: string[], signal?: AbortSignal): Promise<Diagnostic[]> {
    const diagnostics: Diagnostic[] = [];
    for (const id of new Set(ids)) {
      try {
        signal?.throwIfAborted();
        await this.resolveFile(ownerId, id, signal);
      } catch (error) {
        if (!(error instanceof AssetNotFoundError)) throw error;
        diagnostics.push(
          error instanceof AssetCorruptError
            ? { severity: 'error', code: 'asset-corrupt', message: `El recurso ${id} está dañado.` }
            : { severity: 'error', code: 'asset-missing', message: `Falta el recurso ${id}.` }
        );
      }
    }
    return diagnostics;
  }
}
