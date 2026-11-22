import { notFound } from 'next/navigation';
import Link from 'next/link';
import { workspacePage } from '@/server/auth/page-policy';
import { VideoEditorContainer } from '@/features/video/containers/editor-container';
import { editorMedia } from '@/server/services/owned-media-service';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { ValidationError } from '@/server/lib/utils';

export default workspacePage('/editor/[id]', async (user, { params }) => {
  try {
    const { sourceAssetId, subtitles } = await editorMedia(user.id, (await params).id!);
    return (
      <main className="min-h-screen bg-gray-50">
        <VideoEditorContainer sourceAssetId={sourceAssetId} subtitles={subtitles} />
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
