import { serviceHeaders, type ServicePrincipal } from '@workspace/service-auth';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { IdSchema, ProjectDraftSchema, type Diagnostic } from '@workspace/video-project';
import { db } from '@/server/db';
import { ValidationError } from '@/server/lib/utils';
import { ConflictError, ProjectService } from './project-service';
import { buildSnapshot } from './snapshot-service';

const request = z.strictObject({ baseRevision: IdSchema });
const previewRequest = request.extend({
  document: ProjectDraftSchema.optional(),
  instance: z.uuidv4().optional(),
});
const projects = new ProjectService(db);
export class StudioRenderError extends Error {
  constructor(
    readonly status: number,
    readonly diagnostics?: Diagnostic[]
  ) {
    super('No se pudo preparar la vista del proyecto.');
  }
}
async function internal(
  ownerId: string,
  operation: Omit<ServicePrincipal, 'ownerId' | 'audience'>,
  path: string,
  body?: unknown,
  options: {
    signal?: AbortSignal;
    release?: boolean;
    media?: { method: 'HEAD' | 'GET'; range: string | null; ifRange: string | null };
  } = {}
) {
  const authorization = await serviceHeaders({
    ownerId,
    audience: 'video-wizard-renderer',
    ...operation,
  });
  const response = await fetch(
    new URL(path, process.env.REMOTION_SERVER_URL || 'http://localhost:3001'),
    {
      method: options.release ? 'DELETE' : body ? 'POST' : (options.media?.method ?? 'GET'),
      signal: options.signal,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        ...authorization,
        ...(options.media?.range && { Range: options.media.range }),
        ...(options.media?.ifRange && { 'If-Range': options.media.ifRange }),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
  if (options.media && response.status === 416) {
    await response.body?.cancel();
    const headers = new Headers();
    for (const name of ['content-range', 'accept-ranges']) {
      const value = response.headers.get(name);
      if (value) headers.set(name, value);
    }
    return new Response(null, { status: 416, headers });
  }
  if (!response.ok)
    throw new StudioRenderError(
      response.status === 404 ? 404 : response.status === 422 ? 422 : 503,
      response.status === 422 ? (await response.json()).diagnostics : undefined
    );
  return response;
}
export async function startStudioView(
  ownerId: string,
  id: string,
  kind: 'preview' | 'render',
  body: unknown,
  signal?: AbortSignal
) {
  const parsed = (kind === 'preview' ? previewRequest : request).safeParse(body);
  if (!parsed.success) throw new ValidationError('La solicitud de revisión no es válida.');
  signal?.throwIfAborted();
  const record = await projects.get(ownerId, id);
  if (record.revision !== parsed.data.baseRevision) throw new ConflictError(record);
  const draft =
    'document' in parsed.data ? ProjectDraftSchema.parse(parsed.data.document) : record.document;
  if (draft.id !== id || draft.engine !== record.document.engine) {
    throw new ValidationError('La vista debe corresponder al proyecto seleccionado.');
  }
  const snapshot = await buildSnapshot(ownerId, { ...record, document: draft }, signal);
  const previewId =
    kind === 'preview'
      ? 'instance' in parsed.data
        ? String(parsed.data.instance ?? randomUUID())
        : randomUUID()
      : undefined;
  return internal(
    ownerId,
    { scope: kind === 'preview' ? 'preview.create' : 'studio.create', projectId: id, previewId },
    kind === 'preview' ? '/studio/previews' : '/renders',
    {
      compositionId: 'StudioProject',
      snapshot,
      ...(previewId && { instance: previewId }),
    },
    { signal }
  );
}
export async function releaseStudioPreview(ownerId: string, id: string, instance: string | null) {
  if (!z.uuidv4().safeParse(instance).success) throw new StudioRenderError(404);
  await projects.get(ownerId, id);
  return internal(
    ownerId,
    { scope: 'preview.release', projectId: id, previewId: instance! },
    '/studio/previews/' + instance,
    undefined,
    { release: true }
  );
}
export async function getStudioRender(
  ownerId: string,
  id: string,
  jobId: string,
  request: Request
) {
  if (!z.uuid().safeParse(jobId).success) throw new StudioRenderError(404);
  await projects.get(ownerId, id);
  const path = '/studio/renders/' + jobId;
  const status = await (
    await internal(ownerId, { scope: 'studio.read', projectId: id, jobId }, path, undefined, {
      signal: request.signal,
    })
  ).json();
  if (status.projectId !== id) throw new StudioRenderError(404);
  if (new URL(request.url).searchParams.get('artifact') !== 'video') return Response.json(status);
  return internal(
    ownerId,
    { scope: 'studio.artifact', projectId: id, jobId },
    path + '/video',
    undefined,
    {
      signal: request.signal,
      media: {
        method: request.method === 'HEAD' ? 'HEAD' : 'GET',
        range: request.headers.get('range'),
        ifRange: request.headers.get('if-range'),
      },
    }
  );
}
