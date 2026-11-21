'use client';

import Link from 'next/link';
import { useState, type FormEvent } from 'react';
import { ArrowRight, Clapperboard, FolderOpen, Plus } from 'lucide-react';
import type { EngineId, ProjectPage, ProjectSummary } from '@workspace/video-project';
import { useProjects } from '../hooks/use-projects';

import { engineName } from '../project-labels';

function ProjectRow({ item }: { item: ProjectSummary }) {
  return (
    <li>
      <Link href={'/designer/' + encodeURIComponent(item.id)} className="project-row">
        <span className="project-symbol" aria-hidden="true">
          <Clapperboard size={20} />
        </span>
        <span className="project-row-title">
          <strong>{item.title}</strong>
          <small>
            {engineName[item.engine]} · {item.canvas.width} × {item.canvas.height}
          </small>
        </span>
        <time dateTime={item.updatedAt}>
          {new Intl.DateTimeFormat('es', {
            day: 'numeric',
            month: 'short',
            year: 'numeric',
            timeZone: 'UTC',
          }).format(new Date(item.updatedAt))}
        </time>
        <ArrowRight size={18} aria-hidden="true" />
      </Link>
    </li>
  );
}

function CreateProjectForm({
  onCreate,
  busy,
}: {
  onCreate: (title: string, engine: EngineId) => Promise<void>;
  busy: boolean;
}) {
  const [title, setTitle] = useState('');
  const [engine, setEngine] = useState<EngineId | null>(null);
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (engine && title.trim()) void onCreate(title.trim(), engine);
  }
  return (
    <form className="studio-create" onSubmit={submit}>
      <h2>Nuevo proyecto</h2>
      <label htmlFor="project-title">Título</label>
      <input
        id="project-title"
        name="title"
        required
        pattern=".*\S.*"
        placeholder="Nombre del proyecto"
        value={title}
        onChange={(event) => setTitle(event.target.value)}
      />
      <fieldset>
        <legend>Motor de composición</legend>
        {(['remotion', 'hyperframes'] as const).map((value) => (
          <label key={value} className="engine-choice">
            <input
              type="radio"
              name="engine"
              value={value}
              required
              checked={engine === value}
              onChange={() => setEngine(value)}
            />
            <span>{engineName[value]}</span>
          </label>
        ))}
      </fieldset>
      <button className="studio-primary" type="submit" disabled={busy}>
        <Plus size={16} />
        Crear proyecto
      </button>
    </form>
  );
}

export function ProjectLibrary({ initial }: { initial: ProjectPage }) {
  const { page, busy, error, create, more } = useProjects(initial);
  return (
    <section lang="es" className="studio-workspace">
      <header className="studio-heading">
        <h1>Proyectos</h1>
      </header>
      <div className="studio-library">
        <section className="studio-catalog" aria-labelledby="saved-title">
          <header className="studio-section-heading">
            <FolderOpen size={20} />
            <h2 id="saved-title">Mis proyectos</h2>
          </header>
          {page.items.length ? (
            <ul className="project-list">
              {page.items.map((item) => (
                <ProjectRow key={item.id} item={item} />
              ))}
            </ul>
          ) : (
            <p className="studio-empty-library">Aún no tienes proyectos guardados.</p>
          )}
          {page.nextCursor && (
            <button type="button" className="studio-secondary" disabled={!!busy} onClick={more}>
              Cargar más proyectos
            </button>
          )}
        </section>
        <CreateProjectForm onCreate={create} busy={!!busy} />
      </div>
      <p role="status">
        {busy === 'create' ? 'Creando proyecto…' : busy === 'list' ? 'Cargando proyectos…' : ''}
      </p>
      {error && (
        <p role="alert" className="studio-warning">
          {error}
        </p>
      )}
    </section>
  );
}
