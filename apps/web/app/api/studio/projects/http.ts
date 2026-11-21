import { NextResponse } from 'next/server';

import { db } from '@/server/db';
import { UnauthorizedError, requireAuth } from '@/server/lib/auth';
import {
  LibraryNotFoundError,
  LibraryConflictError,
} from '@/server/services/studio/library-service';
import { AssetNotFoundError } from '@/server/services/studio/asset-service';
import { ValidationError } from '@/server/lib/utils';
import {
  ConflictError,
  ProjectNotFoundError,
  ProjectService,
} from '@/server/services/studio/project-service';

export const projectService = new ProjectService(db);

export async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch (error) {
    if (error instanceof SyntaxError)
      throw new ValidationError('El cuerpo de la solicitud no es JSON válido.');
    throw error;
  }
}

export async function projectResponse<T>(action: (ownerId: string) => Promise<T>, status = 200) {
  try {
    const user = await requireAuth();
    const data = await action(user.id);
    return NextResponse.json({ success: true, data }, { status });
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { success: false, error: 'Inicia sesión para acceder a los proyectos.' },
        { status: 401 }
      );
    }
    if (error instanceof ConflictError) {
      return NextResponse.json(
        { success: false, error: error.message, current: error.current },
        { status: 409 }
      );
    }
    if (error instanceof LibraryConflictError)
      return NextResponse.json({ success: false, error: error.message }, { status: 409 });
    if (
      error instanceof LibraryNotFoundError ||
      error instanceof ValidationError ||
      error instanceof ProjectNotFoundError ||
      error instanceof AssetNotFoundError
    ) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error instanceof ValidationError ? 400 : 404 }
      );
    }
    console.error('Studio project request failed:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo completar la operación del proyecto.' },
      { status: 500 }
    );
  }
}
