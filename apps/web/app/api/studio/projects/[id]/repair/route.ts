import { projectResponse, projectService, readJson } from '../../http';

export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return projectResponse(request, async (ownerId) => {
    const { id } = await params;
    return projectService.repairImport(ownerId, id, await readJson(request));
  });
}
