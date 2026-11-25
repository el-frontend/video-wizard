import type { AssetDescriptor, LibraryEntry, LibraryRef } from '@workspace/video-project';

export interface ResolvedAsset extends Omit<AssetDescriptor, 'ownerId'> {
  url: string;
}
export interface ResolvedDependencies {
  assets: Record<string, ResolvedAsset>;
  libraries: Record<string, LibraryEntry>;
}
export function libraryKey({ id, version }: LibraryRef): string {
  return JSON.stringify([id, version]);
}
