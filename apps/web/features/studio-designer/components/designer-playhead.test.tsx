// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import type { PreviewHandle, ProjectDraft, ProjectRecord } from '@workspace/video-project';
import { exampleProject } from '@workspace/video-project/fixtures';
import { Designer } from './designer';

// Expose only the private player's transport. The designer, debounce and session are real.
type PlayerProps = { document: ProjectDraft; onReady: (handle: PreviewHandle) => void };
let player: PlayerProps;
vi.mock('next/dynamic', () => ({
  default: () => (props: PlayerProps) => {
    player = props;
    return null;
  },
}));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock('sonner', () => ({ toast: { dismiss: vi.fn() } }));
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function transport() {
  let notify: (ms: number) => void = () => {};
  const handle: PreviewHandle = {
    play: vi.fn(),
    pause: vi.fn(),
    seek: vi.fn(),
    getTimeMs: () => 0,
    subscribe(listener) {
      notify = listener;
      return () => {};
    },
  };
  return { handle, queuedTime: (ms: number) => notify(ms) };
}

it('keeps the requested scene time across obsolete frame events, including undo to a shorter scene', async () => {
  const document: ProjectDraft = {
    ...exampleProject(),
    durationMs: 5000,
    scenes: [{ id: 'one', durationMs: 5000, layers: [] }],
    globalAudio: [],
    assetIds: [],
  };
  const initial: ProjectRecord = {
    ownerId: 'owner',
    revision: 'r1',
    updatedAt: '2026-11-21T00:00:00Z',
    document,
  };
  vi.stubGlobal(
    'fetch',
    vi.fn(async (_url: string, options?: RequestInit) =>
      options?.method === 'PUT'
        ? new Promise<Response>(() => {})
        : Response.json({ success: true, data: initial })
    )
  );
  render(<Designer initial={initial} />);
  const original = transport();
  act(() => player.onReady(original.handle));
  const position = screen.getByRole('slider', {
    name: 'Posición de reproducción',
  }) as HTMLInputElement;
  fireEvent.click(screen.getByRole('button', { name: 'Añadir escena' }));
  expect(original.handle.seek).not.toHaveBeenCalledWith(5000);
  act(() => original.queuedTime(4960));
  expect(position.value).toBe('5000');
  await waitFor(() => expect(player.document.scenes).toHaveLength(2));
  const longer = transport();
  act(() => player.onReady(longer.handle));
  expect(longer.handle.seek).toHaveBeenCalledWith(5000);
  act(() => original.queuedTime(4960));
  expect(position.value).toBe('5000');
  act(() => longer.queuedTime(9000));
  expect(position.value).toBe('9000');
  fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
  act(() => longer.queuedTime(9020));
  expect(position.value).toBe('4999');
  await waitFor(() => expect(player.document.scenes).toHaveLength(1));
  const shorter = transport();
  act(() => player.onReady(shorter.handle));
  expect(shorter.handle.seek).toHaveBeenCalledWith(4999);
  act(() => shorter.queuedTime(4960));
  expect(position.value).toBe('4960');
});

it('restores zero on the same paused Player when removing a scene is immediately undone', async () => {
  vi.useFakeTimers();
  try {
    const document: ProjectDraft = {
      ...exampleProject(),
      scenes: [
        { id: 'first', durationMs: 5000, layers: [] },
        { id: 'second', durationMs: 5000, layers: [] },
      ],
      globalAudio: [],
      assetIds: [],
      durationMs: 10000,
    };
    const initial: ProjectRecord = {
      ownerId: 'owner',
      revision: 'r1',
      updatedAt: '2026-11-21T00:00:00Z',
      document,
    };
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => Response.json({ success: true, data: initial }))
    );
    render(<Designer initial={initial} />);
    await act(async () => {});
    const paused = transport();
    let playerTime = 0;
    paused.handle.seek = vi.fn((ms) => {
      playerTime = ms;
    });
    act(() => player.onReady(paused.handle));
    const position = screen.getByRole('slider', {
      name: 'Posición de reproducción',
    }) as HTMLInputElement;
    fireEvent.click(screen.getByRole('button', { name: /Escena 2/ }));
    fireEvent.change(position, { target: { value: '7000' } });
    expect(playerTime).toBe(7000);
    fireEvent.click(screen.getByRole('button', { name: 'Quitar escena' }));
    expect(position.value).toBe('0');
    expect(playerTime).toBe(7000);
    fireEvent.click(screen.getByRole('button', { name: 'Deshacer' }));
    expect(player.document).toBe(document);
    expect(position.disabled).toBe(false);
    expect(position.value).toBe('0');
    expect(playerTime).toBe(0);
  } finally {
    vi.useRealTimers();
  }
});
