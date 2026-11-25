import { requests, localToken } from '../http';
import { studioResponse, readJson } from '../../projects/http';
export function POST(request: Request) {
  return studioResponse(async () => {
    const secret = localToken(request, 'pair');
    await requests.verifyPairing(secret);
    return requests.bind(secret, await readJson(request));
  }, 201);
}
