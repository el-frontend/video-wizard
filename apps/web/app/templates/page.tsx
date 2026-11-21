import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Plantillas · Video Wizard' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/templates');
  return (
    <LibraryBrowser key={session.user.id} kind="template" initialId={(await searchParams).entry} />
  );
}
