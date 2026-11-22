import { OwnedClipInputSchema } from '@/server/types/clip-render';
import { shortSource } from '@/server/services/studio/shorts';
import { enqueue, mediaRequest } from '../legacy-media-http';
export function POST(request: Request) {
  return mediaRequest(request, async (owner, body) => {
    const input = OwnedClipInputSchema.parse(body);
    await shortSource.validateClip(owner, input);
    return enqueue(owner, 'clip_creation', input);
  });
}
