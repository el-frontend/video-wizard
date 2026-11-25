import type { CompanionRequest } from '@workspace/video-project';
import { db } from '@/server/db';
import { RequestService, CapabilityError } from '@/server/services/studio/request-service';
import { projectResponse, studioResponse } from '../projects/http';
export const requests = new RequestService(db);
export type Context = { params: Promise<{ id: string }> };
export type RequestContext = { params: Promise<{ id: string; requestId: string }> };
export function localToken(request: Request, purpose: 'pair' | 'dispatch' | 'attempt') {
  const value = request.headers.get('authorization') ?? '';
  const match = new RegExp('^Bearer (vw_' + purpose + '_[A-Za-z0-9_-]{43})$').exec(value);
  if (!match || request.headers.has('origin') || request.headers.has('sec-fetch-site'))
    throw new CapabilityError();
  return match[1];
}
export function isAttempt(request: Request) {
  return /^Bearer vw_attempt_/.test(request.headers.get('authorization') ?? '');
}
export function actionResponse<T>(
  request: Request,
  project: string | undefined,
  kinds: CompanionRequest['kind'][] | null,
  companion: (token: string) => Promise<T>,
  human?: (owner: string) => Promise<T>,
  status = 200,
  id?: string
) {
  if (human && !isAttempt(request)) return projectResponse(request, human, status);
  return studioResponse(async () => {
    const token = localToken(request, 'attempt');
    await requests.verifyAttempt(token, project, kinds, id);
    return companion(token);
  }, status);
}
