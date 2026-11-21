import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { ShortsWorkspace } from '@/features/studio-shorts/components/shorts-workspace';
export const metadata = { title: 'Shorts · Video Wizard' };
export default async function Page() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/shorts');
  return <ShortsWorkspace key={session.user.id} />;
}
