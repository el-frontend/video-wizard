import { proposals } from '../../service';
import { projectResponse, readJson } from '../../../../http';
import { ValidationError } from '@/server/lib/utils';
import { z } from 'zod';
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return projectResponse(request, async (owner) => {
    const { id, proposalId } = await params;
    const data = z.strictObject({ baseRevision: z.uuid() }).safeParse(await readJson(request));
    if (!data.success) throw new ValidationError('Revisión no válida.');
    return proposals.apply(owner, id, proposalId, data.data.baseRevision);
  });
}
