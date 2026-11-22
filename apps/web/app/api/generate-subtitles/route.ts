import { transcriptionInput, resolveOwnedVideo } from '@/server/services/owned-media-service';
import { enqueue, mediaRequest } from '../legacy-media-http';
export function POST(request: Request) {
  return mediaRequest(request, async (owner, body) => {
    const input = transcriptionInput.parse(body);
    const source = await resolveOwnedVideo(owner, input);
    return enqueue(owner, 'transcription', {
      sourceAssetId: source.assetId,
      language: input.language,
    });
  });
}
