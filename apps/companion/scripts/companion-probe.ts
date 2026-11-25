import { randomUUID } from 'node:crypto';
import { parseArgs } from 'node:util';
import { AssistantProviderSchema } from '@workspace/video-project';
import {
  bindCodexSessionFile,
  ClaudeTransport,
  CodexTransport,
  openLocalBindings,
  type Binding,
  type RequestEnvelope,
} from '../src/index';

const { values } = parseArgs({
  options: {
    provider: { type: 'string' },
    'binding-id': { type: 'string' },
    'session-file': { type: 'string' },
  },
});

async function main() {
  const provider = AssistantProviderSchema.parse(values.provider);
  const requestId = `f6-${provider}-connection`;
  const store = await openLocalBindings();
  let response = '';
  const claude = new ClaudeTransport({
    store,
    inspectResponse: (result) => {
      response = result;
    },
  });
  let binding: Binding | null = null;
  let bootstrapCode: string | undefined;
  if (values['binding-id']) {
    binding = await store.get(values['binding-id']);
  } else if (provider === 'codex' && values['session-file']) {
    binding = await bindCodexSessionFile(store, values['session-file']);
  } else if (provider === 'claude') {
    bootstrapCode = randomUUID();
    const bootstrap = await claude.bindManagedSession(
      `Prueba f6-claude-binding. Recuerda este código para el siguiente turno: ${bootstrapCode}. Responde exactamente: Sesión lista. Sin herramientas, cambios de archivos, video ni voz.`
    );
    const recognized = response.trim() === 'Sesión lista.';
    console.log(
      JSON.stringify({
        requestId: 'f6-claude-binding',
        status: bootstrap.status,
        responseConfirmed: recognized,
        notice: bootstrap.notice,
      })
    );
    if (bootstrap.status !== 'sent' || !bootstrap.binding || !recognized) {
      process.exitCode = 1;
      return;
    }
    binding = bootstrap.binding;
  }
  if (!binding || binding.provider !== provider) throw new Error('Binding required');

  const transport =
    provider === 'codex' ? new CodexTransport({ workspace: store.workspace }) : claude;
  const capabilities = await transport.probe(binding);
  console.log(JSON.stringify({ requestId, provider, capabilities }));
  if (!capabilities.canSendToBoundSession) {
    process.exitCode = 1;
    return;
  }
  const message = bootstrapCode
    ? `Confirma brevemente la recepción con RECIBIDO ${requestId} seguido del código del turno anterior. Mantén esta conversación para continuar la integración.`
    : `Confirma brevemente la recepción con RECIBIDO ${requestId} y continúa la integración en curso.`;
  const envelope: RequestEnvelope = {
    requestId,
    provider,
    bindingId: binding.id,
    projectId: 'f6-transport-probe',
    baseRevision: 'f6-probe-revision',
    engine: 'hyperframes',
    selection: { sceneId: null, layerId: null, captionId: null, timeMs: 0 },
    kind: 'feedback',
    message,
    callback: null,
  };
  response = '';
  const receipt = await transport.dispatch(binding, envelope);
  const responseConfirmed =
    provider === 'claude'
      ? response.includes(`RECIBIDO ${requestId}`) &&
        (!bootstrapCode || response.includes(bootstrapCode))
      : undefined;
  console.log(
    JSON.stringify({
      requestId,
      status: receipt.status,
      deliveryIdConfirmed: !!receipt.deliveryId,
      notice: receipt.notice,
      responseConfirmed,
    })
  );
  if (receipt.status !== 'sent' || responseConfirmed === false) process.exitCode = 1;
}

main().catch(() => {
  console.error(
    'La comprobación necesita un proveedor y un vínculo local válidos. Revisa el estado antes de repetirla.'
  );
  process.exitCode = 1;
});
