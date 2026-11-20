import { NextResponse } from 'next/server';

import { db } from '@/server/db';
import { requireAuth, UnauthorizedError } from '@/server/lib/auth';
import { ValidationError } from '@/server/lib/utils';
import { AssetNotFoundError, AssetService } from '@/server/services/studio/asset-service';

export const assetService = new AssetService(db);

export async function assetResponse(action: (ownerId: string) => Promise<Response>) {
  try {
    return await action((await requireAuth()).id);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { success: false, error: 'Inicia sesión para acceder a los recursos.' },
        { status: 401 }
      );
    }
    if (error instanceof ValidationError || error instanceof AssetNotFoundError) {
      return NextResponse.json(
        { success: false, error: error.message },
        { status: error instanceof ValidationError ? 400 : 404 }
      );
    }
    console.error('Studio asset request failed:', error);
    return NextResponse.json(
      { success: false, error: 'No se pudo completar la operación del recurso.' },
      { status: 500 }
    );
  }
}
