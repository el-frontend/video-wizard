import type { Request, RequestHandler } from 'express';
import { verifyServiceToken } from '@workspace/service-auth';
const refs: Record<string, string[]> = {
  'proposal.compile': ['projectId', 'proposalId'],
  'proposal.check': ['projectId', 'proposalId'],
  'preview.create': ['projectId', 'previewId'],
  'preview.release': ['projectId', 'previewId'],
  'export.create': ['projectId', 'jobId', 'attemptId'],
  'export.read': ['projectId', 'jobId', 'attemptId'],
  'export.cancel': ['projectId', 'jobId', 'attemptId'],
  'studio.create': ['projectId'],
  'studio.read': ['projectId', 'jobId'],
  'studio.artifact': ['projectId', 'jobId'],
  'render.create': ['jobId'],
  'render.read': ['jobId', 'rendererJobId'],
  'render.cancel': ['jobId', 'rendererJobId'],
  'render.artifact': ['jobId', 'rendererJobId'],
};
async function serviceRequest(req: Request, scope: string, secret: string) {
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

export function requireService(secret: string, scope: string, fallThrough = false): RequestHandler {
  return async (req, res, next) => {
    const principal = await serviceRequest(req, scope, secret);
    if (!principal) {
      if (fallThrough) next('route');
      else res.set('WWW-Authenticate', 'Bearer').status(401).end();
      return;
    }
    res.locals.principal = principal;
    next();
  };
}
