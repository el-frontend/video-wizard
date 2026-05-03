import Link from 'next/link';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';
import { Input } from '@workspace/ui/components/input';
import { Label } from '@workspace/ui/components/label';

import { signIn } from '@/auth';

export const metadata = {
  title: 'Sign in · Video Wizard',
};

interface SignInPageProps {
  searchParams: Promise<{ error?: string; callbackUrl?: string }>;
}

const ERROR_MESSAGES: Record<string, string> = {
  Configuration: 'The server is not fully configured for sign-in. Check the AUTH_SECRET env var.',
  AccessDenied: 'Access denied. Please contact the administrator.',
  Verification: 'The sign-in link is no longer valid. Please request a new one.',
  Default: 'Something went wrong while signing in. Please try again.',
};

export default async function SignInPage({ searchParams }: SignInPageProps) {
  const { error, callbackUrl } = await searchParams;
  const errorMessage = error ? (ERROR_MESSAGES[error] ?? ERROR_MESSAGES.Default) : null;

  async function signInAction(formData: FormData) {
    'use server';
    await signIn('email', {
      email: formData.get('email'),
      redirectTo: callbackUrl ?? '/',
    });
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8">
        <div className="mb-6 space-y-1.5">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in</h1>
          <p className="text-muted-foreground text-sm">
            Enter your email and we&apos;ll send you a magic link to sign in.
          </p>
        </div>

        {errorMessage && (
          <div className="border-destructive/50 bg-destructive/10 text-destructive mb-4 rounded-md border p-3 text-sm">
            {errorMessage}
          </div>
        )}

        <form action={signInAction} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="email">Email</Label>
            <Input
              id="email"
              name="email"
              type="email"
              required
              autoComplete="email"
              placeholder="you@example.com"
            />
          </div>

          <Button type="submit" className="w-full">
            Send magic link
          </Button>
        </form>

        <p className="text-muted-foreground mt-6 text-center text-xs">
          By signing in you agree to our{' '}
          <Link href="/" className="underline">
            terms of service
          </Link>
          .
        </p>
      </Card>
    </div>
  );
}
