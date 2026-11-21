'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EngineId, ProjectPage, ProjectRecord } from '@workspace/video-project';
import { projectRequest, projectsUrl } from '../project-api';

export function useProjects(initial: ProjectPage) {
  const [page, setPage] = useState(initial);
  const [busy, setBusy] = useState<'create' | 'list' | null>(null);
  const [error, setError] = useState('');
  const controller = useRef<AbortController | null>(null);
  const router = useRouter();
  useEffect(() => () => controller.current?.abort(), []);
  async function run(kind: 'create' | 'list', action: (signal: AbortSignal) => Promise<void>) {
    if (controller.current) return;
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
      if (!signal.aborted) router.push('/designer/' + encodeURIComponent(record.document.id));
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
