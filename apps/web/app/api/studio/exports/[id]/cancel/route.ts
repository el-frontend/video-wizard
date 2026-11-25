import { exportsService } from '@/server/services/studio/export-service';
import { projectResponse } from '../../../projects/http';
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return projectResponse(request, (owner) => exportsService.cancel(owner, id));
}
