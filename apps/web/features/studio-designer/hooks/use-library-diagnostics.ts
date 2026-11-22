'use client';
import { useSessionRecovery } from '@/features/auth/lib/use-session-recovery';
import { authenticatedFetch } from '@/lib/authenticated-fetch';
import { useEffect, useState } from 'react';
import {
  LibraryEntrySchema,
  validateForExport,
  supportsStudioEngine,
  type Diagnostic,
  type LibraryEntry,
  type LibraryKind,
  type LibraryRef,
  type ProjectDraft,
} from '@workspace/video-project';
import { keyOf } from '@/features/studio-libraries/hooks/use-library';

// Resolve archived pins independently of the list of implementations offered for insertion.
export function useLibraryDiagnostics(doc: ProjectDraft, verified: LibraryEntry[], ready: boolean) {
  const eligible = new Set(verified.map(keyOf));
  const paths = new Set<string>();
  function include(kind: LibraryKind, ref?: LibraryRef | null) {
    if (ref && !eligible.has(keyOf(ref)))
      paths.add(
        '/api/studio/libraries/' + kind + '/' + encodeURIComponent(ref.id) + '/' + ref.version
      );
  }
  include('style', doc.styleRef);
  include('brand', doc.brandSnapshot?.ref);
  for (const scene of doc.scenes) {
    include('template', scene.templateRef);
    for (const layer of scene.layers) {
      if (layer.type === 'component') include('component', layer.componentRef);
      if (layer.type === 'captions') include('component', layer.templateRef);
    }
  }
  const recovery = useSessionRecovery();
  const key = JSON.stringify(ready ? [...paths].sort() : []);
  const [result, setResult] = useState<{ key: string; entries: LibraryEntry[]; error?: string }>();
  useEffect(() => {
    if (key === '[]') return;
    const controller = new AbortController();
    Promise.all(
      (JSON.parse(key) as string[]).map(async (path) => {
        const response = await authenticatedFetch(path, {
          cache: 'no-store',
          signal: controller.signal,
        });
        if (response.status === 404) return null;
        if (!response.ok) throw new Error('No se pudieron comprobar las referencias fijadas.');
        return LibraryEntrySchema.parse((await response.json()).data);
      })
    )
      .then((rows) => {
        if (!controller.signal.aborted)
          setResult({ key, entries: rows.filter((row): row is LibraryEntry => !!row) });
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setResult({
            key,
            entries: [],
            error: 'No se pudieron comprobar las referencias fijadas.',
          });
      });
    return () => controller.abort();
  }, [key, recovery]);
  if (!ready || (key !== '[]' && (result?.key !== key || result.error)))
    return { issues: [], error: result?.key === key ? result.error : undefined };
  const library = [...verified, ...(key === '[]' ? [] : result!.entries)];
  const issues = validateForExport(doc, { library }).filter((d) =>
    ['library-missing', 'engine-mismatch', 'component-props'].includes(d.code)
  );
  for (const entry of library) {
    if (entry.kind === 'style' && !supportsStudioEngine(entry, doc.engine))
      issues.push({
        severity: 'error',
        code: 'style-engine',
        message:
          'El estilo ' +
          entry.name +
          ' · v' +
          entry.version +
          ' no tiene implementación para este motor.',
      });
    if (entry.kind === 'component' && entry.engine === doc.engine && !eligible.has(keyOf(entry))) {
      const issue: Diagnostic = {
        severity: 'error',
        code: 'unsupported-component',
        message:
          'El componente ' +
          entry.name +
          ' · v' +
          entry.version +
          ' requiere una implementación verificada.',
      };
      for (const scene of doc.scenes)
        for (const layer of scene.layers) {
          const ref =
            layer.type === 'component'
              ? layer.componentRef
              : layer.type === 'captions'
                ? layer.templateRef
                : null;
          if (ref && keyOf(ref) === keyOf(entry))
            issues.push({ ...issue, sceneId: scene.id, layerId: layer.id });
        }
    }
  }
  for (const scene of doc.scenes)
    for (const layer of scene.layers) {
      if (
        layer.type === 'captions' &&
        layer.templateRef &&
        library.some((e) => e.kind === 'template' && keyOf(e) === keyOf(layer.templateRef!))
      )
        issues.push({
          severity: 'error',
          code: 'unsupported-caption-preset',
          message: 'La capa de subtítulos necesita un componente de subtítulos.',
          sceneId: scene.id,
          layerId: layer.id,
        });
    }
  return { issues };
}
