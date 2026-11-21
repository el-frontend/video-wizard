'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Redo2, Save, Undo2 } from 'lucide-react';
import type { PreviewHandle, ProjectRecord, ProjectCommand } from '@workspace/video-project';
import { sceneStartMs } from '@workspace/video-project';
import { engineName, timeLabel } from '@/features/studio-projects/project-labels';
import { useProjectSession } from '../hooks/use-project-session';
import { guardProjectHistory, studioNavigation } from '../hooks/project-navigation';
import { SceneSequence } from './scene-sequence';
import { LayerList } from './layer-list';
import { LayerInspector } from './layer-inspector';
import { CanvasControls } from './canvas-controls';
import { NumberField } from './number-field';
import { checkLayerRange } from '../lib/editor-commands';
import { useEditorDependencies } from '../hooks/use-editor-dependencies';
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
  const dependencies = useEditorDependencies(draft);
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
  const scene = draft.scenes.find((item) => item.id === selection.sceneId) ?? draft.scenes[0];
  const layer = scene?.layers.find((item) => item.id === selection.layerId);
  function seek(
    timeMs: number,
    sceneId: string | null = scene?.id ?? null,
    layerId: string | null = selection.layerId
  ) {
    const next = { sceneId, layerId, captionId: null, timeMs };
    selectionRef.current = next;
    select(next);
    handle.current?.seek(timeMs);
  }
  function command(action: ProjectCommand) {
    const updated = session.dispatch(action);
    if (!updated || !draft) return;
    if (action.type === 'add-scene') {
      seek(sceneStartMs(updated, action.scene.id), action.scene.id, null);
    } else if (action.type === 'add-layer' || action.type === 'remove-layer') {
      seek(selection.timeMs, action.sceneId, action.type === 'add-layer' ? action.layer.id : null);
    } else if (action.type === 'remove-scene') {
      const index = draft.scenes.findIndex((item) => item.id === action.sceneId);
      const target = updated.scenes[index] ?? updated.scenes[index - 1];
      seek(target ? sceneStartMs(updated, target.id) : 0, target?.id ?? null, null);
    } else if (action.type === 'reorder-scene' && scene) {
      const local = Math.max(
        0,
        Math.min(scene.durationMs - 1, selection.timeMs - sceneStartMs(draft, scene.id))
      );
      seek(sceneStartMs(updated, scene.id) + local, scene.id, selection.layerId);
    }
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
          <div className="edit-tracks">
            <SceneSequence
              scenes={draft.scenes}
              selectedId={scene?.id ?? null}
              onSelect={(id) => seek(sceneStartMs(draft, id), id, null)}
              onCommand={command}
            />
            {scene && (
              <div>
                <LayerList
                  key={JSON.stringify([draft.id, scene.id])}
                  scene={scene}
                  canvas={draft.canvas}
                  selectedId={selection.layerId}
                  assets={dependencies.assets}
                  onSelect={(id) => seek(selection.timeMs, scene.id, id)}
                  onCommand={command}
                />
                <details className="edit-section">
                  <summary>Duración de la escena</summary>
                  <NumberField
                    key={scene.id}
                    label="Ampliar hasta (ms)"
                    min={scene.durationMs}
                    value={scene.durationMs}
                    onCommit={(durationMs) => {
                      for (const item of scene.layers) {
                        if (item.endAnchor === 'scene-end' && 'sourceInMs' in item) {
                          const issue = checkLayerRange(
                            item,
                            { endMs: Math.max(durationMs, item.endMs) },
                            dependencies.asset(item.assetId)?.durationMs
                          );
                          if (issue) return issue;
                        }
                      }
                      command({ type: 'extend-scene', sceneId: scene.id, durationMs });
                    }}
                  />
                </details>
              </div>
            )}
          </div>
        </div>
        <aside className="designer-details">
          <h2>Proyecto</h2>
          <TitleField
            title={draft.title}
            onTitle={(title) => session.dispatch({ type: 'set-title', title })}
          />
          <CanvasControls canvas={draft.canvas} onCommand={command} />
          {layer && scene && (
            <LayerInspector
              key={layer.id}
              sceneId={scene.id}
              sceneDuration={scene.durationMs}
              layer={layer}
              canvas={draft.canvas}
              asset={'assetId' in layer ? dependencies.asset(layer.assetId) : undefined}
              manifest={
                layer.type === 'component' ? dependencies.manifest(layer.componentRef) : undefined
              }
              onCommand={command}
            />
          )}
        </aside>
      </div>
    </section>
  );
}
