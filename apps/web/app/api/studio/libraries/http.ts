import { LibraryKindSchema } from '@workspace/video-project';
import { NextResponse } from 'next/server';

import { db } from '@/server/db';
import { UnauthorizedError, requireAuth } from '@/server/lib/auth';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { ValidationError } from '@/server/lib/utils';
import {
  LibraryConflictError,
  LibraryNotFoundError,
  LibraryService,
} from '@/server/services/studio/library-service';

export const libraryService = new LibraryService(db);

export function libraryKind(value: string) {
  const parsed = LibraryKindSchema.safeParse(value);
  if (!parsed.success) throw new LibraryNotFoundError();
  return parsed.data;
}

export async function libraryResponse<T>(action: (ownerId: string) => Promise<T>, status = 200) {
  try {
    const owner = await requireAuth();
    const data = await action(owner.id);
    return NextResponse.json({ success: true, data }, { status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { success: false, error: 'Inicia sesión para acceder a las bibliotecas.' },
        { status: 401 }
      );
    }
    if (error instanceof ValidationError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 400 });
    }
    if (error instanceof LibraryNotFoundError || error instanceof AssetNotFoundError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 404 });
    }
    if (error instanceof LibraryConflictError) {
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    }
    console.error('Studio library request failed:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo completar la operación de la biblioteca.' },
      { status: 500 }
    );
  }
}
