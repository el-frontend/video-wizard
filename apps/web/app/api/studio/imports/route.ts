import { db } from '@/server/db';
import { ImportService } from '@/server/services/studio/import-service';
import { projectResponse, readJson } from '../projects/http';

export function POST(request: Request) {
  return projectResponse(request, async (owner) =>
    new ImportService(db).import(owner, await readJson(request))
  );
}
