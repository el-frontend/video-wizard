// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { ProjectRecord } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
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
