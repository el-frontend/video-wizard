import { type NextRequest } from 'next/server';

import { projectResponse, projectService, readJson } from './http';

export function GET(request: NextRequest) {
  return projectResponse(request, (ownerId) =>
    projectService.list(ownerId, request.nextUrl.searchParams.get('cursor') ?? undefined)
  );
}

export function POST(request: Request) {
  return projectResponse(
    request,
    async (ownerId) => projectService.create(ownerId, await readJson(request)),
    201
  );
}
