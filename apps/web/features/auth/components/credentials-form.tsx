'use client';

import { useState, type FormEvent } from 'react';
import { Button } from '@workspace/ui/components/button';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';
import { authClient } from '@/lib/auth-client';
import { MIN_PASSWORD_LENGTH, MAX_PASSWORD_LENGTH } from '@/lib/password-policy';

export function CredentialsForm({
  signup = false,
  initialEmail = '',
  onSuccess,
}: {
  signup?: boolean;
  initialEmail?: string;
  onSuccess: (ownerId: string) => void | Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [visible, setVisible] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    const form = new FormData(event.currentTarget);
    const email = String(form.get('email')).trim();
    const password = String(form.get('password'));
    setBusy(true);
    setError('');
    try {
      const result = signup
        ? await authClient.signUp.email({
            name: String(form.get('name') ?? '').trim() || email,
            email,
            password,
          })
        : await authClient.signIn.email({ email, password });
      if (result.error || !result.data?.user) {
        setError(
          result.error?.status === 429
            ? 'Has hecho varios intentos. Espera un momento antes de volver a entrar.'
            : signup
              ? 'No se pudo crear la cuenta. Revisa el correo y la contraseña.'
              : 'No se pudo iniciar sesión. Revisa el correo y la contraseña.'
        );
        return;
      }
      await onSuccess(result.data.user.id);
    } catch {
      setError('No se pudo conectar con el estudio. Inténtalo de nuevo.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <form method="post" onSubmit={submit} className="space-y-5">
      {signup && (
        <div className="space-y-2">
          <Label htmlFor="name">Nombre (opcional)</Label>
          <Input className="min-h-12" id="name" name="name" autoComplete="name" />
        </div>
      )}
      <div className="space-y-2">
        <Label htmlFor="email">Correo electrónico</Label>
        <Input
          className="min-h-12"
          id="email"
          name="email"
          type="email"
          autoComplete="username"
          inputMode="email"
          spellCheck={false}
          defaultValue={initialEmail}
          required
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          className="min-h-12"
          id="password"
          name="password"
          type={visible ? 'text' : 'password'}
          autoComplete={signup ? 'new-password' : 'current-password'}
          minLength={signup ? MIN_PASSWORD_LENGTH : undefined}
          maxLength={signup ? MAX_PASSWORD_LENGTH : undefined}
          aria-describedby={signup ? 'password-hint' : undefined}
          required
        />
        {signup && (
          <p className="text-sm text-muted-foreground" id="password-hint">
            Entre {MIN_PASSWORD_LENGTH} y {MAX_PASSWORD_LENGTH} caracteres.
          </p>
        )}
        <button
          className="min-h-12 text-sm underline"
          type="button"
          aria-pressed={visible}
          onClick={() => setVisible(!visible)}
        >
          Mostrar contraseña
        </button>
      </div>
      {error && (
        <p role="alert" className="text-destructive text-sm">
          {error}
        </p>
      )}
      <Button type="submit" className="min-h-12 w-full" disabled={busy}>
        {busy ? 'Un momento…' : signup ? 'Crear cuenta' : 'Iniciar sesión'}
      </Button>
    </form>
  );
}
