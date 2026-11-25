import { localToken, requests } from '../../../../../companion/http';
import { studioResponse, readJson } from '../../../../http';
import { instructionFor } from '@/server/prompts/studio/feedback';
import { z } from 'zod';
import { ValidationError } from '@/server/lib/utils';
type Context = { params: Promise<{ id: string; bindingId: string }> };
export function POST(request: Request, { params }: Context) {
  return studioResponse(async () => {
    const { id, bindingId } = await params,
      token = localToken(request, 'dispatch');
    await requests.verifyDispatcher(token, id, bindingId);
    const parsed = z
      .discriminatedUnion('action', [
        z.strictObject({ action: z.literal('claim'), requestId: z.uuid().optional() }),
        z.strictObject({
          action: z.literal('ack'),
          requestId: z.uuid(),
          attemptId: z.uuid(),
          receipt: z.unknown(),
        }),
      ])
      .safeParse(await readJson(request));
    if (!parsed.success) throw new ValidationError('Operación de despacho no válida.');
    const v = parsed.data;
    if (v.action === 'ack')
      return requests.ack(token, id, bindingId, v.requestId, v.attemptId, v.receipt);
    const claim = await requests.claim(token, id, bindingId, v.requestId);
    return claim && { ...claim, instruction: instructionFor(claim.request) };
  });
}
