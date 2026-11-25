import { proposals } from './service';
import { projectResponse, readJson } from '../../http';
import { actionResponse, requests, type Context } from '../../../companion/http';
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return actionResponse(
    request,
    id,
    ['component', 'storyboard'],
    async (t) => requests.stage(t, id, await readJson(request), request.signal),
    async (owner) =>
      proposals.stage(
        owner,
        id,
        await requests.assertHumanDelivery(await readJson(request)),
        request.signal
      ),
    201
  );
}
export function GET(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => proposals.list(owner, (await params).id));
}
