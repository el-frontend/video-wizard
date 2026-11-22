// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { ProjectPage, ProjectRecord } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { useProjectSession } from '@/features/studio-designer/hooks/use-project-session';
import { useProjects } from './use-projects';

vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));
const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
const original: ProjectRecord = {
  ownerId: 'owner',
  revision: 'v1',
  updatedAt: '2026-01-01T00:00:00Z',
  document: exampleProject(),
};
const saved = {
  ...original,
  revision: 'v2',
  document: { ...original.document, title: 'Título confirmado' },
};
function pageFor(record: ProjectRecord): ProjectPage {
  return {
    items: [{ ...record.document, revision: record.revision, updatedAt: record.updatedAt }],
    nextCursor: null,
  };
}
const ok = (data: ProjectPage | ProjectRecord) => Response.json({ success: true, data });
function deferred() {
  let resolve!: (response: Response) => void;
  const promise = new Promise<Response>((complete) => {
    resolve = complete;
  });
  return { resolve, promise };
}
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['before', 'after'])(
  'refreshes a mounted library after a save when its old GET finishes %s the PUT',
  async (order) => {
    const oldGet = deferred(),
      put = deferred();
    const list = vi
      .fn<() => Promise<Response>>()
      .mockReturnValueOnce(oldGet.promise)
      .mockImplementation(async () => ok(pageFor(saved)));
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>((url, options) => {
        if (options?.method === 'PUT') return put.promise;
        if (url === '/api/studio/projects') return list();
        return Promise.resolve(ok(original));
      })
    );
    const editor = renderHook(() => useProjectSession(original.document.id, original));
    await act(async () => {});
    act(() => editor.result.current.dispatch({ type: 'set-title', title: saved.document.title }));
    let flush!: Promise<void>;
    act(() => {
      flush = editor.result.current.save();
    });
    editor.unmount();
    const library = renderHook(() => useProjects(pageFor(original), original.ownerId));
    expect(list).toHaveBeenCalledTimes(1);
    if (order === 'before')
      await act(async () => {
        oldGet.resolve(ok(pageFor(original)));
      });
    await act(async () => {
      put.resolve(ok(saved));
      await flush;
    });
    if (order === 'after')
      await act(async () => {
        oldGet.resolve(ok(pageFor(original)));
      });
    expect(library.result.current.page.items[0]?.title).toBe(saved.document.title);
    expect(list).toHaveBeenCalledTimes(2);
  }
);
