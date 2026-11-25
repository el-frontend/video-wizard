import { actionResponse, requests, type RequestContext } from '../../../../../companion/http';
import { readJson } from '../../../../http';
export async function POST(request: Request, { params }: RequestContext) {
  const { id, requestId } = await params;
  return actionResponse(
    request,
    id,
    null,
    async (t) => requests.report(t, id, requestId, await readJson(request)),
    undefined,
    200,
    requestId
  );
}
