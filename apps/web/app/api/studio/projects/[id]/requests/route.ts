import { requests, type Context } from '../../../companion/http';
import { projectResponse, readJson } from '../../http';
export function GET(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => requests.list(owner, (await params).id));
}
export function POST(request: Request, { params }: Context) {
  return projectResponse(
    request,
    async (owner) => requests.create(owner, (await params).id, await readJson(request)),
    201
  );
}
