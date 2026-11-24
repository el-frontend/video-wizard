import { proposals } from '../service';
import { projectResponse } from '../../../http';
export function GET(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return projectResponse(request, async (owner) => {
    const { id, proposalId } = await params;
    return proposals.get(owner, id, proposalId);
  });
}
