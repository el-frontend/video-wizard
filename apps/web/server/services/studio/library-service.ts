import { isDeepStrictEqual } from 'node:util';
import {
  EngineIdSchema,
  LibraryEntrySchema,
  LibraryKindSchema,
  LibraryRefSchema,
  type EngineId,
  type LibraryEntry,
  type LibraryKind,
  type LibraryRef,
} from '@workspace/video-project';
import { and, asc, desc, eq } from 'drizzle-orm';
import { z } from 'zod';

import type { db } from '@/server/db';
import { studioLibraries } from '@/server/db/schema';
import { ValidationError } from '@/server/lib/utils';

import { AssetNotFoundError, AssetService } from './asset-service';
import { hashBundle, LibraryBundleError, LibraryBundles } from './library-bundles';

export { LibraryBundleError } from './library-bundles';

type LibraryDb = Pick<typeof db, 'select' | 'insert' | 'transaction'>;
const primaryKey = [studioLibraries.ownerId, studioLibraries.id, studioLibraries.version];
const listQuery = z.strictObject({ kind: LibraryKindSchema, engine: EngineIdSchema.optional() });

export class LibraryConflictError extends Error {
  constructor() {
    super('Ya existe esta versión con otro contenido.');
    this.name = 'LibraryConflictError';
  }
}

export class LibraryNotFoundError extends Error {
  constructor() {
    super('Versión de biblioteca no encontrada.');
    this.name = 'LibraryNotFoundError';
  }
}

function versionKey(ownerId: string, { id, version }: LibraryRef) {
  return and(
    eq(studioLibraries.ownerId, ownerId),
    eq(studioLibraries.id, id),
    eq(studioLibraries.version, version)
  );
}

function validRef(ref: LibraryRef) {
  const parsed = LibraryRefSchema.safeParse({ id: ref.id, version: ref.version });
  if (!parsed.success || parsed.data.id.includes('\0')) throw new LibraryNotFoundError();
  return parsed.data;
}

export class LibraryService {
  private readonly assets: AssetService;
  private readonly bundles: LibraryBundles;

  constructor(
    private readonly db: LibraryDb,
    dataDir?: string
  ) {
    this.assets = new AssetService(db, dataDir);
    this.bundles = new LibraryBundles(dataDir);
  }

  private async getRecord(ownerId: string, ref: LibraryRef) {
    const [row] = await this.db
      .select()
      .from(studioLibraries)
      .where(versionKey(ownerId, validRef(ref)));
    if (!row) throw new LibraryNotFoundError();
    return row;
  }

  private async validateAssets(ownerId: string, entry: LibraryEntry) {
    const fonts = new Set('fonts' in entry ? entry.fonts?.map(({ assetId }) => assetId) : []);
    for (const id of new Set(entry.assetIds)) {
      try {
        const asset = await this.assets.get(ownerId, id);
        if (fonts.has(id) && !asset.mediaType.startsWith('font/')) {
          throw new ValidationError(`El recurso ${id} no es una fuente.`);
        }
      } catch (error) {
        if (!(error instanceof AssetNotFoundError)) throw error;
        throw new ValidationError(`El recurso ${id} no está disponible.`);
      }
    }
  }

  async publish(ownerId: string, entry: LibraryEntry, bundle?: Uint8Array): Promise<LibraryEntry> {
    const parsed = LibraryEntrySchema.safeParse(entry);
    if (!parsed.success || parsed.data.id.includes('\0')) {
      throw new ValidationError('La entrada de biblioteca no es válida.');
    }
    entry = parsed.data;
    if (bundle && (entry.kind !== 'component' || !bundle.byteLength)) {
      throw new ValidationError('El archivo de código no es válido para esta entrada.');
    }

    // Snapshot caller-owned bytes before hashing or waiting on another publisher.
    const bytes = bundle && Buffer.from(bundle);
    const bundleHash = bytes ? hashBundle(bytes) : null;
    await this.validateAssets(ownerId, entry);
    const serialized: unknown = JSON.parse(JSON.stringify(entry));

    return this.db.transaction(
      async (tx) => {
        const [inserted] = await tx
          .insert(studioLibraries)
          .values({
            ownerId,
            id: entry.id,
            version: entry.version,
            kind: entry.kind,
            entry,
            bundleHash,
          })
          .onConflictDoNothing({ target: primaryKey })
          .returning({ entry: studioLibraries.entry });

        if (!inserted) {
          const [current] = await tx
            .select()
            .from(studioLibraries)
            .where(versionKey(ownerId, entry));
          if (
            !current ||
            !isDeepStrictEqual(current.entry, serialized) ||
            current.bundleHash !== bundleHash
          ) {
            throw new LibraryConflictError();
          }
          if (bytes && bundleHash) await this.bundles.store(ownerId, bundleHash, bytes);
          return current.entry;
        }

        if (entry.kind === 'component' && entry.manifest.builtin && !bytes) {
          throw new ValidationError('El preset de subtítulos requiere su código original.');
        }
        if (bytes && bundleHash) await this.bundles.store(ownerId, bundleHash, bytes);
        return inserted.entry;
      },
      { isolationLevel: 'read committed' }
    );
  }

  async list(
    ownerId: string,
    query: { kind: LibraryKind; engine?: EngineId }
  ): Promise<LibraryEntry[]> {
    const parsed = listQuery.safeParse(query);
    if (!parsed.success) throw new ValidationError('El filtro de biblioteca no es válido.');
    const { kind, engine } = parsed.data;
    const rows = await this.db
      .select({ entry: studioLibraries.entry })
      .from(studioLibraries)
      .where(and(eq(studioLibraries.ownerId, ownerId), eq(studioLibraries.kind, kind)))
      .orderBy(asc(studioLibraries.id), desc(studioLibraries.version));
    const entries = rows.map(({ entry }) => entry);
    if (!engine) return entries;
    return entries.filter((entry) => {
      if (entry.kind === 'brand') return true;
      if (entry.kind === 'style') return entry.engines?.includes(engine) ?? false;
      return entry.engine === engine;
    });
  }

  async get(ownerId: string, ref: LibraryRef): Promise<LibraryEntry> {
    return (await this.getRecord(ownerId, ref)).entry;
  }

  async readBundle(ownerId: string, ref: LibraryRef): Promise<Buffer> {
    const { bundleHash, ownerId: storedOwnerId } = await this.getRecord(ownerId, ref);
    if (!bundleHash) throw new LibraryBundleError();
    return this.bundles.read(storedOwnerId, bundleHash);
  }
}
