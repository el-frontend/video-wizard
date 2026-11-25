import { PublicAuth } from '@/features/auth/components/public-auth';
import { safeReturnPath } from '@/lib/safe-return-path';

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ callbackUrl?: string | string[] }>;
}) {
  const raw = (await searchParams).callbackUrl;
  return <PublicAuth signup returnTo={safeReturnPath(typeof raw === 'string' ? raw : null)} />;
}
