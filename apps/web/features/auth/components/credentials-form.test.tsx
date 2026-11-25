// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CredentialsForm } from './credentials-form';
const { login } = vi.hoisted(() => ({ login: vi.fn() }));
vi.mock('@/lib/auth-client', () => ({ authClient: { signIn: { email: login } } }));
afterEach(cleanup);
it.each([' x ', ' e\u0301'.repeat(130)])(
  'preserves the exact historical password on sign-in',
  async (password) => {
    login.mockResolvedValue({ data: { user: { id: 'u' } } });
    render(<CredentialsForm onSuccess={() => {}} />);
    const field = screen.getByLabelText('Contraseña') as HTMLInputElement;
    expect(field.getAttribute('maxlength')).toBeNull();
    expect(field.getAttribute('minlength')).toBeNull();
    fireEvent.change(screen.getByLabelText('Correo electrónico'), {
      target: { value: 'a@test.test' },
    });
    fireEvent.change(field, { target: { value: password } });
    await act(async () => {
      fireEvent.click(screen.getByRole('button', { name: 'Iniciar sesión' }));
    });
    expect(login).toHaveBeenLastCalledWith({ email: 'a@test.test', password });
  }
);
it('uses the new credential policy only on signup', () => {
  render(<CredentialsForm signup onSuccess={() => {}} />);
  const password = screen.getByLabelText('Contraseña') as HTMLInputElement;
  expect([password.minLength, password.maxLength, password.autocomplete]).toEqual([
    8,
    128,
    'new-password',
  ]);
});
