import { db } from '@/server/db';
import { provisionCatalog } from '@/server/services/studio/provision-catalog';
import { libraryResponse } from '../libraries/http';
export const runtime = 'nodejs';
export function POST(request: Request) {
  return libraryResponse(request, (owner) => provisionCatalog(db, owner), 201);
}
