import type { Request } from 'express';
import { verifyServiceToken } from '@workspace/service-auth';
const refs: Record<string, string[]> = {
  'preview.create': ['projectId', 'previewId'],
  'preview.release': ['projectId', 'previewId'],
  'studio.create': ['projectId'],
  'studio.read': ['projectId', 'jobId'],
  'studio.artifact': ['projectId', 'jobId'],
  'render.create': ['jobId'],
  'render.read': ['jobId', 'rendererJobId'],
  'render.cancel': ['jobId', 'rendererJobId'],
  'render.artifact': ['jobId', 'rendererJobId'],
};
export async function serviceRequest(req: Request, scope: string, secret: string) {
  const authorization = req.get('authorization');
  if (
    !authorization?.startsWith('Bearer ') ||
    req.get('x-studio-owner') !== undefined ||
    req.get('x-studio-project') !== undefined
  )
    return;
  try {
    const principal = await verifyServiceToken(authorization.slice(7), {
      secret,
      audience: 'video-wizard-renderer',
      scope,
    });
    const allowed = refs[scope];
    if (!allowed) return;
    const actual = Object.keys(principal).filter(
      (key) => !['audience', 'ownerId', 'scope'].includes(key)
    );
    if (actual.length === allowed.length && actual.every((key) => allowed.includes(key)))
      return principal;
  } catch {
    return;
  }
}
