// @vitest-environment jsdom
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));
import {
  act,
  cleanup,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { initialTemplates } from '@/server/services/studio/initial-templates';
import type { EntryOf, LibraryRef } from '@workspace/video-project';
import { LibraryBrowser } from './library-browser';
import { useLibrary } from '../hooks/use-library';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it.each(['install', 'publish'] as const)(
  'uses the new template version on the same unfiltered page after %s',
  async (action) => {
    const template = initialTemplates()[0]!;
    let entries = action === 'install' ? [] : [template];
    const calls: LibraryRef[] = [];
    const ok = (value: unknown) => Response.json({ success: true, data: value });
    let releaseVerification!: () => void;
    const verification = new Promise<void>((resolve) => {
      releaseVerification = resolve;
    });
    let written = false;
    vi.stubGlobal(
      'fetch',
      vi.fn<typeof fetch>(async (url, options) => {
        const path = String(url);
        if (options?.method === 'POST') {
          if (path.endsWith('/instantiate')) {
            calls.push(JSON.parse(String(options.body)).templateRef);
            return ok({ document: { id: 'project' } });
          }
          const next =
            action === 'install'
              ? template
              : (JSON.parse(String(options.body)) as EntryOf<'template'>);
          entries = [next, ...entries];
          written = true;
          return ok(next);
        }
        if (path.startsWith('/api/studio/libraries/template')) {
          const rows = [...entries];
          if (written && path.includes('verified=1')) await verification;
          return ok(rows);
        }
        return ok([]);
      })
    );
    render(<LibraryBrowser kind="template" />);
    const targetVersion = action === 'install' ? 1 : 2;
    if (action === 'install') {
      const install = await screen.findByRole('button', { name: 'Instalar catálogo inicial' });
      await act(async () => {});
      fireEvent.click(install);
    } else {
      await screen.findByRole('button', { name: 'Crear proyecto desde plantilla' });
      fireEvent.click(screen.getByRole('button', { name: 'Editar plantilla' }));
      fireEvent.click(screen.getByRole('button', { name: 'Publicar plantilla' }));
      await screen.findByText('Short con subtítulos · v2 publicada.');
      fireEvent.click(await screen.findByRole('button', { name: 'Usar plantilla' }));
    }
    await screen.findByRole('heading', { name: template.name });
    expect(await screen.findByText('Comprobando la plantilla…')).toBeTruthy();
    await act(async () => {
      releaseVerification();
    });
    fireEvent.click(await screen.findByRole('button', { name: 'Crear proyecto desde plantilla' }));
    await waitFor(() => expect(calls).toEqual([{ id: template.id, version: targetVersion }]));
    expect((screen.getByRole('combobox', { name: /Motor/ }) as HTMLSelectElement).value).toBe('');
  }
);

it.each([undefined, 'remotion'] as const)(
  'ignores a late response from an earlier catalog generation for engine %s',
  async (engine) => {
    const template = initialTemplates()[0]!;
    let completeOld!: (response: Response) => void;
    const old = new Promise<Response>((resolve) => {
      completeOld = resolve;
    });
    const read = vi
      .fn<typeof fetch>()
      .mockReturnValueOnce(old)
      .mockResolvedValueOnce(Response.json({ success: true, data: [template] }));
    vi.stubGlobal('fetch', read);
    const hook = renderHook(({ generation }) => useLibrary('template', engine, { generation }), {
      initialProps: { generation: 0 },
    });
    await waitFor(() => expect(read).toHaveBeenCalledTimes(1));
    hook.rerender({ generation: 1 });
    await waitFor(() => expect(hook.result.current.entries).toEqual([template]));
    await act(async () => {
      completeOld(Response.json({ success: true, data: [] }));
    });
    expect(hook.result.current.entries).toEqual([template]);
    expect(hook.result.current.loading).toBe(false);
  }
);
