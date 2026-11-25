import { exportsService } from '@/server/services/studio/export-service';
import { projectResponse, readJson } from '../../http';
type Context = { params: Promise<{ id: string }> };
export async function GET(request: Request, { params }: Context) {
  const { id } = await params;
  return projectResponse(request, (owner) => exportsService.list(owner, id));
}
export async function POST(request: Request, { params }: Context) {
  const { id } = await params;
  return projectResponse(
    request,
    async (owner) => exportsService.enqueue(owner, id, await readJson(request)),
    202
  );
}
