// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from '@testing-library/react';
import { afterEach, it, expect, vi } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { useEditorDependencies } from './use-editor-dependencies';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('reads the pinned component and private metadata, fencing obsolete project responses', async () => {
  const old = exampleProject(),
    next = { ...exampleProject(), id: 'next' };
  let release!: () => void;
  const pending = new Promise<void>((resolve) => {
    release = resolve;
  });
  let phase = 'old';
  const fetcher = vi.fn(async (url: string) => {
    const captured = phase;
    if (captured === 'old') await pending;
    const entry = url.includes('/libraries/')
      ? {
          id: 'card',
          version: 1,
          name: 'Cartel',
          kind: 'component',
          engine: 'remotion',
          assetIds: [],
          manifest: { version: 1, props: { [captured]: { type: 'string' } } },
        }
      : {
          id: 'voice',
          hash: '0'.repeat(64),
          mediaType: 'audio/wav',
          durationMs: captured === 'old' ? 1000 : 4000,
          name: 'Audio',
          ownerId: captured,
        };
    return url.includes('/music/')
      ? Response.json({ success: false, error: 'Recurso no encontrado.' }, { status: 404 })
      : Response.json({ success: true, data: entry });
  });
  vi.stubGlobal('fetch', fetcher);
  const hook = renderHook(({ project }) => useEditorDependencies(project), {
    initialProps: { project: old },
  });
  phase = 'next';
  hook.rerender({ project: next });
  await waitFor(() => expect(hook.result.current.asset('voice')?.durationMs).toBe(4000));
  expect(hook.result.current.manifest({ id: 'card', version: 1 })?.props).toEqual({
    next: { type: 'string' },
  });
  expect(hook.result.current.asset('music')).toBeNull();
  await act(async () => {
    release();
    await pending;
  });
  expect(hook.result.current.asset('voice')?.ownerId).toBe('next');
  expect(fetcher.mock.calls.map(([url]) => url)).toEqual(
    expect.arrayContaining([
      '/api/studio/assets/voice/metadata',
      '/api/studio/libraries/component/card/1',
    ])
  );
});
