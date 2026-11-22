import type { RenderRequest, RenderResponse } from '@/server/types/video-render';

/** The legacy export endpoint stays disabled until configured. */
export class VideoRenderService {
  async renderVideo(_request: RenderRequest): Promise<RenderResponse> {
    return { success: false, error: 'Server-side rendering not configured.' };
  }
}
export const videoRenderService = new VideoRenderService();
