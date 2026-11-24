import { useCallback, useEffect, useRef, useState } from 'react';
import type { ProjectRecord } from '@workspace/video-project';
import { projectRequest, projectsUrl } from '@/features/studio-projects/project-api';
import type { RevisionPage } from '@/server/services/studio/project-service';

const labels = {
  create: 'Creación',
  save: 'Edición',
  restore: 'Restauración',
  duplicate: 'Copia',
  import: 'Importación',
  repair: 'Reparación',
};
export function RevisionHistory({
  record,
  disabled,
  onRestore,
}: {
  record: ProjectRecord;
  disabled: boolean;
  onRestore: (target: string) => void;
}) {
  const [open, setOpen] = useState(false),
    [page, setPage] = useState<RevisionPage | null>(null),
    [error, setError] = useState(''),
    [loading, setLoading] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const url = projectsUrl + '/' + encodeURIComponent(record.document.id) + '/revisions';
  const read = useCallback(
    async (cursor: string | null, signal: AbortSignal) => {
      setLoading(true);
      setError('');
      try {
        const result = await projectRequest<RevisionPage>(
          url + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          { signal }
        );
        if (!signal.aborted)
          setPage((prev) =>
            cursor && prev ? { ...result, items: [...prev.items, ...result.items] } : result
          );
      } catch (e) {
        if (!signal.aborted)
          setError(e instanceof Error ? e.message : 'No se pudo leer el historial.');
      } finally {
        if (!signal.aborted) setLoading(false);
      }
    },
    [url]
  );
  useEffect(() => {
    if (!open) return;
    const request = new AbortController();
    controller.current = request;
    setPage(null);
    void read(null, request.signal);
    return () => request.abort();
  }, [open, record.revision, read]);
  return (
    <details className="studio-catalog p-3" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">Historial de revisiones</summary>
      <ol className="divide-y">
        {page?.items.map((r, i) => (
          <li className="flex flex-wrap items-center justify-between gap-2 py-2" key={r.revision}>
            <span>
              {labels[r.operation]} ·{' '}
              <time dateTime={r.createdAt}>{new Date(r.createdAt).toLocaleString('es')}</time>
            </span>
            {r.revision === record.revision ? (
              <strong>Actual</strong>
            ) : (
              <button
                className="studio-secondary"
                disabled={disabled}
                aria-label={'Restaurar revisión ' + (i + 1)}
                onClick={() => onRestore(r.revision)}
              >
                Restaurar
              </button>
            )}
          </li>
        ))}
      </ol>
      {page?.nextCursor && (
        <button
          disabled={loading}
          onClick={() =>
            controller.current && void read(page.nextCursor, controller.current.signal)
          }
        >
          Cargar revisiones anteriores
        </button>
      )}
      <p role="status">{loading ? 'Cargando historial…' : error}</p>
    </details>
  );
}
