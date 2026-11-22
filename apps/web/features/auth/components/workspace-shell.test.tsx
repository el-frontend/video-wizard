// @vitest-environment jsdom
import { useState } from 'react';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { WorkspaceShell } from './workspace-shell';
import { sessionEvents } from '../lib/session-events';
const { signOut, login, live } = vi.hoisted(() => ({
  signOut: vi.fn(),
  login: vi.fn(),
  live: { data: { session: { id: 'sid' }, user: { id: 'A' } }, isPending: false, error: null },
}));
vi.mock('@/lib/auth-client', () => ({
  authClient: {
    useSession: () => live,
    getSession: async () => live,
    signOut,
    signIn: { email: login },
  },
}));
vi.mock('next/navigation', () => ({ usePathname: () => '/designer/p' }));
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  live.data.user.id = 'A';
});
function Draft() {
  const [title, setTitle] = useState('');
  return <input aria-label="Título" value={title} onChange={(e) => setTitle(e.target.value)} />;
}
const shell = (
  <WorkspaceShell user={{ id: 'A', email: 'a@studio.test', name: 'Propietario A' }} sessionId="sid">
    <Draft />
  </WorkspaceShell>
);
it('authExpiryKeepsDirtyDocument and refuses a different account', async () => {
  render(shell);
  fireEvent.change(screen.getByLabelText('Título'), { target: { value: 'Cambios privados' } });
  act(() => window.dispatchEvent(new Event(sessionEvents.expired)));
  expect(screen.queryByRole('textbox', { name: 'Título' })).toBeNull();
  login.mockResolvedValueOnce({ data: { user: { id: 'A' } }, error: null });
  function submit() {
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@studio.test' },
    });
    fireEvent.change(screen.getByLabelText('Contraseña'), { target: { value: 'contraseña' } });
    fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
  }
  await act(async () => submit());
  expect(screen.getByDisplayValue('Cambios privados')).toBeTruthy();
  act(() => window.dispatchEvent(new Event(sessionEvents.expired)));
  login.mockResolvedValueOnce({ data: { user: { id: 'B' } }, error: null });
  await act(async () => submit());
  expect(screen.queryByDisplayValue('Cambios privados')).toBeNull();
});
it('cancelSignoutKeepsEditor', async () => {
  const dirty = (e: Event) => e.preventDefault();
  window.addEventListener(sessionEvents.checkDirty, dirty);
  try {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(shell);
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar sesión' }));
    expect(signOut).not.toHaveBeenCalled();
    expect(screen.getByLabelText('Título')).toBeTruthy();
  } finally {
    window.removeEventListener(sessionEvents.checkDirty, dirty);
  }
});
