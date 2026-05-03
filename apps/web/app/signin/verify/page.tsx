import { Mail } from 'lucide-react';
import Link from 'next/link';

import { Button } from '@workspace/ui/components/button';
import { Card } from '@workspace/ui/components/card';

export const metadata = {
  title: 'Check your email · Video Wizard',
};

export default function VerifyRequestPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="bg-primary/10 mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full">
          <Mail className="text-primary h-6 w-6" />
        </div>

        <h1 className="text-2xl font-semibold tracking-tight">Check your email</h1>

        <p className="text-muted-foreground mt-2 text-sm">
          A sign-in link has been sent to your email address. Click the link to continue. You can
          close this page.
        </p>

        <p className="text-muted-foreground mt-6 text-xs">
          Running locally without an email provider configured? Check your server console — the
          magic link is printed there.
        </p>

        <Button asChild variant="outline" className="mt-6">
          <Link href="/signin">Use a different email</Link>
        </Button>
      </Card>
    </div>
  );
}
