import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { auth } from '@/auth';
import { db } from '@/server/db';
import { ProjectService } from '@/server/services/studio/project-service';
import { ProjectLibrary } from '@/features/studio-projects/components/project-library';

export const metadata: Metadata = { title: 'Proyectos · Video Wizard' };

export default async function ProjectsPage() {
  const session = await auth();
  if (!session?.user?.id) redirect('/signin?callbackUrl=/projects');
  const page = await new ProjectService(db).list(session.user.id);
  return <ProjectLibrary initial={page} />;
}
