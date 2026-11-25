'use client';
import { useSessionRecovery } from '@/features/auth/lib/use-session-recovery';
import { useEffect, useMemo, useState } from 'react';
import {
  AssetDescriptorSchema,
  LibraryEntrySchema,
  type AssetDescriptor,
  type LibraryManifest,
  type LibraryRef,
  type ProjectDraft,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';

function pinUrl(ref: LibraryRef) {
  return '/api/studio/libraries/component/' + encodeURIComponent(ref.id) + '/' + ref.version;
}
function assetUrl(id: string) {
  return '/api/studio/assets/' + encodeURIComponent(id) + '/metadata';
}

type Dependencies = {
  key: string;
  assets: Map<string, AssetDescriptor | null>;
  manifests: Map<string, LibraryManifest | null>;
};

export function useEditorDependencies(project: ProjectDraft | null) {
  const recovery = useSessionRecovery();
  const key = useMemo(() => {
    if (!project) return '';
    const refs = new Set<string>();
    for (const scene of project.scenes)
      for (const layer of scene.layers)
        if (layer.type === 'component') refs.add(pinUrl(layer.componentRef));
    return JSON.stringify([
      project.id,
      project.engine,
      [...project.assetIds].sort(),
      [...refs].sort(),
    ]);
  }, [project]);
  const [loaded, setLoaded] = useState<Dependencies>();
  useEffect(() => {
    if (!key) return;
    const controller = new AbortController();
    const [, engine, assetIds, urls] = JSON.parse(key) as [string, string, string[], string[]];
    const read = (url: string) => projectRequest<unknown>(url, { signal: controller.signal });
    async function load() {
      const [assets, manifests] = await Promise.all([
        Promise.all(
          assetIds.map(async (id) => {
            try {
              const asset = AssetDescriptorSchema.parse(await read(assetUrl(id)));
              return [id, asset.id === id ? asset : null] as const;
            } catch {
              return [id, null] as const;
            }
          })
        ),
        Promise.all(
          urls.map(async (url) => {
            try {
              const entry = LibraryEntrySchema.parse(await read(url));
              return [
                url,
                entry.kind === 'component' && entry.engine === engine && pinUrl(entry) === url
                  ? entry.manifest
                  : null,
              ] as const;
            } catch {
              return [url, null] as const;
            }
          })
        ),
      ]);
      if (!controller.signal.aborted)
        setLoaded({ key, assets: new Map(assets), manifests: new Map(manifests) });
    }
    void load();
    return () => controller.abort();
  }, [key, recovery]);
  const current = loaded?.key === key ? loaded : undefined;
  return {
    asset: (id: string) => (project?.assetIds.includes(id) ? current?.assets.get(id) : null),
    manifest: (ref: LibraryRef) => current?.manifests.get(pinUrl(ref)),
    assets: current
      ? Array.from(current.assets.values()).filter((asset): asset is AssetDescriptor => !!asset)
      : [],
  };
}

export async function uploadEditorAsset(file: File, signal: AbortSignal) {
  const descriptor = await projectRequest<unknown>('/api/studio/assets', {
    method: 'POST',
    body: file,
    signal,
    headers: {
      'Content-Type': file.type || 'application/octet-stream',
      'X-Studio-Filename': encodeURIComponent(file.name),
    },
  });
  return AssetDescriptorSchema.parse(descriptor);
}
