import { queueRender } from '../legacy-media-http';
export function POST(request: Request) {
  return queueRender(request, 'milliseconds');
}
