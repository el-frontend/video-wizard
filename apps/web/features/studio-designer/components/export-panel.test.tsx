// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { projectRequest } from '@/features/studio-projects/project-api';
import { ExportPanel } from './export-panel';
vi.mock('@/features/studio-projects/project-api', () => ({
  projectRequest: vi.fn(),
  projectsUrl: '/api/studio/projects',
}));
afterEach(cleanup);
it('labels older revisions and reuses the exact admission key after a lost response', async () => {
  const keys: string[] = [];
  const receipt = {
    id: 'abc',
    revision: 'original',
    engine: 'remotion',
    status: 'completed',
    progress: 100,
    artifacts: [{ name: 'video.mp4', url: '/owned/file' }],
  };
  vi.mocked(projectRequest).mockImplementation(async (_url, opts) => {
    if (!opts?.method) return [receipt];
    keys.push(JSON.parse(String(opts.body)).idempotencyKey);
    if (keys.length === 1) throw Error('Conexión interrumpida.');
    return receipt;
  });
  const view = render(<ExportPanel projectId="project" revision="current" disabled={false} />);
  const panel = view.container.querySelector('details')!;
  await act(async () => {
    panel.open = true;
    fireEvent(panel, new Event('toggle'));
  });
  expect(await screen.findByText(/Completada · Revisión anterior/)).toBeTruthy();
  expect(screen.getByRole('link', { name: 'Descargar MP4' }).getAttribute('href')).toBe(
    '/owned/file'
  );
  const button = screen.getByRole('button', { name: 'Exportar revisión guardada' });
  fireEvent.click(button);
  expect(await screen.findByRole('alert')).toBeTruthy();
  fireEvent.click(button);
  await waitFor(() => expect(keys).toHaveLength(2));
  expect(keys[1]).toBe(keys[0]);
});
