import { getStudioRender } from '@/server/services/studio/remotion-service';
import { engineResponse } from '../../../studio-render-http';

export function GET(request: Request, { params }: {params: Promise<{id:string;jobId:string}>}) {
  return engineResponse(async owner => {
    const {id,jobId} = await params;
    return getStudioRender(owner,id,jobId,new URL(request.url).searchParams.get('artifact') === 'video');
  });
}
