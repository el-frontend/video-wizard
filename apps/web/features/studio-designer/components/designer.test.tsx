// @vitest-environment jsdom
vi.mock('@/lib/authenticated-fetch', () => ({
  authenticatedFetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, init),
}));
import { isValidElement } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { toast } from 'sonner';
import type { ProjectRecord } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { guardProjectHistory } from '../hooks/project-navigation';
import { Designer } from './designer';

const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn(), warning: vi.fn() } }));
vi.mock('../hooks/project-navigation', () => ({
  studioNavigation: () => ({}),
  guardProjectHistory: vi.fn(() => () => {}),
}));
vi.mock('./preview-panel', () => ({ PreviewPanel: () => null }));

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it('keeps the conflicted active designer when reopening another draft is cancelled', async () => {
  const first: ProjectRecord = {
    document: exampleProject(),
    ownerId: 'owner',
    revision: 'r1',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const second = { ...first, document: { ...first.document, id: 'second', title: 'B' } };
  const remote = { ...second, revision: 'r2', document: { ...second.document, title: 'Remoto' } };
  const fetchProject = vi.fn<typeof fetch>(async (url, options) => {
    if (options?.method === 'PUT')
      return Response.json(
        { success: false, error: 'Conflicto', current: remote },
        { status: 409 }
      );
    return Response.json({ success: true, data: String(url).endsWith('/second') ? second : first });
  });
  vi.stubGlobal('fetch', fetchProject);
  const firstView = render(<Designer initial={first} />);
  await act(async () => {});
  const offerRecovery = vi.mocked(guardProjectHistory).mock.lastCall?.[4];
  expect(offerRecovery).toBeDefined();
  offerRecovery!();
  const action = vi.mocked(toast.warning).mock.lastCall?.[1]?.action;
  if (!isValidElement(action)) throw new Error('Recovery must offer a navigable project link');
  firstView.unmount();
  render(
    <>
      <Designer initial={second} />
      {action}
    </>
  );
  await act(async () => {});
  fireEvent.change(screen.getByLabelText('Título del proyecto'), { target: { value: 'Local B' } });
  fireEvent.click(screen.getByRole('button', { name: 'Guardar' }));
  await screen.findByText('Conflicto de revisiones');
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  fireEvent.click(screen.getByRole('link', { name: 'Reabrir borrador' }));
  await act(async () => {});
  expect(confirm).toHaveBeenCalledOnce();
  expect(router.push).not.toHaveBeenCalled();
  expect((screen.getByLabelText('Título del proyecto') as HTMLInputElement).value).toBe('Local B');
  expect(fetchProject.mock.calls.filter(([, options]) => options?.method === 'PUT')).toHaveLength(
    1
  );
});
