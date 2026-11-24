// @vitest-environment jsdom
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import * as recovery from '../lib/draft-recovery';
import { useProjectSession } from './use-project-session';

const initial: ProjectRecord = {
  ownerId: 'owner',
  revision: 'v1',
  updatedAt: '2026-01-01T00:00:00Z',
  document: exampleProject(),
};
const record = (revision: string, title: string) => ({
  ...initial,
  revision,
  document: { ...initial.document, title },
});
const ok = (data: ProjectRecord) => Response.json({ success: true, data });
const request = vi.fn<typeof fetch>();
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { resolve, promise };
}
async function open() {
  request.mockResolvedValueOnce(ok(initial));
  const view = renderHook(() => useProjectSession('project'));
  await act(async () => {});
  return view.result;
}
const tick = (ms: number) =>
  act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('fetch', request.mockReset());
});
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('debounces valid edits and never replaces an unsent edit with an older save response', async () => {
  const result = await open();
  expect(result.current.status).toBe('saved');
  const first = deferred();
  request.mockReturnValueOnce(first.promise).mockResolvedValueOnce(ok(record('v3', 'B')));
  act(() => result.current.dispatch({ type: 'set-title', title: 'A' }));
  await tick(499);
  expect(request).toHaveBeenCalledTimes(1);
  await tick(1);
  expect(result.current.status).toBe('saving');
  act(() => result.current.dispatch({ type: 'set-title', title: 'B' }));
  await tick(500);
  expect(request).toHaveBeenCalledTimes(2);
  await act(async () => {
    first.resolve(ok(record('v2', 'A')));
  });
  expect(result.current.draft?.title).toBe('B');
  expect(
    request.mock.calls.slice(1).map(([, init]) => {
      const body = JSON.parse(String(init?.body));
      return [init?.method, body.baseRevision, body.document.title];
    })
  ).toEqual([
    ['PUT', 'v1', 'A'],
    ['PUT', 'v2', 'B'],
  ]);
  expect(result.current.saved?.revision).toBe('v3');
});

it('retains a newer draft and remote revision on 409, blocking any automatic overwrite', async () => {
  const result = await open();
  const pending = deferred();
  request.mockReturnValueOnce(pending.promise);
  act(() => result.current.dispatch({ type: 'set-title', title: 'A' }));
  await tick(500);
  act(() => result.current.dispatch({ type: 'set-title', title: 'B' }));
  await act(async () => {
    pending.resolve(
      Response.json(
        { success: false, error: 'Conflicto', current: record('remote', 'Remoto') },
        { status: 409 }
      )
    );
  });
  expect(result.current.status).toBe('conflict');
  expect(result.current.draft?.title).toBe('B');
  expect(result.current.conflict?.revision).toBe('remote');
  await expect(result.current.save()).rejects.toThrow();
  await tick(2000);
  expect(request).toHaveBeenCalledTimes(2);
});

it('keeps selection local and writes undo and redo as new revisions', async () => {
  const result = await open();
  act(() =>
    result.current.select({ sceneId: 'intro', layerId: null, captionId: null, timeMs: 1500 })
  );
  await tick(1000);
  expect(request).toHaveBeenCalledTimes(1);
  for (const [i, title] of ['Editado', initial.document.title, 'Editado'].entries()) {
    request.mockResolvedValueOnce(ok(record('v' + (i + 2), title)));
    act(() => {
      if (i === 0) result.current.dispatch({ type: 'set-title', title });
      if (i === 1) result.current.undo();
      if (i === 2) result.current.redo();
    });
    await act(async () => {
      await result.current.save();
    });
    expect(result.current.saved?.document.title).toBe(title);
    expect(JSON.parse(String(request.mock.lastCall?.[1]?.body)).baseRevision).toBe('v' + (i + 1));
  }
});

it('adopts an external revision while clean without making it a local undo action', async () => {
  const result = await open();
  request.mockResolvedValueOnce(ok(record('v2', 'Cambio local')));
  act(() => result.current.dispatch({ type: 'set-title', title: 'Cambio local' }));
  await tick(500);
  request.mockResolvedValueOnce(ok(record('remote', 'Externo')));
  await act(async () => {
    window.dispatchEvent(new Event('focus'));
  });
  act(() => result.current.undo());
  expect(result.current.status).toBe('saved');
  expect(result.current.draft?.title).toBe('Externo');
  expect(request).toHaveBeenCalledTimes(3);
});

it('can retry a failed write explicitly and preserves the draft', async () => {
  const result = await open();
  request.mockRejectedValueOnce(new Error('offline'));
  act(() => result.current.dispatch({ type: 'set-title', title: 'Conservar' }));
  await tick(500);
  expect(result.current.status).toBe('error');
  expect(result.current.draft?.title).toBe('Conservar');
  await tick(1000);
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce(ok(record('v2', 'Conservar')));
  await act(async () => {
    await result.current.save();
  });
  expect(result.current.status).toBe('saved');
});

it('keeps a dirty session across a server component refresh for the same project', async () => {
  const view = renderHook(
    ({ seed }: { seed: ProjectRecord }) => useProjectSession('project', seed),
    { initialProps: { seed: initial } }
  );
  act(() => view.result.current.dispatch({ type: 'set-title', title: 'En edición' }));
  view.rerender({ seed: structuredClone(initial) });
  expect(view.result.current.draft?.title).toBe('En edición');
  expect(view.result.current.status).toBe('dirty');
});

it('flushes edits made during an explicit save before resolving the action', async () => {
  const result = await open();
  const first = deferred(),
    second = deferred();
  request.mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
  act(() => result.current.dispatch({ type: 'set-title', title: 'Primer cambio' }));
  let settled = false;
  let flushing!: Promise<void>;
  act(() => {
    flushing = result.current.save().then(() => {
      settled = true;
    });
  });
  act(() => result.current.dispatch({ type: 'set-title', title: 'Último cambio' }));
  await act(async () => {
    first.resolve(ok(record('v2', 'Primer cambio')));
  });
  expect(settled).toBe(false);
  expect(JSON.parse(String(request.mock.lastCall?.[1]?.body)).baseRevision).toBe('v2');
  await act(async () => {
    second.resolve(ok(record('v3', 'Último cambio')));
    await flushing;
  });
  expect(result.current.saved?.revision).toBe('v3');
});

it('returns to saved when an edit is undone before the debounce', async () => {
  const result = await open();
  act(() => result.current.dispatch({ type: 'set-title', title: 'Temporal' }));
  act(() => result.current.undo());
  expect(result.current.status).toBe('saved');
  await tick(1000);
  expect(request).toHaveBeenCalledTimes(1);
  expect(result.current.canRedo).toBe(true);
});

it('keeps the 409 record when an older focus read finishes after the rejected write', async () => {
  const result = await open();
  const older = deferred();
  request.mockReturnValueOnce(older.promise);
  act(() => {
    window.dispatchEvent(new Event('focus'));
  });
  expect(request).toHaveBeenCalledTimes(2);
  request.mockResolvedValueOnce(
    Response.json(
      { success: false, error: 'Conflicto', current: record('R3', 'Revisión actual') },
      { status: 409 }
    )
  );
  act(() => result.current.dispatch({ type: 'set-title', title: 'Borrador local' }));
  await tick(500);
  expect(result.current.conflict?.revision).toBe('R3');
  await act(async () => {
    older.resolve(ok(record('R2', 'Lectura antigua')));
  });
  expect(result.current.conflict?.revision).toBe('R3');
  expect(result.current.draft?.title).toBe('Borrador local');
  expect(result.current.status).toBe('conflict');
  await tick(1000);
  expect(request).toHaveBeenCalledTimes(3);
});

it('resumes a retained conflict only for the original owner and project in the same tab', async () => {
  request.mockResolvedValueOnce(ok(initial));
  const editor = renderHook(() => useProjectSession('project', initial));
  await act(async () => {});
  const remote = record('remote', 'Versión remota');
  request.mockResolvedValueOnce(
    Response.json({ success: false, error: 'Conflicto', current: remote }, { status: 409 })
  );
  act(() => editor.result.current.dispatch({ type: 'set-title', title: 'Edición pendiente' }));
  await tick(500);
  editor.result.current.retainDraft();
  editor.unmount();
  const otherSeed = { ...initial, ownerId: 'different-owner' };
  request.mockResolvedValueOnce(ok(otherSeed));
  const other = renderHook(() => useProjectSession('project', otherSeed));
  await act(async () => {});
  expect(other.result.current.draft?.title).toBe(initial.document.title);
  other.unmount();
  // Next may restore the old server payload even though the 409 already supplied a newer record.
  const recovered = renderHook(() => useProjectSession('project', initial));
  expect(recovered.result.current.draft?.title).toBe('Edición pendiente');
  expect(recovered.result.current.conflict?.revision).toBe('remote');
  expect(recovered.result.current.canUndo).toBe(true);
  expect(recovered.result.current.status).toBe('conflict');
});

it.each(['discard', 'pagehide', 'confirmed save'])(
  'releases a retained session on %s',
  async (reason) => {
    request.mockResolvedValueOnce(ok(initial));
    const editor = renderHook(() => useProjectSession('project', initial));
    await act(async () => {});
    act(() => editor.result.current.dispatch({ type: 'set-title', title: 'Otra edición' }));
    const release = editor.result.current.retainDraft();
    if (reason === 'discard') release();
    if (reason === 'pagehide') window.dispatchEvent(new Event('pagehide'));
    const confirmed = reason === 'confirmed save' ? record('saved', 'Otra edición') : initial;
    if (reason === 'confirmed save') {
      request.mockResolvedValueOnce(ok(confirmed));
      await act(() => editor.result.current.save());
    }
    editor.unmount();
    request.mockResolvedValueOnce(ok(confirmed));
    const reopened = renderHook(() => useProjectSession('project', confirmed));
    await act(async () => {});
    expect(reopened.result.current.draft?.title).toBe(confirmed.document.title);
    expect(reopened.result.current.canUndo).toBe(false);
  }
);
it('flushes edits on a pending PUT then adopts its audio POST as one undoable revision', async () => {
  const result = await open();
  const put = deferred(),
    post = deferred();
  request
    .mockReturnValueOnce(put.promise)
    .mockResolvedValueOnce(ok(record('v3', 'Último')))
    .mockReturnValueOnce(post.promise);
  act(() => result.current.dispatch({ type: 'set-title', title: 'Primero' }));
  await tick(500);
  act(() => result.current.dispatch({ type: 'set-title', title: 'Último' }));
  let earlySettled = false;
  const earlySave = result.current.save().then(() => {
    earlySettled = true;
  });
  let replacement!: Promise<void>;
  act(() => {
    replacement = result.current.replaceAudio({
      sceneId: 'intro',
      audioLayerId: 'speech',
      assetId: 'nuevo',
    });
  });
  expect(result.current.replacingAudio).toBe(true);
  act(() => {
    result.current.dispatch({ type: 'set-title', title: 'Bloqueado' });
    result.current.undo();
  });
  await act(async () => {
    put.resolve(ok(record('v2', 'Primero')));
  });
  expect(
    request.mock.calls
      .slice(1)
      .map(([, init]) => [init?.method, JSON.parse(String(init?.body)).baseRevision])
  ).toEqual([
    ['PUT', 'v1'],
    ['PUT', 'v2'],
    ['POST', 'v3'],
  ]);
  const confirmed = record('v4', 'Último');
  confirmed.document.assetIds = [...confirmed.document.assetIds, 'nuevo'];
  let saved = false;
  const save = result.current.save().then(() => {
    saved = true;
  });
  await tick(1000);
  expect(saved).toBe(false);
  expect(earlySettled).toBe(false);
  await act(async () => {
    post.resolve(ok(confirmed));
    await replacement;
    await save;
    await earlySave;
  });
  expect(result.current.draft).toEqual(confirmed.document);
  expect(result.current.saved?.document).toBe(result.current.draft);
  await tick(1500);
  expect(request).toHaveBeenCalledTimes(4);
  act(() => result.current.undo());
  expect(result.current.draft).toEqual(record('v3', 'Último').document);
  act(() => result.current.redo());
  expect(result.current.draft).toEqual(confirmed.document);
});
it('keeps the flushed draft and remote revision when the audio POST conflicts', async () => {
  const result = await open();
  request
    .mockResolvedValueOnce(ok(record('v2', 'Local')))
    .mockResolvedValueOnce(
      Response.json(
        { success: false, error: 'Conflicto', current: record('v3', 'Remoto') },
        { status: 409 }
      )
    );
  act(() => result.current.dispatch({ type: 'set-title', title: 'Local' }));
  await act(async () => {
    await expect(
      result.current.replaceAudio({ sceneId: 'intro', audioLayerId: 'speech', assetId: 'otro' })
    ).rejects.toThrow();
  });
  expect(result.current.conflict?.revision).toBe('v3');
  expect(result.current.draft?.title).toBe('Local');
  expect(result.current.replacingAudio).toBe(false);
  await tick(1500);
  expect(request).toHaveBeenCalledTimes(3);
});

it('keeps the 401 draft and only refreshes its base on reauthentication until an explicit save', async () => {
  const result = await open();
  request.mockResolvedValueOnce(
    Response.json({ success: false, error: 'Sesión caducada' }, { status: 401 })
  );
  act(() => result.current.dispatch({ type: 'set-title', title: 'Edición privada' }));
  await tick(500);
  expect(result.current.hasUnsavedChanges()).toBe(true);
  request.mockResolvedValueOnce(ok(initial));
  await act(async () => {
    window.dispatchEvent(new Event('studio:session-restored'));
  });
  await tick(1000);
  expect(result.current.draft?.title).toBe('Edición privada');
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(1);
  request.mockResolvedValueOnce(ok(record('v2', 'Edición privada')));
  await act(async () => {
    await result.current.save();
  });
  expect(result.current.hasUnsavedChanges()).toBe(false);
});
it('never reuses a dirty session when the same project id is rendered with another owner', async () => {
  request.mockResolvedValue(ok(initial));
  const view = renderHook(({ source }) => useProjectSession(source.document.id, source), {
    initialProps: { source: initial },
  });
  await act(async () => {});
  act(() => view.result.current.dispatch({ type: 'set-title', title: 'Privado de A' }));
  const other = { ...record('v2', 'De B'), ownerId: 'other' };
  request.mockResolvedValue(ok(other));
  view.rerender({ source: other });
  await tick(1000);
  expect(view.result.current.draft?.title).toBe('De B');
  expect(request.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(0);
});

it('fences an earlier audio response when explicitly reloading a fresh head', async () => {
  const editor = await open(),
    audio = deferred();
  request.mockReturnValueOnce(audio.promise);
  let replacing!: Promise<unknown>;
  await act(async () => {
    replacing = editor.current
      .replaceAudio({ sceneId: 'intro', audioLayerId: 'speech', assetId: 'replacement' })
      .catch((e) => e);
  });
  const fresh = record('new-head', 'Edición posterior');
  request.mockResolvedValueOnce(ok(fresh));
  const reloading = editor.current.resolveDocument('reload');
  await act(async () => {
    audio.resolve(ok(record('audio', 'Respuesta anterior')));
    await replacing;
    await reloading;
  });
  expect(editor.current.saved).toEqual(fresh);
  expect(editor.current.draft?.title).toBe(fresh.document.title);
  expect(editor.current.canUndo).toBe(false);
  expect(editor.current.replacingAudio).toBe(false);
});
it('retains an unacknowledged local draft when the account changes after editor navigation', async () => {
  localStorage.clear();
  request.mockResolvedValueOnce(ok(initial));
  const editor = renderHook(() => useProjectSession('project', initial));
  await act(async () => {});
  act(() => editor.result.current.dispatch({ type: 'set-title', title: 'A' }));
  const put = deferred();
  request.mockReturnValueOnce(put.promise);
  const pending = editor.result.current.save();
  editor.unmount();
  window.dispatchEvent(new Event('studio:account-changed'));
  put.resolve(ok(record('v2', 'A')));
  await expect(pending).rejects.toThrow();
  expect(Object.values(localStorage).some((value) => JSON.parse(value).draft?.title === 'A')).toBe(
    true
  );
});
it('recovers the offered same-tab draft after saving a different edit on the same head', async () => {
  localStorage.clear();
  const writer = vi.spyOn(recovery, 'tabDraftWriter').mockResolvedValue('same-tab');
  try {
    request.mockResolvedValueOnce(ok(initial));
    const first = renderHook(() => useProjectSession('project', initial));
    await act(async () => {});
    act(() => first.result.current.dispatch({ type: 'set-title', title: 'A' }));
    first.unmount();
    request.mockResolvedValueOnce(ok(initial));
    const next = renderHook(() => useProjectSession('project', initial));
    await act(async () => {});
    const offered = next.result.current.candidates.find((c) => c.draft.title === 'A')!;
    expect(offered.writer).toBe('same-tab');
    act(() => next.result.current.dispatch({ type: 'set-title', title: 'B' }));
    request.mockResolvedValueOnce(ok(record('v2', 'B')));
    await act(async () => {
      await next.result.current.save();
    });
    act(() => next.result.current.recover(offered));
    expect(next.result.current.draft?.title).toBe('A');
    expect(next.result.current.conflict?.revision).toBe('v2');
  } finally {
    writer.mockRestore();
  }
});
