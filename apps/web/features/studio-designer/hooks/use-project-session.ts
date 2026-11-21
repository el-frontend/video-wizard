'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import {
  applyCommand,
  type CaptionCue,
  type EditorSelection,
  type ProjectCommand,
  type ProjectDraft,
  type ProjectRecord,
} from '@workspace/video-project';
import {
  notifyProjectSaved,
  projectRequest,
  ProjectRequestError,
  projectsUrl,
} from '@/features/studio-projects/project-api';

type Status = 'loading' | 'saved' | 'dirty' | 'saving' | 'conflict' | 'error';
export type AudioReplacement = {
  sceneId: string;
  audioLayerId: string;
  assetId: string;
  captions?: CaptionCue[];
};
interface SessionState {
  replacingAudio: boolean;
  saved: ProjectRecord | null;
  draft: ProjectDraft | null;
  selection: EditorSelection;
  status: Status;
  conflict: ProjectRecord | null;
  error: string;
  canUndo: boolean;
  canRedo: boolean;
}
const emptySelection: EditorSelection = {
  sceneId: null,
  layerId: null,
  captionId: null,
  timeMs: 0,
};
const delay = 500;
const pollInterval = 15000;

// Only an unavoidable same-document exit can park a session here.
const retainedSessions = new Map<string, { session: ReturnType<typeof createSession> }>();
function sessionKey(record: ProjectRecord) {
  return JSON.stringify([record.ownerId, record.document.id, record.revision]);
}

function clearTabDrafts() {
  retainedSessions.clear();
}

function openSession(id: string, initial?: ProjectRecord) {
  if (initial?.document.id === id) {
    // The server payload may have a newer revision than the base of the retained draft.
    for (const slot of retainedSessions.values()) {
      const base = slot.session.snapshot().saved;
      if (
        base?.ownerId === initial.ownerId &&
        base.document.id === id &&
        retainedSessions.get(sessionKey(base)) === slot
      )
        return slot.session;
    }
  }
  return createSession(id, initial);
}

function createSession(id: string, initial?: ProjectRecord) {
  const url = projectsUrl + '/' + encodeURIComponent(id);
  let state: SessionState = {
    replacingAudio: false,
    saved: initial ?? null,
    draft: initial?.document ?? null,
    selection: emptySelection,
    status: initial ? 'saved' : 'loading',
    conflict: null,
    error: '',
    canUndo: false,
    canRedo: false,
  };
  const listeners = new Set<() => void>();
  const past: ProjectDraft[] = [];
  const future: ProjectDraft[] = [];
  let timer: ReturnType<typeof setTimeout> | undefined;
  let flight: Promise<void> | null = null;
  let read: AbortController | null = null;
  let active = false;
  function update(partial: Partial<SessionState>) {
    const previous = state.saved;
    state = { ...state, ...partial, canUndo: !!past.length, canRedo: !!future.length };
    if (partial.saved && previous) {
      const previousKey = sessionKey(previous);
      const slot = retainedSessions.get(previousKey);
      if (slot?.session === session) {
        retainedSessions.delete(previousKey);
        if (state.draft !== partial.saved.document)
          retainedSessions.set(sessionKey(partial.saved), slot);
      }
    }
    listeners.forEach((fn) => fn());
  }
  function stopTimer() {
    clearTimeout(timer);
    timer = undefined;
  }
  function reconcileSelection(draft: ProjectDraft) {
    const selected = state.selection;
    const scene = draft.scenes.find((item) => item.id === selected.sceneId);
    const selection = {
      ...selected,
      sceneId: scene?.id ?? null,
      layerId:
        scene?.layers.some((layer) => layer.id === selected.layerId) ||
        (!selected.sceneId && draft.globalAudio.some((layer) => layer.id === selected.layerId))
          ? selected.layerId
          : null,
      timeMs: Math.max(0, Math.min(selected.timeMs, draft.durationMs - 1)),
    };
    const selectedLayer = scene?.layers.find((l) => l.id === selection.layerId);
    if (
      selectedLayer?.type !== 'captions' ||
      !selectedLayer.cues.some((c) => c.id === selected.captionId)
    )
      selection.captionId = null;
    return selection;
  }
  function edited(draft: ProjectDraft) {
    stopTimer();
    const selection = reconcileSelection(draft);
    if (!state.conflict && !flight && draft === state.saved?.document) {
      update({ draft, selection, status: 'saved', error: '' });
      return;
    }
    const status = state.conflict ? 'conflict' : flight ? 'saving' : 'dirty';
    update({ draft, selection, status, error: '' });
    if (!state.conflict)
      timer = setTimeout(() => {
        timer = undefined;
        void writeAfterFlight().catch(() => {});
      }, delay);
  }
  function dispatch(command: ProjectCommand) {
    const previous = state.draft;
    if (!previous || state.replacingAudio) return;
    try {
      const next = applyCommand(previous, command);
      if (JSON.stringify(previous) === JSON.stringify(next)) return;
      past.push(previous);
      future.length = 0;
      edited(next);
      return next;
    } catch {
      update({ error: 'No se pudo aplicar el cambio al documento.' });
    }
  }
  function move(from: ProjectDraft[], to: ProjectDraft[]) {
    if (state.replacingAudio) return;
    const next = from.pop();
    if (!next || !state.draft) return;
    to.push(state.draft);
    edited(next);
  }
  async function refresh() {
    if (read || flight || state.conflict || state.replacingAudio) return;
    const request = new AbortController();
    read = request;
    const base = state.saved?.revision;
    try {
      const remote = await projectRequest<ProjectRecord>(url, { signal: request.signal });
      if (
        request.signal.aborted ||
        flight ||
        base !== state.saved?.revision ||
        remote.revision === base
      )
        return;
      if (state.saved && state.draft !== state.saved.document) {
        stopTimer();
        update({ status: 'conflict', conflict: remote });
      } else {
        past.length = future.length = 0;
        update({
          saved: remote,
          draft: remote.document,
          status: 'saved',
          error: '',
          selection: emptySelection,
        });
      }
    } catch (cause) {
      if (!request.signal.aborted && !state.saved)
        update({
          status: 'error',
          error: cause instanceof Error ? cause.message : 'No se pudo abrir el proyecto.',
        });
    } finally {
      if (read === request) read = null;
    }
  }
  async function write(base: ProjectRecord, submitted: ProjectDraft) {
    try {
      const saved = await projectRequest<ProjectRecord>(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: base.revision, document: submitted }),
      });
      const dirty = state.draft !== submitted;
      update({
        saved,
        draft: dirty ? state.draft : saved.document,
        status: dirty ? 'dirty' : 'saved',
        error: '',
      });
      notifyProjectSaved(saved.ownerId);
    } catch (cause) {
      stopTimer();
      const conflict = cause instanceof ProjectRequestError ? cause.current : null;
      update({
        status: conflict ? 'conflict' : 'error',
        conflict,
        error: cause instanceof Error ? cause.message : 'No se pudo guardar el proyecto.',
      });
      throw cause;
    } finally {
      flight = null;
    }
  }
  function writeNow(): Promise<void> {
    if (state.conflict)
      return Promise.reject(new Error('Hay que resolver el conflicto de revisiones.'));
    if (!state.saved || !state.draft)
      return Promise.reject(new Error('El proyecto aún no está disponible.'));
    if (state.draft === state.saved.document) return Promise.resolve();
    read?.abort();
    update({ status: 'saving', error: '' });
    flight = write(state.saved, state.draft);
    return flight;
  }
  async function writeAfterFlight() {
    if (flight) await flight;
    // A later edit restarted the debounce while this callback waited for the server.
    if (active && !timer && !flight) await writeNow();
  }
  async function flushDraft() {
    stopTimer();
    // An explicit save settles all newer edits before a dependent action can proceed.
    do {
      if (flight) await flight;
      else await writeNow();
      stopTimer();
    } while (state.saved && state.draft !== state.saved.document);
  }
  let audioFlight: Promise<void> | null = null;
  async function save() {
    const previousAudio = audioFlight;
    await flushDraft();
    await (previousAudio ?? audioFlight);
  }
  async function postAudio(input: AudioReplacement) {
    await flushDraft();
    const base = state.saved;
    const layer = base?.document.scenes
      .find((s) => s.id === input.sceneId)
      ?.layers.find((l) => l.id === input.audioLayerId);
    if (!active || !base || layer?.type !== 'audio')
      throw new Error('La capa de audio ya no está disponible.');
    const saved = await projectRequest<ProjectRecord>(url + '/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, baseRevision: base.revision }),
    });
    past.push(base.document);
    future.length = 0;
    update({
      saved,
      draft: saved.document,
      status: 'saved',
      error: '',
      selection: reconcileSelection(saved.document),
    });
    notifyProjectSaved(saved.ownerId);
  }
  function replaceAudio(input: AudioReplacement): Promise<void> {
    if (state.replacingAudio)
      return Promise.reject(new Error('Ya hay una sustitución de audio en curso.'));
    if (state.conflict)
      return Promise.reject(new Error('Resuelve el conflicto antes de reemplazar la toma.'));
    read?.abort();
    update({ replacingAudio: true });
    audioFlight = postAudio(input)
      .catch((cause: unknown) => {
        const conflict = cause instanceof ProjectRequestError ? cause.current : state.conflict;
        update({
          status: conflict ? 'conflict' : state.draft === state.saved?.document ? 'saved' : 'error',
          conflict,
          error: cause instanceof Error ? cause.message : 'No se pudo sustituir la toma.',
        });
        throw cause;
      })
      .finally(() => {
        audioFlight = null;
        update({ replacingAudio: false });
      });
    return audioFlight;
  }
  function hasUnsavedChanges() {
    return (
      !!state.draft &&
      (state.draft !== state.saved?.document ||
        !!flight ||
        state.replacingAudio ||
        !!state.conflict)
    );
  }
  function discardRetained() {
    if (!state.saved) return;
    const key = sessionKey(state.saved);
    if (retainedSessions.get(key)?.session === session) retainedSessions.delete(key);
  }
  function start() {
    active = true;
    // App Router can restore an older server payload on Back or Forward.
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') onFocus();
    }, pollInterval);
    window.addEventListener('focus', onFocus);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      active = false;
      stopTimer();
      read?.abort();
      read = null;
      clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }
  function retainDraft(): () => void {
    if (!state.saved) return () => {};
    const slot = { session };
    retainedSessions.set(sessionKey(state.saved), slot);
    // Full document navigation (including Auth.js sign-out) ends this recovery scope.
    window.addEventListener('pagehide', clearTabDrafts, { once: true });
    return () => {
      if (!state.saved) return;
      const key = sessionKey(state.saved);
      if (retainedSessions.get(key) === slot) retainedSessions.delete(key);
    };
  }
  const session = {
    start,
    snapshot: () => state,
    subscribe: (fn: () => void) => {
      listeners.add(fn);
      return () => {
        listeners.delete(fn);
      };
    },
    actions: {
      replaceAudio,
      dispatch,
      hasUnsavedChanges,
      retainDraft,
      discardRetained,
      select: (selection: EditorSelection) => update({ selection }),
      undo: () => move(past, future),
      redo: () => move(future, past),
      save,
      refresh,
    },
  };
  return session;
}

export function useProjectSession(id: string, initial?: ProjectRecord) {
  const [entry, setEntry] = useState(() => ({ id, session: openSession(id, initial) }));
  let session = entry.session;
  // RSC refreshes can return a fresh object for the same revision.
  if (entry.id !== id) {
    session = openSession(id, initial?.document.id === id ? initial : undefined);
    setEntry({ id, session });
  }
  useEffect(() => session.start(), [session]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  return { ...state, ...session.actions };
}
