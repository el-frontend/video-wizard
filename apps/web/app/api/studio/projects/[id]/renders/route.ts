import { startStudioView } from '@/server/services/studio/remotion-service';
import { readJson } from '../../http';
import { engineResponse } from '../../studio-render-http';

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return engineResponse(async owner => startStudioView(owner, (await params).id, 'render', await readJson(request)));
}
