import { ImportSource } from '@/features/studio-projects/components/import-source';
import { registeredSources } from '@/server/services/studio/import-registry';
import type { Metadata } from 'next';
import { workspacePage } from '@/server/auth/page-policy';
import { db } from '@/server/db';
import { ProjectService } from '@/server/services/studio/project-service';
import { ProjectLibrary } from '@/features/studio-projects/components/project-library';

export const metadata: Metadata = { title: 'Proyectos · Video Wizard' };

export default workspacePage('/projects', async (user) => {
  const page = await new ProjectService(db).list(user.id);
  const sources = (await registeredSources())
    .filter((s) => s.ownerId === user.id)
    .map((s) => s.sourceId);
  return (
    <>
      <ProjectLibrary key={user.id} initial={page} ownerId={user.id} />
      <ImportSource owner={user.id} kind="motion-studio" sources={sources} />
    </>
  );
});
