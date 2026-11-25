import { transcriptionInput } from '@/server/services/owned-media-service';
import { subtitleGenerationService } from '@/server/services/subtitle-generation-service';
import { mediaRequest } from '../legacy-media-http';
export function POST(request: Request) {
  return mediaRequest(request, async (owner, body) =>
    Response.json({
      success: true,
      data: await subtitleGenerationService.transcribe(owner, transcriptionInput.parse(body)),
    })
  );
}
