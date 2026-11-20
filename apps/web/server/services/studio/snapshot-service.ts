import { createHash } from 'node:crypto';
import { libraryKey, projectPins, type ExportSnapshot } from '@workspace/render-contract';
import { AssetDescriptorSchema, type ProjectRecord } from '@workspace/video-project';
import { AssetNotFoundError, AssetService } from './asset-service';
import { LibraryBundleError, LibraryNotFoundError, LibraryService } from './library-service';
import { ProjectNotFoundError } from './project-service';

const descriptor = AssetDescriptorSchema.omit({ ownerId: true }).strip();

export function snapshotBuilder(
  assets: Pick<AssetService, 'get' | 'verify'>,
  library: Pick<LibraryService, 'get' | 'readBundle'>
) {
  return async function buildSnapshot(
    ownerId: string,
    record: ProjectRecord
  ): Promise<ExportSnapshot> {
    if (record.ownerId !== ownerId) throw new ProjectNotFoundError();
    const snapshot: ExportSnapshot = {
      ownerId,
      revision: record.revision,
      document: structuredClone(record.document),
      bundles: Object.create(null),
      diagnostics: [],
      dependencies: { assets: Object.create(null), libraries: Object.create(null) },
    };
    const ids = new Set(record.document.assetIds);
    for (const ref of projectPins(record.document)) {
      const key = libraryKey(ref);
      try {
        const entry = await library.get(ownerId, ref);
        snapshot.dependencies.libraries[key] = entry;
        entry.assetIds.forEach((id) => ids.add(id));
        if (entry.kind === 'component') {
          const bytes = await library.readBundle(ownerId, ref);
          snapshot.bundles[key] = {
            sha256: createHash('sha256').update(bytes).digest('hex'),
            base64: bytes.toString('base64'),
          };
        }
      } catch (error) {
        if (error instanceof LibraryNotFoundError) continue;
        if (!(error instanceof LibraryBundleError)) throw error;
        snapshot.diagnostics.push({
          severity: 'error',
          code: 'bundle-missing',
          message: 'Falta el código de la versión ' + ref.id,
        });
      }
    }
    snapshot.diagnostics.push(...(await assets.verify(ownerId, [...ids])));
    for (const id of ids) {
      try {
        const asset = descriptor.parse(await assets.get(ownerId, id));
        snapshot.dependencies.assets[id] = { ...asset, url: 'media/' + asset.hash };
      } catch (error) {
        if (!(error instanceof AssetNotFoundError)) throw error;
      }
    }
    return snapshot;
  };
}
export async function buildSnapshot(ownerId: string, record: ProjectRecord) {
  const { db } = await import('@/server/db');
  return snapshotBuilder(new AssetService(db), new LibraryService(db))(ownerId, record);
}
