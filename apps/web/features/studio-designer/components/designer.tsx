'use client';

import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Check, Redo2, Save, Undo2 } from 'lucide-react';
import type { PreviewHandle, ProjectRecord, ProjectCommand } from '@workspace/video-project';
import { sceneStartMs, validateForExport } from '@workspace/video-project';
import { engineName, timeLabel } from '@/features/studio-projects/project-labels';
import { useProjectSession } from '../hooks/use-project-session';
import { guardProjectHistory, studioNavigation } from '../hooks/project-navigation';
import { SceneSequence } from './scene-sequence';
import { LayerList } from './layer-list';
import { LayerInspector } from './layer-inspector';
import { CanvasControls } from './canvas-controls';
import { NarrationEditor } from './narration-editor';
import { CaptionEditor } from './caption-editor';
import { AudioInspector } from './audio-inspector';
import { SceneExtension } from './scene-extension';
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
  const timingIssues = useMemo(
    () =>
      draft
        ? validateForExport(draft).filter((d) =>
            ['layer-overflow', 'cue-overflow', 'word-overflow'].includes(d.code)
          )
        : [],
    [draft]
  );
  const projectId = initial.document.id;
  const router = useRouter();
  const [handle, onReady] = useState<PreviewHandle | null>(null);
  const selectionRef = useRef(selection);
  const cueSeek = useRef<(typeof selection & { sampleMs?: number; awaitingAck: boolean }) | null>(
    null
  );
  useLayoutEffect(() => {
    selectionRef.current = selection;
  }, [selection]);
  useLayoutEffect(() => {
    if (!handle) return;
    const current = selectionRef.current;
    const pending = cueSeek.current;
    if (
      pending &&
      pending.captionId === current.captionId &&
      pending.layerId === current.layerId &&
      (pending.sampleMs ?? pending.timeMs) === current.timeMs
    ) {
      pending.awaitingAck = true;
      handle.seek(pending.timeMs, 'at-or-after');
    } else {
      cueSeek.current = null;
      handle.seek(current.timeMs);
    }
  }, [handle]);
  const onTimeChange = useCallback(
    (timeMs: number, acknowledgedCueStartMs?: number) => {
      const pending = cueSeek.current;
      if (acknowledgedCueStartMs !== undefined) {
        if (!pending || acknowledgedCueStartMs !== pending.timeMs) return;
        pending.sampleMs = timeMs;
        pending.awaitingAck = false;
      } else if (pending) {
        // Ignore frame notifications queued before the acknowledgement of our cue seek.
        if (pending.awaitingAck) return;
        if (timeMs !== pending.sampleMs) cueSeek.current = null;
      }
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
  function selectAt(
    timeMs: number,
    sceneId: string | null = scene?.id ?? null,
    layerId: string | null = selection.layerId,
    captionId: string | null = null
  ) {
    cueSeek.current = null;
    const next = { sceneId, layerId, captionId, timeMs };
    selectionRef.current = next;
    select(next);
  }
  function seek(
    timeMs: number,
    sceneId: string | null = scene?.id ?? null,
    layerId: string | null = selection.layerId,
    captionId: string | null = layerId === selection.layerId ? selection.captionId : null,
    boundary?: 'at-or-after'
  ) {
    selectAt(timeMs, sceneId, layerId, captionId);
    if (boundary) {
      cueSeek.current = { ...selectionRef.current, awaitingAck: true };
      handle?.seek(timeMs, boundary);
    } else handle?.seek(timeMs);
  }
  function command(action: ProjectCommand) {
    const updated = session.dispatch(action);
    if (!updated || !draft) return;
    if (action.type === 'add-scene') {
      selectAt(sceneStartMs(updated, action.scene.id), action.scene.id, null);
    } else if (action.type === 'add-layer' || action.type === 'remove-layer') {
      selectAt(
        selection.timeMs,
        action.sceneId,
        action.type === 'add-layer' ? action.layer.id : null
      );
    } else if (action.type === 'remove-scene') {
      const index = draft.scenes.findIndex((item) => item.id === action.sceneId);
      const target = updated.scenes[index] ?? updated.scenes[index - 1];
      selectAt(target ? sceneStartMs(updated, target.id) : 0, target?.id ?? null, null);
    } else if (action.type === 'reorder-scene' && scene) {
      const local = Math.max(
        0,
        Math.min(scene.durationMs - 1, selection.timeMs - sceneStartMs(draft, scene.id))
      );
      selectAt(sceneStartMs(updated, scene.id) + local, scene.id, selection.layerId);
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
            {session.replacingAudio ? 'Guardando la toma…' : statusLabels[session.status]}
          </span>
          <button
            type="button"
            className="studio-icon"
            aria-label="Deshacer"
            title="Deshacer"
            onClick={undo}
            disabled={session.replacingAudio || !session.canUndo}
          >
            <Undo2 size={17} />
          </button>
          <button
            type="button"
            className="studio-icon"
            aria-label="Rehacer"
            title="Rehacer"
            onClick={redo}
            disabled={session.replacingAudio || !session.canRedo}
          >
            <Redo2 size={17} />
          </button>
          <button
            type="button"
            className="studio-primary"
            disabled={session.replacingAudio || !canSave}
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
      {timingIssues.length > 0 && (
        <div className="studio-warning" role="status">
          <strong>Exportación bloqueada por intervalos fuera de rango.</strong>
          <ul>
            {timingIssues.map((d, i) => (
              <li key={i}>
                {d.message} · {d.sceneId} / {d.layerId}
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="designer-layout" inert={session.replacingAudio}>
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
              disabled={!handle}
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
                <SceneExtension
                  key={scene.id}
                  document={draft}
                  scene={scene}
                  asset={dependencies.asset}
                  onCommand={command}
                />
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
          {scene && <NarrationEditor scene={scene} onCommand={command} />}
          {layer?.type === 'audio' && scene && (
            <AudioInspector
              key={JSON.stringify([draft.id, scene.id, layer.id])}
              scene={scene}
              layer={layer}
              onCommand={command}
              onReplace={session.replaceAudio}
            />
          )}
          {layer?.type === 'captions' && scene && (
            <CaptionEditor
              key={JSON.stringify([draft.id, scene.id, layer.id])}
              engine={draft.engine}
              scene={scene}
              layer={layer}
              selectedId={selection.captionId}
              localMs={selection.timeMs - sceneStartMs(draft, scene.id) - layer.startMs}
              onCommand={command}
              onSeek={(cue) =>
                seek(
                  Math.min(
                    draft.durationMs - 1,
                    sceneStartMs(draft, scene.id) + layer.startMs + cue.startMs
                  ),
                  scene.id,
                  layer.id,
                  cue.id,
                  'at-or-after'
                )
              }
            />
          )}
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
