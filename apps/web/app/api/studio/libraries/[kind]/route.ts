import { templateService } from '../../templates/service';
import { supportsStudioEngine, EngineIdSchema, LibraryEntrySchema } from '@workspace/video-project';
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
    const entries = await libraryService.list(ownerId, { kind, engine: engine.data });
    if (request.nextUrl.searchParams.get('verified') !== '1') return entries;
    const selected = entries.filter((e) => supportsStudioEngine(e, engine.data ?? 'remotion'));
    const verified = await Promise.all(
      selected.map(async (e) => {
        if (e.kind === 'component') return libraryService.verifiedComponent(ownerId, e);
        if (e.kind === 'template') return templateService.compatible(ownerId, e);
        return true;
      })
    );
    return selected.filter((_, i) => verified[i]);
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
    if (entry.data.kind === 'template' && entry.data.structure)
      return templateService.publish(ownerId, entry.data);
    return libraryService.publish(ownerId, entry.data);
  }, 201);
}
