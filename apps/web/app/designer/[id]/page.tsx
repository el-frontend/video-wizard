import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { workspacePage } from '@/server/auth/page-policy';
import { db } from '@/server/db';
import { ProjectNotFoundError, ProjectService } from '@/server/services/studio/project-service';
import { Designer } from '@/features/studio-designer/components/designer';

export const metadata: Metadata = { title: 'Diseñador · Video Wizard' };

export default workspacePage('/designer/[id]', async (user, { params }) => {
  const { id } = await params;
  const initial = await new ProjectService(db).get(user.id, id!).catch((error: unknown) => {
    if (error instanceof ProjectNotFoundError) notFound();
    throw error;
  });
  return <Designer key={id} initial={initial} />;
});
