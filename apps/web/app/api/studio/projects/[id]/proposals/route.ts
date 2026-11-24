import { proposals } from './service';
import { projectResponse, readJson } from '../../http';
type Context = { params: Promise<{ id: string }> };
export function POST(request: Request, { params }: Context) {
  return projectResponse(
    request,
    async (owner) =>
      proposals.stage(owner, (await params).id, await readJson(request), request.signal),
    201
  );
}
export function GET(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => proposals.list(owner, (await params).id));
}
