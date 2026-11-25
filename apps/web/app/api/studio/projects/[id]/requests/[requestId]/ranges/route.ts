import { actionResponse, requests, type RequestContext } from '../../../../../companion/http';
import { readJson } from '../../../../http';
export async function POST(request: Request, { params }: RequestContext) {
  const { id, requestId } = await params;
  return actionResponse(
    request,
    id,
    ['shorts'],
    async (t) => requests.suggestions(t, id, requestId, await readJson(request)),
    undefined,
    200,
    requestId
  );
}

export async function GET(request: Request, { params }: RequestContext) {
  const { id, requestId } = await params;
  return actionResponse(
    request,
    id,
    ['shorts'],
    (t) => requests.source(t, id, requestId),
    undefined,
    200,
    requestId
  );
}
