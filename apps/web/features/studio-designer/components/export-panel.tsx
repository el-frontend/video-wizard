'use client';

import { useEffect, useRef, useState } from 'react';
import { projectRequest, projectsUrl } from '@/features/studio-projects/project-api';
import type { ExportJob } from '@/server/services/studio/export-service';

const labels = {
  queued: 'En cola',
  running: 'Exportando',
  cancelling: 'Cancelando',
  cancelled: 'Cancelada',
  completed: 'Completada',
  failed: 'Fallida',
};
const active = (job: ExportJob) => ['queued', 'running', 'cancelling'].includes(job.status);

export function ExportPanel({
  projectId,
  revision,
  disabled,
}: {
  projectId: string;
  revision: string;
  disabled: boolean;
}) {
  const [open, setOpen] = useState(false),
    [items, setItems] = useState<ExportJob[]>([]),
    [version, refresh] = useState(0),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [readError, setReadError] = useState('');
  const admission = useRef<{ revision: string; key: string } | null>(null);
  const url = projectsUrl + '/' + encodeURIComponent(projectId) + '/exports';
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    let retryDelay = 1000;
    async function load() {
      try {
        const jobs = await projectRequest<ExportJob[]>(url, { signal: abort.signal });
        if (abort.signal.aborted) return;
        setItems(jobs);
        setReadError('');
        retryDelay = 1000;
        if (jobs.some(active)) timer = setTimeout(() => void load(), 1000);
      } catch (e) {
        if (abort.signal.aborted) return;
        setReadError(e instanceof Error ? e.message : 'No se pudieron cargar las exportaciones.');
        timer = setTimeout(() => void load(), retryDelay);
        retryDelay = Math.min(8000, retryDelay * 2);
      }
    }
    void load();
    return () => {
      abort.abort();
      clearTimeout(timer);
    };
  }, [url, open, version]);
  async function action(job?: ExportJob) {
    setError('');
    setBusy(true);
    try {
      if (!job && admission.current?.revision !== revision)
        admission.current = { revision, key: crypto.randomUUID() };
      const item = await projectRequest<ExportJob>(
        job ? '/api/studio/exports/' + job.id + '/cancel' : url,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          ...(job
            ? {}
            : {
                body: JSON.stringify({
                  baseRevision: revision,
                  idempotencyKey: admission.current!.key,
                }),
              }),
        }
      );
      if (!job) admission.current = null;
      setItems((prev) => [item, ...prev.filter((old) => old.id !== item.id)]);
      refresh((v) => v + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo actualizar la exportación.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="edit-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary className="cursor-pointer">Exportaciones</summary>
      <div className="edit-actions">
        <button
          type="button"
          className="studio-primary"
          disabled={busy || disabled}
          onClick={() => void action()}
        >
          Exportar revisión guardada
        </button>
        <span className="edit-note">Revisión {revision.slice(0, 8)}</span>
      </div>
      {(error || readError) && <p role="alert">{error || readError}</p>}
      <ol>
        {items.map((job) => (
          <li key={job.id} className="edit-section">
            <strong>
              {job.engine === 'remotion' ? 'Remotion' : 'HyperFrames'} · Revisión{' '}
              {job.revision.slice(0, 8)}
            </strong>
            <p role="status">
              {labels[job.status]}
              {job.revision !== revision ? ' · Revisión anterior' : ''}
            </p>
            {job.status === 'running' && (
              <progress
                aria-label={'Progreso de la exportación ' + job.id.slice(0, 8)}
                max={100}
                value={job.progress}
              />
            )}
            {['queued', 'running'].includes(job.status) && (
              <button
                type="button"
                className="edit-button"
                disabled={busy}
                onClick={() => void action(job)}
              >
                Cancelar exportación
              </button>
            )}
            {job.error && <p>{job.error}</p>}
            {job.artifacts.length > 0 && (
              <div className="edit-actions">
                {job.artifacts.map((a) => (
                  <a className="edit-button" key={a.name} href={a.url} download>
                    {a.name === 'video.mp4'
                      ? 'Descargar MP4'
                      : a.name === 'manifest.json'
                        ? 'Manifiesto'
                        : 'Captura ' + a.name.slice(6, -4) + ' ms'}
                  </a>
                ))}
              </div>
            )}
          </li>
        ))}
      </ol>
    </details>
  );
}
