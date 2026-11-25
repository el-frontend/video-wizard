import { projectResponse, projectService, readJson } from '../../http';
import type { Context } from '../../../companion/http';
import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';
export function POST(request: Request, { params }: Context) {
  return projectResponse(request, async (owner) => {
    const body = z.strictObject({ baseRevision: z.uuid() }).safeParse(await readJson(request));
    if (!body.success) throw new ValidationError('Selecciona la revisión de las tomas.');
    return projectService.activateSceneTakes(owner, (await params).id, body.data.baseRevision);
  });
}
