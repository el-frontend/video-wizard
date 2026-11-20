import { requireAuth, UnauthorizedError } from '@/server/lib/auth';
import { ValidationError } from '@/server/lib/utils';
import { ConflictError, ProjectNotFoundError } from '@/server/services/studio/project-service';
import { StudioRenderError } from '@/server/services/studio/remotion-service';

export async function engineResponse(action: (ownerId: string) => Promise<Response>) {
  try {
    const response = await action((await requireAuth()).id);
    return new Response(response.body, {
      status: response.status,
      headers: {
        'Content-Type': response.headers.get('content-type') || 'application/json',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
      },
    });
  } catch (error) {
    if (error instanceof ConflictError)
      return Response.json({ error: error.message, current: error.current }, { status: 409 });
    if (error instanceof StudioRenderError)
      return Response.json(
        { error: error.message, diagnostics: error.diagnostics },
        { status: error.status }
      );
    if (error instanceof UnauthorizedError)
      return Response.json({ error: 'Inicia sesión para acceder.' }, { status: 401 });
    if (error instanceof ValidationError || error instanceof ProjectNotFoundError)
      return Response.json(
        { error: error.message },
        { status: error instanceof ValidationError ? 400 : 404 }
      );
    return Response.json({ error: 'No se pudo acceder al motor Remotion.' }, { status: 503 });
  }
}
