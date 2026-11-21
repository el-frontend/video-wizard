import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { AssetBrowser } from '@/features/studio-libraries/components/library-browser';
export const metadata = { title: 'Recursos · Video Wizard' };
export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/assets');
  return <AssetBrowser key={session.user.id} />;
}
