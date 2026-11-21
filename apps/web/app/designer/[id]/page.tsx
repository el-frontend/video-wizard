import type { Metadata } from 'next';
import { notFound, redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/server/db';
import { ProjectNotFoundError, ProjectService } from '@/server/services/studio/project-service';
import { Designer } from '@/features/studio-designer/components/designer';

export const metadata: Metadata = { title: 'Diseñador · Video Wizard' };

export default async function DesignerPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=' + encodeURIComponent('/designer/' + id));
  const initial = await new ProjectService(db).get(session.user.id, id).catch((error: unknown) => {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  });
  return <Designer key={id} initial={initial} />;
}
