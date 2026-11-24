'use client';

import { DraftRecovery, tabDraftWriter, type LocalDraft } from '../lib/draft-recovery';
import { sessionEvents } from '@/features/auth/lib/session-events';
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
  resolving: boolean;
  recoveryError: string;
  candidates: LocalDraft[];
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
    resolving: false,
    recoveryError: '',
    candidates: [],
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
  let pauseAutosave = false;
  let leaving = false;
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
  let epoch = 0;
  let store: DraftRecovery | undefined, local: LocalDraft | undefined;
  let suspended = false;
  let writer = crypto.randomUUID();
  const recoveryFailure =
    'No se pudo guardar el borrador en este navegador. Mantén la pestaña abierta.';
  function initializeRecovery(base: ProjectRecord) {
    try {
      store = new DraftRecovery(window.localStorage, base.ownerId, id, writer);
      const candidates = store.list(() =>
        update({ recoveryError: 'Hay un borrador local dañado que no se pudo leer.' })
      );
      update({
        candidates: candidates.filter(
          (e) => e.stamp !== local?.stamp && e.draft.engine === base.document.engine
        ),
      });
    } catch {
      update({ recoveryError: recoveryFailure });
    }
  }
  function persist(base: ProjectRecord, draft: ProjectDraft) {
    try {
      if (!store) initializeRecovery(base);
      if (!store) throw new Error();
      const previous = local;
      local = store.keep(base, draft);
      if (previous && previous.base.revision !== base.revision) store.remove(previous);
      if (state.recoveryError === recoveryFailure) update({ recoveryError: '' });
    } catch {
      update({ recoveryError: recoveryFailure });
    }
  }
  function removeLocal(entry = local) {
    if (!entry || !store) return;
    try {
      store.remove(entry);
      if (local?.stamp === entry.stamp) local = undefined;
    } catch {
      update({ recoveryError: 'No se pudo retirar esta versión del almacenamiento local.' });
    }
  }
  function validOperation(token: number) {
    return active && !suspended && token === epoch;
  }
  function install(record: ProjectRecord) {
    past.length = future.length = 0;
    update({
      saved: record,
      draft: record.document,
      conflict: null,
      status: 'saved',
      error: '',
      selection: reconcileSelection(record.document),
    });
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
      removeLocal();
      update({ draft, selection, status: 'saved', error: '' });
      return;
    }
    if (state.saved) persist(state.saved, draft);
    const status = state.conflict ? 'conflict' : flight ? 'saving' : 'dirty';
    update({ draft, selection, status, error: '' });
    pauseAutosave = false;
    if (!state.conflict)
      timer = setTimeout(() => {
        timer = undefined;
        void writeAfterFlight().catch(() => {});
      }, delay);
  }
  function dispatch(command: ProjectCommand) {
    const previous = state.draft;
    if (!previous || state.replacingAudio || state.resolving || suspended) return;
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
    if (state.replacingAudio || state.resolving || suspended) return;
    const next = from.pop();
    if (!next || !state.draft) return;
    to.push(state.draft);
    edited(next);
  }
  async function refresh() {
    if (read || flight || state.conflict || state.replacingAudio || state.resolving || suspended)
      return;
    const token = epoch;
    const request = new AbortController();
    read = request;
    const base = state.saved?.revision;
    try {
      const remote = await projectRequest<ProjectRecord>(url, { signal: request.signal });
      if (
        !validOperation(token) ||
        remote.document.id !== id ||
        (state.saved && remote.ownerId !== state.saved.ownerId) ||
        request.signal.aborted ||
        flight ||
        base !== state.saved?.revision ||
        remote.revision === base
      )
        return;
      if (!store) initializeRecovery(remote);
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
    const token = epoch,
      submittedLocal = local;
    try {
      const saved = await projectRequest<ProjectRecord>(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ baseRevision: base.revision, document: submitted }),
      });
      if (!validOperation(token) || saved.ownerId !== base.ownerId || saved.document.id !== id)
        throw new Error('El documento cambió durante el guardado.');
      const dirty = state.draft !== submitted;
      if (dirty && state.draft) persist(saved, state.draft);
      else removeLocal(submittedLocal);
      update({
        saved,
        draft: dirty ? state.draft : saved.document,
        status: dirty ? 'dirty' : 'saved',
        error: '',
      });
      notifyProjectSaved(saved.ownerId);
    } catch (cause) {
      if (!validOperation(token)) throw cause;
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
    if (suspended || !active || state.resolving)
      return Promise.reject(new Error('La operación está en pausa.'));
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
    if (active && !pauseAutosave && !timer && !flight) await writeNow();
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
  async function savedRevision() {
    await save();
    return state.saved;
  }
  async function postAudio(input: AudioReplacement, token: number) {
    await flushDraft();
    const base = state.saved;
    const layer = base?.document.scenes
      .find((s) => s.id === input.sceneId)
      ?.layers.find((l) => l.id === input.audioLayerId);
    if (!validOperation(token) || !base || layer?.type !== 'audio')
      throw new Error('La capa de audio ya no está disponible.');
    const saved = await projectRequest<ProjectRecord>(url + '/audio', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...input, baseRevision: base.revision }),
    });
    if (!validOperation(token) || saved.ownerId !== base.ownerId || saved.document.id !== id)
      throw new Error('El documento cambió durante la sustitución.');
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
    if (state.resolving || suspended)
      return Promise.reject(new Error('La operación está en pausa.'));
    if (state.replacingAudio)
      return Promise.reject(new Error('Ya hay una sustitución de audio en curso.'));
    if (state.conflict)
      return Promise.reject(new Error('Resuelve el conflicto antes de reemplazar la toma.'));
    read?.abort();
    update({ replacingAudio: true });
    const token = epoch;
    audioFlight = postAudio(input, token)
      .catch((cause: unknown) => {
        if (!validOperation(token)) throw cause;
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
        if (validOperation(token)) update({ replacingAudio: false });
      });
    return audioFlight;
  }
  async function resolveDocument(
    action: 'reload' | 'restore' | 'copy-draft' | 'repair',
    extra: Record<string, unknown> = {}
  ) {
    const base = state.saved,
      draft = state.draft;
    if (!base || !draft || state.resolving || suspended)
      throw new Error('La operación está en pausa.');
    const head = state.conflict ?? base,
      token = ++epoch,
      pending = local;
    stopTimer();
    read?.abort();
    update({ resolving: true, replacingAudio: false, error: '' });
    try {
      await Promise.allSettled([flight, audioFlight].filter(Boolean));
      if (!validOperation(token)) throw new Error('Cambió la sesión del proyecto.');
      const result =
        action === 'reload'
          ? await projectRequest<ProjectRecord>(url)
          : await projectRequest<ProjectRecord>(url + '/' + action, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(
                action === 'copy-draft'
                  ? { baseRevision: base.revision, document: draft }
                  : { baseRevision: head.revision, ...extra }
              ),
            });
      if (
        !validOperation(token) ||
        result.ownerId !== base.ownerId ||
        (action !== 'copy-draft' && result.document.id !== id)
      )
        throw new Error('Cambió la sesión del proyecto.');
      if (action === 'copy-draft') install(head);
      else install(result);
      removeLocal(pending);
      notifyProjectSaved(base.ownerId);
      return result;
    } catch (error) {
      if (validOperation(token)) {
        const conflict = error instanceof ProjectRequestError ? error.current : null;
        update({
          status:
            conflict || state.conflict
              ? 'conflict'
              : state.draft === state.saved?.document
                ? 'saved'
                : 'dirty',
          ...(conflict && { conflict }),
          error: error instanceof Error ? error.message : 'No se pudo completar la operación.',
        });
      }
      throw error;
    } finally {
      if (active && token === epoch) update({ resolving: false });
    }
  }
  function recover(candidate: LocalDraft) {
    const remote = state.saved;
    if (!remote || hasUnsavedChanges() || state.resolving || suspended || !store) return;
    try {
      const entry = store.list().find((e) => e.stamp === candidate.stamp);
      if (!entry || entry.draft.engine !== remote.document.engine) throw new Error();
      ++epoch;
      read?.abort();
      stopTimer();
      pauseAutosave = true;
      past.length = future.length = 0;
      const conflict = entry.base.revision === remote.revision ? null : remote;
      if (entry.writer === writer) local = entry;
      persist(entry.base, entry.draft);
      update({
        saved: entry.base,
        draft: entry.draft,
        conflict,
        status: conflict ? 'conflict' : 'dirty',
        selection: reconcileSelection(entry.draft),
        candidates: state.candidates.filter((e) => e.stamp !== entry.stamp),
      });
    } catch {
      update({ recoveryError: 'Esta versión del borrador ya no está disponible.' });
    }
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
    suspended = false;
    const attachWriter = async () => {
      const selected = await tabDraftWriter();
      if (!active || suspended || !state.saved) return;
      const previous = store,
        entry = local;
      writer = selected;
      initializeRecovery(state.saved);
      if (entry && entry.writer !== writer && state.draft && state.saved.document !== state.draft) {
        persist(state.saved, state.draft);
        if (local?.writer === writer)
          try {
            previous?.remove(entry);
          } catch {
            update({ recoveryError: recoveryFailure });
          }
      }
    };
    void attachWriter();
    if (state.saved) initializeRecovery(state.saved);
    // App Router can restore an older server payload on Back or Forward.
    void refresh();
    const onFocus = () => {
      void refresh();
    };
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') onFocus();
    }, pollInterval);
    const onExpire = () => {
      suspended = true;
      epoch++;
      read?.abort();
      update({
        resolving: false,
        replacingAudio: false,
        ...(state.status === 'saving' && {
          status: state.draft === state.saved?.document ? 'saved' : 'dirty',
        }),
      });
      pauseAutosave = true;
      stopTimer();
    };
    const onCheckDirty = (event: Event) => {
      if (hasUnsavedChanges()) event.preventDefault();
    };
    const onRestored = () => {
      suspended = false;
      void attachWriter();
      void refresh();
    };
    const onLeave = () => {
      onExpire();
      leaving = true;
      stopTimer();
      clearTabDrafts();
    };
    window.addEventListener('pagehide', onExpire);
    window.addEventListener('pageshow', onRestored);
    window.addEventListener(sessionEvents.accountChanged, onExpire);
    window.addEventListener(sessionEvents.ending, onExpire);
    window.addEventListener(sessionEvents.expired, onExpire);
    window.addEventListener(sessionEvents.restored, onRestored);
    window.addEventListener(sessionEvents.checkDirty, onCheckDirty);
    window.addEventListener(sessionEvents.leaving, onLeave);
    window.addEventListener('focus', onFocus);
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (!leaving && hasUnsavedChanges()) event.preventDefault();
    };
    window.addEventListener('beforeunload', beforeUnload);
    return () => {
      active = false;
      epoch++;
      stopTimer();
      read?.abort();
      read = null;
      clearInterval(interval);
      window.removeEventListener('pagehide', onExpire);
      window.removeEventListener('pageshow', onRestored);
      window.removeEventListener(sessionEvents.accountChanged, onExpire);
      window.removeEventListener(sessionEvents.ending, onExpire);
      window.removeEventListener(sessionEvents.expired, onExpire);
      window.removeEventListener(sessionEvents.restored, onRestored);
      window.removeEventListener(sessionEvents.checkDirty, onCheckDirty);
      window.removeEventListener(sessionEvents.leaving, onLeave);
      window.removeEventListener('focus', onFocus);
      window.removeEventListener('beforeunload', beforeUnload);
    };
  }
  function retainDraft(): () => void {
    if (!state.saved) return () => {};
    const slot = { session };
    retainedSessions.set(sessionKey(state.saved), slot);
    // Full document navigation (including sign-out) ends this recovery scope.
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
      resolveDocument,
      recover,
      replaceAudio,
      dispatch,
      hasUnsavedChanges,
      retainDraft,
      discardRetained,
      select: (selection: EditorSelection) => update({ selection }),
      undo: () => move(past, future),
      redo: () => move(future, past),
      save,
      savedRevision,
      refresh,
    },
  };
  return session;
}

export function useProjectSession(id: string, initial?: ProjectRecord) {
  const [entry, setEntry] = useState(() => ({
    id,
    owner: initial?.ownerId,
    session: openSession(id, initial),
  }));
  let session = entry.session;
  // RSC refreshes can return a fresh object for the same revision.
  if (entry.id !== id || entry.owner !== initial?.ownerId) {
    session = openSession(id, initial?.document.id === id ? initial : undefined);
    setEntry({ id, owner: initial?.ownerId, session });
  }
  useEffect(() => session.start(), [session]);
  const state = useSyncExternalStore(session.subscribe, session.snapshot, session.snapshot);
  return { ...state, ...session.actions };
}
