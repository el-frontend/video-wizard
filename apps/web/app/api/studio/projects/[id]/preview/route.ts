import { releaseStudioPreview, startStudioView } from '@/server/services/studio/remotion-service';
import { readJson } from '../../http';
import { engineResponse } from '../../studio-render-http';

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return engineResponse(async (owner) =>
    startStudioView(owner, (await params).id, 'preview', await readJson(request), request.signal)
  );
}

export function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return engineResponse(async (owner) =>
    releaseStudioPreview(
      owner,
      (await params).id,
      new URL(request.url).searchParams.get('instance')
    )
  );
}
