'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { EngineId, ProjectPage, ProjectRecord } from '@workspace/video-project';
import { studioNavigation } from '@/features/studio-designer/hooks/project-navigation';
import { onProjectSaved, projectRequest, projectsUrl } from '../project-api';

export function useProjects(initial: ProjectPage, ownerId: string) {
  const [page, setPage] = useState(initial);
  const [reading, setReading] = useState<'refresh' | 'more' | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const pageRequest = useRef<AbortController | null>(null);
  const createRequest = useRef<AbortController | null>(null);
  const router = useRouter();

  const readPage = useCallback(async (cursor?: string) => {
    if (cursor && pageRequest.current) return;
    pageRequest.current?.abort();
    const request = new AbortController();
    pageRequest.current = request;
    setReading(cursor ? 'more' : 'refresh');
    if (cursor) setError('');
    try {
      const query = cursor ? '?' + new URLSearchParams({ cursor }) : '';
      const next = await projectRequest<ProjectPage>(projectsUrl + query, {
        signal: request.signal,
      });
      if (request.signal.aborted) return;
      if (!cursor) {
        setPage(next);
        return;
      }
      setPage((previous) => {
        const ids = new Set(previous.items.map((item) => item.id));
        return {
          items: [...previous.items, ...next.items.filter((item) => !ids.has(item.id))],
          nextCursor: next.nextCursor,
        };
      });
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No se pudieron cargar los proyectos.');
    } finally {
      if (pageRequest.current === request) {
        pageRequest.current = null;
        if (!request.signal.aborted) setReading(null);
      }
    }
  }, []);

  useEffect(() => {
    const unsubscribe = onProjectSaved(ownerId, () => void readPage());
    void readPage();
    return () => {
      unsubscribe();
      pageRequest.current?.abort();
      createRequest.current?.abort();
    };
  }, [ownerId, readPage]);

  async function create(title: string, engine: EngineId) {
    if (createRequest.current) return;
    const request = new AbortController();
    createRequest.current = request;
    setCreating(true);
    setError('');
    try {
      const record = await projectRequest<ProjectRecord>(projectsUrl, {
        method: 'POST',
        signal: request.signal,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, engine }),
      });
      if (request.signal.aborted) return;
      const href = '/designer/' + encodeURIComponent(record.document.id);
      if (studioNavigation()) router.push(href);
      else location.assign(href);
    } catch (cause) {
      if (!request.signal.aborted)
        setError(cause instanceof Error ? cause.message : 'No se pudo crear el proyecto.');
    } finally {
      createRequest.current = null;
      if (!request.signal.aborted) setCreating(false);
    }
  }
  function more() {
    if (page.nextCursor) return readPage(page.nextCursor);
  }
  const busy = creating ? 'create' : reading === 'more' ? 'list' : null;
  return { page, busy, loadingPage: reading !== null, error, create, more };
}
