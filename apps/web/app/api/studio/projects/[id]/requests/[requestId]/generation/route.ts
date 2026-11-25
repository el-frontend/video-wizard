import { actionResponse, requests, type RequestContext } from '../../../../../companion/http';
export async function POST(request: Request, { params }: RequestContext) {
  const { id, requestId } = await params;
  return actionResponse(
    request,
    id,
    ['voice'],
    (t) => requests.beginVoice(t, id, requestId),
    undefined,
    200,
    requestId
  );
}
