'use client';
import { useState } from 'react';
import Link from 'next/link';
import type { EngineId, LibraryEntry, ProjectRecord } from '@workspace/video-project';
import { post } from '@/features/studio-libraries/hooks/use-library';
import { engineName } from '@/features/studio-projects/project-labels';

export function ProjectEditions({
  record,
  save,
}: {
  record: ProjectRecord;
  save: () => Promise<ProjectRecord | null>;
}) {
  const [engine, setEngine] = useState<EngineId>(record.document.engine),
    [name, setName] = useState(record.document.title),
    [busy, setBusy] = useState(false),
    [result, setResult] = useState<{ message: string; href: string; label: string }>(),
    [error, setError] = useState('');
  async function create(kind: 'duplicate' | 'template') {
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      const base = await save();
      if (!base) throw Error('El proyecto no está guardado.');
      const url = '/api/studio/projects/' + encodeURIComponent(base.document.id) + '/' + kind;
      if (kind === 'duplicate') {
        const copy = await post<ProjectRecord>(url, { baseRevision: base.revision, engine });
        setResult({
          message: 'Copia creada en ' + engineName[engine] + '.',
          href: '/designer/' + encodeURIComponent(copy.document.id),
          label: 'Abrir copia',
        });
      } else {
        const entry = await post<LibraryEntry>(url, { baseRevision: base.revision, name });
        setResult({
          message: 'Plantilla publicada · v' + entry.version,
          href: '/templates?entry=' + encodeURIComponent(entry.id),
          label: 'Editar plantilla',
        });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'No se pudo crear la edición.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="edit-section library-fields">
      <summary>Copias y plantillas</summary>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create('duplicate');
        }}
      >
        <label>
          Motor de la copia
          <select value={engine} onChange={(e) => setEngine(e.target.value as EngineId)}>
            <option value="remotion">Remotion</option>
            <option value="hyperframes">HyperFrames</option>
          </select>
        </label>
        <button className="edit-button" disabled={busy}>
          Crear copia
        </button>
      </form>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void create('template');
        }}
      >
        <label>
          Nombre de la plantilla
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <button className="edit-button" disabled={busy}>
          Guardar como plantilla
        </button>
      </form>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          {result.message}{' '}
          <Link className="underline" href={result.href}>
            {result.label}
          </Link>
        </p>
      )}
    </details>
  );
}
