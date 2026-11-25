import { realpath } from 'node:fs/promises';
import { join } from 'node:path';
import { StudioApi } from './api-client';
import { privateJson, savePrivate } from './private-files';
import { PairedSchema, dispatchPending } from './request-dispatcher';
import { runAction } from './action-client';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { BindingStore } from './binding-store';
import { ClaudeTransport } from './claude-provider';
import { CodexTransport } from './codex-provider';
import { SessionIdSchema, type Binding } from './protocol';

export { BindingStore } from './binding-store';
export { ClaudeTransport } from './claude-provider';
export { CodexTransport } from './codex-provider';
export {
  RequestEnvelopeSchema,
  type AssistantTransport,
  type Binding,
  type DeliveryReceipt,
  type RequestEnvelope,
  type TransportCapabilities,
} from './protocol';

const checkout = fileURLToPath(new URL('../../../', import.meta.url));

export function openLocalBindings() {
  return BindingStore.open({ workspace: checkout });
}

const CodexBindingFileSchema = z.object({
  codexThreadId: SessionIdSchema,
  workspace: z.string(),
});

export async function bindCodexSessionFile(store: BindingStore, file: string) {
  const trusted = CodexBindingFileSchema.parse(await privateJson(file));
  if ((await realpath(trusted.workspace)) !== store.workspace)
    throw new Error('Codex binding belongs to another workspace');
  return store.create('codex', trusted.codexThreadId);
}

function printBinding(binding: Binding) {
  const { id, provider } = binding;
  console.log(JSON.stringify({ bindingId: id, provider }));
}

const usage =
  'Uso: node scripts/local-studio.mjs companion <bind|migrate|pair|dispatch|action|status> [--config-dir DIRECTORIO]. Consulta docs/companion.md.';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      'session-file': { type: 'string' },
      'binding-id': { type: 'string' },
      'config-dir': { type: 'string' },
      'legacy-dir': { type: 'string' },
      file: { type: 'string' },
      origin: { type: 'string' },
      'project-id': { type: 'string' },
      'request-id': { type: 'string' },
      approved: { type: 'boolean' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const store = await BindingStore.open({ workspace: checkout, dataDir: values['config-dir'] });
  const [command, provider, ...extra] = positionals;
  if (command === 'migrate' && values['binding-id']) {
    printBinding(
      await store.migrate(
        values['binding-id'],
        values['legacy-dir'] ??
          process.env.STUDIO_DATA_DIR ??
          join(store.workspace, '.studio-data/companion')
      )
    );
    return;
  }
  if (command === 'action' && provider && extra.length === 1) {
    console.log(
      JSON.stringify(
        await runAction(store.directory, provider, extra[0]!, values.file, values.approved)
      )
    );
    return;
  }
  if ((command === 'pair' || command === 'dispatch') && values['binding-id']) {
    const binding = await store.get(values['binding-id']);
    if (!binding) throw Error('Vínculo no disponible.');
    const pairs = join(store.directory, 'pairs');
    if (command === 'pair') {
      if (!values.origin || !values.file)
        throw Error('Indica --origin y un archivo privado de emparejamiento.');
      const api = new StudioApi(values.origin);
      const intent = z
        .object({ token: z.string(), projectId: z.uuid() })
        .parse(await privateJson(values.file));
      const response = await api.call<Record<string, unknown>>(
        'POST',
        '/api/studio/companion/bind',
        intent.token,
        { bindingId: binding.id, provider: binding.provider }
      );
      const pair = PairedSchema.parse({ ...response, origin: api.origin });
      if (
        pair.projectId !== intent.projectId ||
        pair.bindingId !== binding.id ||
        pair.provider !== binding.provider
      )
        throw Error('Emparejamiento no válido.');
      await savePrivate(pairs, pair.projectId + '-' + binding.id + '.json', pair);
      printBinding(binding);
      return;
    }
    const project = z.uuid().parse(values['project-id']),
      pair = PairedSchema.parse(
        await privateJson(join(pairs, project + '-' + binding.id + '.json'))
      );
    if (pair.projectId !== project) throw Error('Proyecto no válido.');
    const transport =
      binding.provider === 'claude'
        ? new ClaudeTransport({ store })
        : new CodexTransport({ workspace: store.workspace });
    const result = await dispatchPending(
      new StudioApi(pair.origin),
      pair,
      binding,
      transport,
      (grant) =>
        savePrivate(join(store.directory, 'attempts'), grant.request.id + '.json', {
          origin: pair.origin,
          grant,
        }),
      values['request-id'],
      store.directory
    );
    console.log(JSON.stringify(result));
    return;
  }
  if (extra.length === 0 && command === 'bind' && provider === 'codex' && values['session-file']) {
    printBinding(await bindCodexSessionFile(store, values['session-file']));
    return;
  }
  const claude = new ClaudeTransport({ store });
  if (extra.length === 0 && command === 'bind' && provider === 'claude') {
    const session = await claude.bindManagedSession(
      'Abre esta conversación gestionada por el companion local de Video Wizard. Responde solo «Sesión vinculada». No uses herramientas ni modifiques proyectos.'
    );
    if (!session.binding || session.status !== 'sent') {
      console.error(session.notice ?? 'Claude Code no confirmó la nueva sesión.');
      process.exitCode = 1;
      return;
    }
    printBinding(session.binding);
    if (session.notice) console.error(session.notice);
    return;
  }
  if (command === 'status' && !provider && values['binding-id']) {
    const binding = await store.get(values['binding-id']);
    if (!binding) throw new Error('Binding not found');
    const transport =
      binding.provider === 'claude' ? claude : new CodexTransport({ workspace: store.workspace });
    const capabilities = await transport.probe(binding);
    console.log(JSON.stringify(capabilities));
    if (!capabilities.canSendToBoundSession) process.exitCode = 1;
    return;
  }
  console.error(usage);
  process.exitCode = 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    if (
      error instanceof Error &&
      /^Studio rechazó la operación \(HTTP \d+\)\.$/.test(error.message)
    )
      console.error(error.message);
    console.error(
      'El companion no pudo completar el comando. Comprueba el vínculo y los permisos locales.'
    );
    process.exitCode = 1;
  });
}
