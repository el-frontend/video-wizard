import { z } from 'zod';
import { LibraryRefSchema } from '@workspace/video-project';
import { ValidationError } from '@/server/lib/utils';
import { projectResponse, readJson } from '../../../projects/http';
import { templateService } from '../../service';
export function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  return projectResponse(async (owner) => {
    const body = await readJson(request);
    const ref = z.object({ templateRef: LibraryRefSchema }).safeParse(body);
    if (!ref.success || ref.data.templateRef.id !== (await params).id)
      throw new ValidationError('La versión no corresponde a la plantilla solicitada.');
    return templateService.instantiate(owner, body);
  }, 201);
}
