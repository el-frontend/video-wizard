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
  if (initial.importContext?.mode === 'original')
    return (
      <main className="studio-workspace">
        <h1>{initial.document.title}</h1>
        <h2>Archivo original · Solo lectura</h2>
        <p>Esta fuente carece de un modelo de escenas editable.</p>
        {initial.importContext.originalAssetId ? (
          <video
            controls
            className="max-h-[70vh] max-w-full"
            aria-label="Reproducir archivo original"
            src={'/api/studio/assets/' + encodeURIComponent(initial.importContext.originalAssetId)}
          />
        ) : (
          <p>Falta el video original registrado.</p>
        )}
      </main>
    );
  return <Designer key={id} initial={initial} />;
});
