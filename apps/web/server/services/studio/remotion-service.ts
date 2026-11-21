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
  path: string,
  body?: unknown,
  options: { signal?: AbortSignal; releaseProject?: string } = {}
) {
  const secret = process.env.STUDIO_RENDER_SECRET;
  if (!secret) throw new StudioRenderError(503);
  const response = await fetch(
    new URL(path, process.env.REMOTION_SERVER_URL || 'http://localhost:3001'),
    {
      method: options.releaseProject ? 'DELETE' : body ? 'POST' : 'GET',
      signal: options.signal,
      cache: 'no-store',
      redirect: 'error',
      headers: {
        Authorization: 'Bearer ' + secret,
        'X-Studio-Owner': ownerId,
        ...(options.releaseProject && { 'X-Studio-Project': options.releaseProject }),
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    }
  );
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
  return internal(
    ownerId,
    kind === 'preview' ? '/studio/previews' : '/renders',
    {
      compositionId: 'StudioProject',
      snapshot,
      ...('instance' in parsed.data && { instance: parsed.data.instance }),
    },
    { signal }
  );
}
export async function releaseStudioPreview(ownerId: string, id: string, instance: string | null) {
  if (!z.uuidv4().safeParse(instance).success) throw new StudioRenderError(404);
  await projects.get(ownerId, id);
  return internal(ownerId, '/studio/previews/' + instance, undefined, { releaseProject: id });
}
export async function getStudioRender(ownerId: string, id: string, jobId: string, video: boolean) {
  if (!z.uuid().safeParse(jobId).success) throw new StudioRenderError(404);
  await projects.get(ownerId, id);
  const path = '/studio/renders/' + jobId;
  const status = await (await internal(ownerId, path)).json();
  if (status.projectId !== id) throw new StudioRenderError(404);
  return video ? internal(ownerId, path + '/video') : Response.json(status);
}
