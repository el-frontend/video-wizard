import { ImportSource } from '@/features/studio-projects/components/import-source';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import { workspacePage } from '@/server/auth/page-policy';
import { VideoEditorContainer } from '@/features/video/containers/editor-container';
import { editorMedia } from '@/server/services/owned-media-service';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { ValidationError } from '@/server/lib/utils';

export default workspacePage('/editor/[id]', async (user, { params }) => {
  try {
    const jobId = (await params).id!;
    const media = await editorMedia(user.id, jobId);
    return (
      <main className="min-h-screen bg-gray-50">
        <ImportSource owner={user.id} kind="legacy-job" sources={[jobId]} />
        <VideoEditorContainer {...media} />
      </main>
    );
  } catch (error) {
    if (error instanceof AssetNotFoundError) notFound();
    if (error instanceof ValidationError)
      return (
        <main className="p-8">
          <p>{error.message}</p>
          <Link href="/subtitle-generator">Importar video</Link>
        </main>
      );
    throw error;
  }
});
