'use client';

import Link from 'next/link';
import { Card } from '@workspace/ui/components/card';
import { CredentialsForm } from './credentials-form';
import { clearAccessToken } from '@/lib/authenticated-fetch';

export function PublicAuth({ signup = false, returnTo }: { signup?: boolean; returnTo: string }) {
  const target = (signup ? '/signin' : '/signup') + '?callbackUrl=' + encodeURIComponent(returnTo);
  return (
    <main className="flex min-h-dvh items-center justify-center px-4 py-8">
      <Card className="w-full max-w-md gap-5 p-8">
        <h1 className="text-2xl font-semibold tracking-tight">
          {signup ? 'Crear cuenta' : 'Iniciar sesión'}
        </h1>
        <CredentialsForm
          signup={signup}
          onSuccess={() => {
            clearAccessToken();
            window.location.replace(returnTo);
          }}
        />
        <p className="text-center text-sm text-muted-foreground">
          {signup ? '¿Ya tienes una cuenta?' : '¿Aún no tienes cuenta?'}{' '}
          <Link className="text-foreground underline" href={target}>
            {signup ? 'Iniciar sesión' : 'Crear cuenta'}
          </Link>
        </p>
      </Card>
    </main>
  );
}
