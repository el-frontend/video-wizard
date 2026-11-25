import { z } from 'zod';
import { CompanionRequestSchema } from '@workspace/video-project';
import { StudioApi } from './api-client';
import { type AssistantTransport, type Binding, type RequestEnvelope } from './protocol';
export const PairedSchema = z.strictObject({
  projectId: z.uuid(),
  bindingId: z.uuid(),
  provider: z.enum(['codex', 'claude']),
  origin: z.string(),
  token: z.string().regex(/^vw_dispatch_[\w-]{43}$/),
});
export type Pair = z.infer<typeof PairedSchema>;
export const GrantSchema = z.strictObject({
  request: CompanionRequestSchema,
  attemptId: z.uuid(),
  token: z.string().regex(/^vw_attempt_[\w-]{43}$/),
  instruction: z.string(),
});
export type Grant = z.infer<typeof GrantSchema>;
export async function dispatchPending(
  api: StudioApi,
  pair: Pair,
  binding: Binding,
  transport: AssistantTransport,
  persist: (g: Grant) => Promise<void>,
  requestId?: string,
  configDir?: string
) {
  if (
    pair.bindingId !== binding.id ||
    pair.provider !== binding.provider ||
    pair.origin !== api.origin
  )
    throw Error('El vínculo privado no corresponde al proyecto.');
  const path = '/api/studio/projects/' + pair.projectId + '/bindings/' + binding.id + '/dispatch';
  const raw = await api.call('POST', path, pair.token, { action: 'claim', requestId });
  if (!raw) return null;
  const grant = GrantSchema.parse(raw),
    r = grant.request;
  if (
    r.bindingId !== binding.id ||
    r.projectId !== pair.projectId ||
    r.provider !== binding.provider ||
    (requestId && r.id !== requestId)
  )
    throw Error('El intento no corresponde a esta solicitud.');
  await persist(grant);
  const envelope: RequestEnvelope = {
    projectId: r.projectId,
    baseRevision: r.baseRevision,
    engine: r.engine,
    selection: r.selection,
    kind: r.kind,
    message: r.message,
    provider: r.provider,
    bindingId: r.bindingId,
    requestId: r.id,
    instruction:
      grant.instruction +
      (configDir
        ? ' Ejecuta los comandos desde ' +
          JSON.stringify(binding.workspace) +
          ' y añade --config-dir ' +
          JSON.stringify(configDir) +
          ' a cada acción.'
        : ''),
    ...(r.sourceAssetId && { sourceAssetId: r.sourceAssetId }),
    callback: {
      url: api.origin + '/api/studio/projects/' + r.projectId + '/requests/' + r.id + '/status',
    },
  };
  // A failed process or ACK can mean the provider has already received the message.
  const result = await transport.dispatch(binding, envelope).catch(() => ({
    status: 'delivery-unknown' as const,
    notice: 'El proceso terminó sin confirmar el envío.',
    paused: false,
  }));
  return api.call('POST', path, pair.token, {
    action: 'ack',
    attemptId: grant.attemptId,
    requestId: r.id,
    receipt: {
      status: result.status === 'sent' && result.paused ? 'waiting' : result.status,
      note: result.notice,
      ...('deliveryId' in result && { deliveryId: result.deliveryId }),
    },
  });
}
