import { projectResponse, projectService, readJson } from '../http';

type ProjectContext = { params: Promise<{ id: string }> };

export function GET(_request: Request, { params }: ProjectContext) {
  return projectResponse(async (ownerId) => {
    const { id } = await params;
    return projectService.get(ownerId, id);
  });
}

export function PUT(request: Request, { params }: ProjectContext) {
  return projectResponse(async (ownerId) => {
    const { id } = await params;
    return projectService.save(ownerId, id, await readJson(request));
  });
}
