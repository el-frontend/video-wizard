import { authenticatedFetch } from '@/lib/authenticated-fetch';
import type { ProjectRecord } from '@workspace/video-project';

export class ProjectRequestError extends Error {
  constructor(
    message: string,
    readonly current: ProjectRecord | null = null
  ) {
    super(message);
  }
}

const savedProjects = new EventTarget();

export function notifyProjectSaved(ownerId: string) {
  savedProjects.dispatchEvent(new Event(ownerId));
}

export function onProjectSaved(ownerId: string, listener: () => void) {
  savedProjects.addEventListener(ownerId, listener);
  return () => savedProjects.removeEventListener(ownerId, listener);
}

export const projectsUrl = '/api/studio/projects';

export async function projectRequest<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await authenticatedFetch(url, { cache: 'no-store', ...options });
  } catch {
    throw new ProjectRequestError('No se pudo conectar con el estudio.');
  }
  const body:
    | { success: true; data: T }
    | { success: false; error: string; current?: ProjectRecord } = await response
    .json()
    .catch(() => ({ success: false, error: 'El estudio devolvió una respuesta inesperada.' }));
  if (!body.success)
    throw new ProjectRequestError(
      body.error,
      response.status === 409 ? (body.current ?? null) : null
    );
  if (!response.ok) throw new ProjectRequestError('No se pudo completar la solicitud.');
  return body.data;
}
