import { projectResponse, readJson } from '../../http';
import { templateService } from '../../../templates/service';
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return projectResponse(
    async (owner) => templateService.fromProject(owner, (await params).id, await readJson(request)),
    201
  );
}
