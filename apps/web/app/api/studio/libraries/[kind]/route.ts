import { EngineIdSchema, LibraryEntrySchema } from '@workspace/video-project';
import type { NextRequest } from 'next/server';

import { ValidationError } from '@/server/lib/utils';

import { libraryKind, libraryResponse, libraryService } from '../http';

export const runtime = 'nodejs';

type Context = { params: Promise<{ kind: string }> };

export function GET(request: NextRequest, { params }: Context) {
  return libraryResponse(async (ownerId) => {
    const kind = libraryKind((await params).kind);
    const engine = EngineIdSchema.optional().safeParse(
      request.nextUrl.searchParams.get('engine') ?? undefined
    );
    if (!engine.success) throw new ValidationError('El motor de la consulta no es válido.');
    return libraryService.list(ownerId, { kind, engine: engine.data });
  });
}

export function POST(request: Request, { params }: Context) {
  return libraryResponse(async (ownerId) => {
    const kind = libraryKind((await params).kind);
    const body: unknown = await request.json().catch((error: unknown) => {
      if (error instanceof SyntaxError)
        throw new ValidationError('El cuerpo de la solicitud no es JSON válido.');
      throw error;
    });
    const entry = LibraryEntrySchema.safeParse(body);
    if (!entry.success || entry.data.kind !== kind) {
      throw new ValidationError('La entrada no es válida para esta biblioteca.');
    }
    if (entry.data.kind === 'style' && entry.data.engines?.length) {
      throw new ValidationError('La compatibilidad del estilo debe verificarse en el servidor.');
    }
    return libraryService.publish(ownerId, entry.data);
  }, 201);
}
