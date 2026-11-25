'use client';
import { useSessionRecovery } from '@/features/auth/lib/use-session-recovery';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LibraryEntrySchema,
  type EngineId,
  type LibraryKind,
  type LibraryEntry,
  type LibraryRef,
  type AssetDescriptor,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
export const sectionNames = {
  style: 'Estilos',
  brand: 'Marcas',
  component: 'Componentes',
  template: 'Plantillas',
  asset: 'Recursos',
};
export const pin = (entry: LibraryRef): LibraryRef => ({ id: entry.id, version: entry.version });
export const keyOf = (entry: LibraryRef) => JSON.stringify([entry.id, entry.version]);
export function post<T>(url: string, data: unknown) {
  return projectRequest<T>(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
}
export function useLibrary(
  kind: LibraryKind,
  engine?: EngineId,
  { enabled = true, generation = 0 }: { enabled?: boolean; generation?: number } = {}
) {
  const recovery = useSessionRecovery();
  const url = '/api/studio/libraries/' + kind + (engine ? '?verified=1&engine=' + engine : '');
  const [result, setResult] = useState<{
    url: string;
    generation: number;
    entries: LibraryEntry[];
    error?: string;
  }>();
  useEffect(() => {
    if (!enabled) return;
    const controller = new AbortController();
    projectRequest<unknown>(url, { signal: controller.signal })
      .then((rows) => LibraryEntrySchema.array().parse(rows))
      .then((entries) => {
        if (!controller.signal.aborted) setResult({ url, generation, entries });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setResult({
            url,
            generation,
            entries: [],
            error: cause instanceof Error ? cause.message : 'No se pudo leer la biblioteca.',
          });
      });
    return () => controller.abort();
  }, [url, generation, enabled, recovery]);
  const current =
    enabled && result?.url === url && result.generation === generation ? result : undefined;
  return { entries: current?.entries ?? [], loading: enabled && !current, error: current?.error };
}
export function useAssetPage(media?: string) {
  const recovery = useSessionRecovery();
  const [items, setItems] = useState<AssetDescriptor[]>([]),
    [cursor, setCursor] = useState<string | null>(null),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(true),
    [generation, refresh] = useState(0);
  const flight = useRef<AbortController | null>(null);
  const read = useCallback(
    async (after: string | null) => {
      if (after && flight.current) return;
      flight.current?.abort();
      const controller = new AbortController();
      flight.current = controller;
      const signal = controller.signal;
      const query = new URLSearchParams();
      if (after) query.set('cursor', after);
      if (media) query.set('media', media);
      setBusy(true);
      try {
        const page = await projectRequest<{ items: AssetDescriptor[]; nextCursor: string | null }>(
          '/api/studio/assets?' + query,
          { signal }
        );
        if (!signal?.aborted) {
          setItems((prev) =>
            after
              ? [...new Map([...prev, ...page.items].map((x) => [x.id, x])).values()]
              : page.items
          );
          setCursor(page.nextCursor);
          setError('');
        }
      } catch (cause) {
        if (!signal?.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los recursos.');
      } finally {
        if (flight.current === controller) {
          flight.current = null;
          if (!signal.aborted) setBusy(false);
        }
      }
    },
    [media]
  );
  useEffect(() => {
    void read(null);
    return () => flight.current?.abort();
  }, [read, generation, recovery]);
  return {
    items,
    cursor,
    error,
    busy,
    more: () => {
      if (!busy && cursor) void read(cursor);
    },
    reload: () => refresh((n) => n + 1),
  };
}
