import { publishEdition } from '@/server/services/studio/library-editions';
import { libraryService, libraryResponse } from '../libraries/http';
import { readJson } from '../projects/http';
export function POST(request: Request) {
  return libraryResponse(
    async (owner) => publishEdition(libraryService, owner, await readJson(request)),
    201
  );
}
