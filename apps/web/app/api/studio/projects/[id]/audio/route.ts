import { assetService } from '../../../assets/http';
import { AudioService } from '@/server/services/studio/audio-service';
import { projectResponse, projectService, readJson } from '../../http';

const audio = new AudioService(projectService, assetService);
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return projectResponse(request, async (ownerId) =>
    audio.replace(ownerId, (await params).id, await readJson(request))
  );
}
