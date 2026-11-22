import { LibraryRefSchema } from '@workspace/video-project';

import { ValidationError } from '@/server/lib/utils';
import { LibraryNotFoundError } from '@/server/services/studio/library-service';

import { libraryKind, libraryResponse, libraryService } from '../../../http';

export const runtime = 'nodejs';

type Context = { params: Promise<{ kind: string; id: string; version: string }> };

export function GET(request: Request, { params }: Context) {
  return libraryResponse(request, async (ownerId) => {
    const { kind, id, version } = await params;
    const expected = libraryKind(kind);
    const ref = LibraryRefSchema.safeParse({
      id,
      version: /^\d+$/.test(version) ? Number(version) : NaN,
    });
    if (!ref.success) throw new ValidationError('La referencia de biblioteca no es válida.');
    const entry = await libraryService.get(ownerId, ref.data);
    if (entry.kind !== expected) throw new LibraryNotFoundError();
    return entry;
  });
}
