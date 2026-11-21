'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, ListVideo, Redo2, Save, Undo2 } from 'lucide-react';
import type { PreviewHandle, ProjectRecord } from '@workspace/video-project';
import { sceneStartMs } from '@workspace/video-project';
import { engineName, timeLabel } from '@/features/studio-projects/project-labels';
import { useProjectSession } from '../hooks/use-project-session';
import { guardProjectHistory, studioNavigation } from '../hooks/project-navigation';
import { PreviewPanel } from './preview-panel';

const statusLabels = {
  saved: 'Guardado',
  dirty: 'Cambios sin guardar',
  saving: 'Guardando…',
  error: 'Error de guardado',
  conflict: 'Conflicto de revisiones',
  loading: 'Cargando…',
};

function TitleField({ title, onTitle }: { title: string; onTitle: (title: string) => void }) {
  const [invalid, setInvalid] = useState<string | null>(null);
  return (
    <div className="designer-title">
      <label htmlFor="designer-title">Título del proyecto</label>
      <input
        id="designer-title"
        value={invalid ?? title}
        required
        aria-invalid={invalid !== null}
        aria-describedby={invalid !== null ? 'title-error' : undefined}
        onChange={(event) => {
          const value = event.target.value;
          if (!value.trim()) {
            setInvalid(value);
            return;
          }
          setInvalid(null);
          onTitle(value);
        }}
        onBlur={() => setInvalid(null)}
      />
      {invalid !== null && <span id="title-error">Escribe un título para guardar el cambio.</span>}
    </div>
  );
}

export function Designer({ initial }: { initial: ProjectRecord }) {
  const session = useProjectSession(initial.document.id, initial);
  const {
    draft,
    saved,
    selection,
    select,
    save,
    undo,
    redo,
    hasUnsavedChanges,
    retainDraft,
    discardRetained,
  } = session;
  const projectId = initial.document.id;
  const router = useRouter();
  const handle = useRef<PreviewHandle | null>(null);
  const selectionRef = useRef(selection);
  const [ready, setReady] = useState(false);
  useEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  const onReady = useCallback((next: PreviewHandle | null) => {
    handle.current = next;
    setReady(!!next);
    if (next && selectionRef.current.timeMs) next.seek(selectionRef.current.timeMs);
  }, []);
  const onTimeChange = useCallback(
    (timeMs: number) => {
      select({ ...selectionRef.current, timeMs });
    },
    [select]
  );
  useEffect(() => {
    function shortcuts(event: KeyboardEvent) {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) return;
      const key = event.key.toLowerCase();
      if (key === 's') {
        event.preventDefault();
        void save().catch(() => {});
      }
      if (
        key === 'z' &&
        !(
          event.target instanceof HTMLElement &&
          event.target.closest('input,textarea,[contenteditable="true"]')
        )
      ) {
        event.preventDefault();
        if (event.shiftKey) redo();
        else undo();
      }
    }
    window.addEventListener('keydown', shortcuts);
    return () => window.removeEventListener('keydown', shortcuts);
  }, [save, undo, redo]);
  useEffect(() => {
    const navigation = studioNavigation();
    async function mayLeave() {
      try {
        await save();
        return true;
      } catch {
        const discard = window.confirm(
          'El borrador tiene cambios sin guardar. ¿Quieres salir y descartarlos?'
        );
        if (discard) discardRetained();
        return discard;
      }
    }
    const recoveryNotice = 'studio-draft-' + projectId;
    toast.dismiss(recoveryNotice);
    function offerRecovery() {
      toast.warning(
        'El navegador cambió de página. Tu borrador sigue disponible en esta pestaña.',
        {
          id: recoveryNotice,
          duration: 15000,
          action: (
            <Link
              className="font-semibold underline"
              href={'/designer/' + encodeURIComponent(projectId)}
            >
              Reabrir borrador
            </Link>
          ),
        }
      );
    }
    const removeHistoryGuard = navigation
      ? guardProjectHistory(navigation, hasUnsavedChanges, mayLeave, retainDraft, offerRecovery)
      : undefined;
    function followAfterSave(event: MouseEvent) {
      if (
        (!hasUnsavedChanges() && navigation) ||
        event.defaultPrevented ||
        event.button !== 0 ||
        event.metaKey ||
        event.ctrlKey ||
        event.shiftKey ||
        event.altKey
      )
        return;
      const link = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (
        !(link instanceof HTMLAnchorElement) ||
        link.origin !== location.origin ||
        (link.target && link.target !== '_self') ||
        link.hasAttribute('download')
      )
        return;
      event.preventDefault();
      event.stopPropagation();
      const destination = link.pathname + link.search + link.hash;
      if (!navigation) {
        // A full document navigation lets beforeunload handle a failed save once.
        void save()
          .catch(() => {})
          .then(() => location.assign(destination));
        return;
      }
      void mayLeave().then((allowed) => {
        if (allowed) router.push(destination);
      });
    }
    document.addEventListener('click', followAfterSave, true);
    return () => {
      removeHistoryGuard?.();
      document.removeEventListener('click', followAfterSave, true);
    };
  }, [hasUnsavedChanges, save, router, projectId, retainDraft, discardRetained]);
  if (!draft || !saved)
    return (
      <section lang="es" className="studio-workspace">
        <p role="status">Abriendo proyecto…</p>
      </section>
    );
  const canSave = ['dirty', 'error', 'saving'].includes(session.status);
  function seek(timeMs: number, sceneId = selection.sceneId) {
    const next = { sceneId, layerId: null, captionId: null, timeMs };
    selectionRef.current = next;
    select(next);
    handle.current?.seek(timeMs);
  }
  return (
    <section lang="es" className="studio-workspace">
      <div className="studio-crumb">
        <Link href="/projects">
          <ArrowLeft size={15} />
          Proyectos
        </Link>
      </div>
      <header className="studio-heading designer-heading">
        <h1>Diseñador</h1>
        <div className="designer-actions">
          <span className="save-status" role="status">
            {session.status === 'saved' && <Check size={15} />}
            {statusLabels[session.status]}
          </span>
          <button
            type="button"
            className="studio-icon"
            aria-label="Deshacer"
            title="Deshacer"
            onClick={undo}
            disabled={!session.canUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="studio-icon"
            aria-label="Rehacer"
            title="Rehacer"
            onClick={redo}
            disabled={!session.canRedo}
          >
            <Redo2 size={17} />
          </button>
          <button
            type="button"
            className="studio-primary"
            disabled={!canSave}
            onClick={() => void save().catch(() => {})}
          >
            <Save size={16} />
            Guardar
          </button>
        </div>
      </header>
      {session.conflict ? (
        <div role="alert" className="studio-warning">
          <strong>Hay otra revisión guardada.</strong> Tu borrador sigue abierto. Revisión remota:{' '}
          <code>{session.conflict.revision}</code> · {session.conflict.document.title}
        </div>
      ) : (
        session.error && (
          <p role="alert" className="studio-warning">
            {session.error}
          </p>
        )
      )}
      <div className="designer-layout">
        <div className="preview-column">
          <div className="preview-bar">
            <h2>Vista previa</h2>
            <span>{engineName[draft.engine]}</span>
          </div>
          <PreviewPanel
            projectId={draft.id}
            revision={saved.revision}
            document={draft}
            onReady={onReady}
            onTimeChange={onTimeChange}
          />
          <div className="seek-bar">
            <span>{timeLabel(selection.timeMs)}</span>
            <input
              type="range"
              min={0}
              max={Math.max(0, draft.durationMs - 1)}
              step={1}
              value={selection.timeMs}
              aria-label="Posición de reproducción"
              aria-valuetext={timeLabel(selection.timeMs)}
              disabled={!ready}
              onChange={(event) => seek(Number(event.target.value))}
            />
            <span>{timeLabel(draft.durationMs)}</span>
          </div>
        </div>
        <aside className="designer-details">
          <h2>Proyecto</h2>
          <TitleField
            title={draft.title}
            onTitle={(title) => session.dispatch({ type: 'set-title', title })}
          />
          <dl className="canvas-details">
            <div>
              <dt>Lienzo</dt>
              <dd>
                {draft.canvas.width} × {draft.canvas.height}
              </dd>
            </div>
            <div>
              <dt>Frecuencia</dt>
              <dd>{draft.canvas.fps} fps</dd>
            </div>
          </dl>
          <section className="scene-list">
            <h2>
              <ListVideo size={19} />
              Escenas
            </h2>
            {draft.scenes.length ? (
              <ol>
                {draft.scenes.map((scene, index) => (
                  <li key={scene.id}>
                    <button
                      type="button"
                      aria-pressed={selection.sceneId === scene.id}
                      onClick={() => seek(sceneStartMs(draft, scene.id), scene.id)}
                    >
                      <span>{scene.editorial?.headline || 'Escena ' + (index + 1)}</span>
                      <small>{timeLabel(scene.durationMs)}</small>
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p>Sin escenas.</p>
            )}
          </section>
        </aside>
      </div>
    </section>
  );
}
