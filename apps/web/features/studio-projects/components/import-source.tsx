'use client';
import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import type { ImportContext, ProjectRecord } from '@workspace/video-project';
import { notifyProjectSaved, projectRequest } from '../project-api';
export function ImportSource({
  owner,
  kind,
  sources,
}: {
  owner: string;
  kind: ImportContext['kind'];
  sources: string[];
}) {
  const [id, setId] = useState(sources[0] ?? ''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const router = useRouter(),
    operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);
  async function submit() {
    if (!id || busy) return;
    const request = new AbortController();
    operation.current = request;
    setBusy(true);
    setError('');
    try {
      const { project } = await projectRequest<{ project: ProjectRecord }>('/api/studio/imports', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: request.signal,
        body: JSON.stringify({ kind, sourceId: id }),
      });
      if (request.signal.aborted || project.ownerId !== owner) return;
      notifyProjectSaved(owner);
      router.push('/designer/' + encodeURIComponent(project.document.id));
    } catch (e) {
      if (!request.signal.aborted)
        setError(e instanceof Error ? e.message : 'No se pudo importar.');
    } finally {
      if (!request.signal.aborted) setBusy(false);
    }
  }
  if (!sources.length) return null;
  return (
    <section aria-label="Importar al diseñador" className="studio-catalog p-3">
      {kind === 'motion-studio' && (
        <label>
          Fuente de Motion Studio{' '}
          <select value={id} onChange={(e) => setId(e.target.value)}>
            {sources.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      )}
      <button className="studio-secondary" onClick={() => void submit()} disabled={busy}>
        {busy
          ? 'Importando…'
          : kind === 'legacy-job'
            ? 'Abrir este trabajo en el diseñador'
            : 'Importar al diseñador'}
      </button>
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
