import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';
import { shorts, shortSource } from '@/server/services/studio/shorts';
import { projectResponse, readJson } from '../projects/http';
const action = z.discriminatedUnion('action', [
  z.strictObject({ action: z.literal('download'), url: z.string() }),
  z.strictObject({ action: z.literal('transcribe'), assetId: z.uuid() }),
  z.strictObject({ action: z.literal('create'), input: z.unknown() }),
  z.strictObject({ action: z.literal('open-job'), input: z.unknown() }),
]);
export function POST(request: Request) {
  return projectResponse<unknown>(async (owner) => {
    const parsed = action.safeParse(await readJson(request));
    if (!parsed.success) throw new ValidationError('Solicitud de shorts no válida.');
    const data = parsed.data;
    switch (data.action) {
      case 'download':
        return shortSource.download(owner, data.url);
      case 'transcribe':
        return shortSource.transcribe(owner, data.assetId);
      case 'create':
        return shorts.create(owner, data.input);
      case 'open-job':
        return shorts.fromJob(owner, data.input);
    }
  });
}
