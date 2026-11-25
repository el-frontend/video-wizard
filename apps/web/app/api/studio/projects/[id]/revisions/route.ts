import { type NextRequest } from 'next/server';

import { projectResponse, projectService } from '../../http';

export function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  return projectResponse(request, async (ownerId) => {
    const { id } = await params;
    return projectService.history(
      ownerId,
      id,
      request.nextUrl.searchParams.get('cursor') ?? undefined
    );
  });
}
