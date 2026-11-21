import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Componentes · Video Wizard' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/components');
  return (
    <LibraryBrowser key={session.user.id} kind="component" initialId={(await searchParams).entry} />
  );
}
