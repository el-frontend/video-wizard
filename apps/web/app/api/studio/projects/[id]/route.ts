import { projectService, readJson } from '../http';
import { actionResponse, requests, type Context } from '../../companion/http';
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return actionResponse(
    request,
    id,
    null,
    (t) => requests.read(t, id),
    (o) => projectService.get(o, id)
  );
}
export async function PUT(request: Request, { params }: Context) {
  const { id } = await params;
  return actionResponse(
    request,
    id,
    ['feedback'],
    async (t) => requests.feedback(t, id, await readJson(request)),
    async (o) => projectService.save(o, id, await readJson(request))
  );
}
