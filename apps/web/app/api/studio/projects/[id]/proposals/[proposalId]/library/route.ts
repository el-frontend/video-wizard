import { proposals } from '../../service';
import { projectResponse } from '../../../../http';
export function POST(
  request: Request,
  { params }: { params: Promise<{ id: string; proposalId: string }> }
) {
  return projectResponse(request, async (owner) => {
    const { id, proposalId } = await params;
    return proposals.listVersion(owner, id, proposalId);
  });
}
