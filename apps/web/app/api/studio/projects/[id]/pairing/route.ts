import { requests, type Context } from '../../../companion/http';
import { projectResponse } from '../../http';
export function POST(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => requests.pairing(owner, (await params).id), 201);
}
export function DELETE(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => {
    await requests.revoke(
      owner,
      (await params).id,
      new URL(request.url).searchParams.get('bindingId') ?? ''
    );
    return true;
  });
}
