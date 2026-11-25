import { requests } from './http';
import { projectResponse } from '../projects/http';
export function GET(request: Request) {
  return projectResponse(request, (owner) =>
    requests.bindings(owner, new URL(request.url).searchParams.get('projectId') ?? '')
  );
}
