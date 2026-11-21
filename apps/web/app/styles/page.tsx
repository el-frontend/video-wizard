import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { LibraryBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Estilos · Video Wizard' };
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ entry?: string }>;
}) {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/styles');
  return (
    <LibraryBrowser key={session.user.id} kind="style" initialId={(await searchParams).entry} />
  );
}
