'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EngineId, ProjectPage, ProjectRecord } from '@workspace/video-project';
import { studioNavigation } from '@/features/studio-designer/hooks/project-navigation';
import { projectRequest, projectsUrl } from '../project-api';

export function useProjects(initial: ProjectPage) {
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState<'create' | 'list' | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  const revalidation = useRef<AbortController | null>(null);
  useEffect(() => {
    // Back can remount this page with a cached server response from before an edit.
    const request = new AbortController();
    revalidation.current = request;
    void projectRequest<ProjectPage>(projectsUrl, { signal: request.signal })
      .then((latest) => {
        if (!request.signal.aborted) setPage(latest);
      })
      .catch(() => {});
    return () => {
      request.abort();
      controller.current?.abort();
    };
  }, []);
  async function run(kind: 'create' | 'list', action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
    revalidation.current?.abort();
    const request = new AbortController();
    controller.current = request;
    setBusy(kind);
    setError('');
    try {
      await action(request.signal);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No se pudo completar la operación.');
    } finally {
      controller.current = null;
      if (!request.signal.aborted) setBusy(null);
    }
  }
  function create(title: string, engine: EngineId) {
    return run('create', async (signal) => {
      const record = await projectRequest<ProjectRecord>(projectsUrl, {
        method: 'POST',
        signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, engine }),
      });
      if (signal.aborted) return;
      const href = '/designer/' + encodeURIComponent(record.document.id);
      if (studioNavigation()) router.push(href);
      else location.assign(href);
    });
  }
  function more() {
    if (!page.nextCursor) return;
    const query = new URLSearchParams({ cursor: page.nextCursor });
    return run('list', async (signal) => {
      const next = await projectRequest<ProjectPage>(projectsUrl + '?' + query, { signal });
      if (!signal.aborted)
        setPage((previous) => {
          const ids = new Set(previous.items.map((item) => item.id));
          return {
            items: [...previous.items, ...next.items.filter((item) => !ids.has(item.id))],
            nextCursor: next.nextCursor,
          };
        });
    });
  }
  return { page, busy, error, create, more };
}
