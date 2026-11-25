import { assetService } from '../../../assets/http';
import { AudioService } from '@/server/services/studio/audio-service';
import { projectService, readJson } from '../../http';
import { actionResponse, requests, type Context } from '../../../companion/http';
const audio = new AudioService(projectService, assetService);
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return actionResponse(
    request,
    id,
    ['voice'],
    async (t) => requests.audio(t, id, await readJson(request)),
    async (owner) => audio.replace(owner, id, await readJson(request))
  );
}
