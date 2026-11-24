import { proposals } from '../../service';
import { readJson } from '../../../../http';
import { engineResponse } from '../../../../studio-render-http';
import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return engineResponse(request, async (owner) => {
    const { id, proposalId } = await params;
    const body = z.object({ instance: z.uuidv4() }).safeParse(await readJson(request));
    if (!body.success) throw new ValidationError('Instancia no válida.');
    return proposals.preview(owner, id, proposalId, body.data.instance, request.signal);
  });
}
