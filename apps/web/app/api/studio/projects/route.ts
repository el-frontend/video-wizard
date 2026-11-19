import { projectResponse, projectService, readJson } from './http';

export function POST(request: Request) {
  return projectResponse(
    async (ownerId) => projectService.create(ownerId, await readJson(request)),
    201
  );
}
