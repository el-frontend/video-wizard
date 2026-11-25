// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { projectRequest } from '@/features/studio-projects/project-api';
import { exampleProject } from '@workspace/video-project/fixtures';
import { AssistantPanel } from './assistant-panel';

vi.mock('@/features/studio-projects/project-api', () => ({ projectRequest: vi.fn() }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

it('keeps a draft addressed to its original binding until another conversation is explicitly selected', async () => {
  const first = { bindingId: 'first-id', provider: 'codex' },
    second = { bindingId: 'second-id', provider: 'claude' };
  let available = [first, second];
  const sent: unknown[] = [];
  vi.mocked(projectRequest).mockImplementation(async (url, init) => {
    if (url.startsWith('/api/studio/companion?')) return available;
    if (init?.method === 'POST') sent.push(JSON.parse(String(init.body)));
    return [];
  });
  const poll = vi.spyOn(globalThis, 'setInterval');
  const record = {
    document: exampleProject(),
    revision: 'rev',
    ownerId: 'owner',
    updatedAt: '2026-01-01T00:00:00Z',
  };
  const view = render(
    <AssistantPanel
      project={record.document.id}
      savedRevision={async () => record}
      selection={{ sceneId: null, layerId: null, captionId: null, timeMs: 0 }}
    />
  );
  const panel = view.container.querySelector('details')!;
  await act(async () => {
    panel.open = true;
    fireEvent(panel, new Event('toggle'));
  });
  const select = await screen.findByLabelText<HTMLSelectElement>('Conversación vinculada');
  const message = screen.getByLabelText<HTMLTextAreaElement>('Instrucciones para el chat');
  const submit = screen.getByRole<HTMLButtonElement>('button', {
    name: 'Enviar al chat vinculado',
  });
  fireEvent.change(select, { target: { value: second.bindingId } });
  fireEvent.change(message, { target: { value: 'Revisar este titular' } });
  available = [first];
  const tick = poll.mock.calls.find(([, ms]) => ms === 3500)?.[0] as () => Promise<void>;
  await act(async () => {
    await tick();
  });
  expect(submit.disabled).toBe(true);
  expect(screen.getByText(/conversación.*no disponible/i)).toBeTruthy();
  expect(message.value).toBe('Revisar este titular');
  fireEvent.click(submit);
  expect(sent).toHaveLength(0);
  available = [first, second];
  await act(async () => {
    await tick();
  });
  expect(submit.disabled).toBe(true);
  fireEvent.change(select, { target: { value: first.bindingId } });
  fireEvent.click(submit);
  await waitFor(() => expect(sent).toHaveLength(1));
  expect(sent[0]).toMatchObject({
    bindingId: first.bindingId,
    provider: first.provider,
    message: 'Revisar este titular',
  });
});
