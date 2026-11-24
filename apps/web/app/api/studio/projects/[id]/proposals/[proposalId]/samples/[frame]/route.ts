import { proposals } from '../../../service';
import { engineResponse } from '../../../../../studio-render-http';
export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string; frame: string }> }
) {
  return engineResponse(request, async (owner) => {
    const { id, proposalId, frame } = await params;
    return proposals.sample(owner, id, proposalId, /^\d+$/.test(frame) ? Number(frame) : -1);
  });
}
