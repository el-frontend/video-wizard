import { readFile, realpath, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { z } from 'zod';
import { BindingStore } from './binding-store';
import { ClaudeTransport } from './claude-provider';
import { CodexTransport } from './codex-provider';
import { SessionIdSchema, parseJson, type Binding } from './protocol';

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
  if (((await stat(file)).mode & 0o077) !== 0) throw new Error('Codex binding file is not private');
  const trusted = CodexBindingFileSchema.parse(parseJson(await readFile(file, 'utf8')));
  if ((await realpath(trusted.workspace)) !== store.workspace)
    throw new Error('Codex binding belongs to another workspace');
  return store.create('codex', trusted.codexThreadId);
}

function printBinding(binding: Binding) {
  const { id, provider } = binding;
  console.log(JSON.stringify({ bindingId: id, provider }));
}

const usage =
  'Uso: pnpm companion bind codex --session-file ARCHIVO | bind claude | status --binding-id ID';

async function main() {
  const { values, positionals } = parseArgs({
    allowPositionals: true,
    options: {
      help: { type: 'boolean', short: 'h' },
      'session-file': { type: 'string' },
      'binding-id': { type: 'string' },
    },
  });
  if (values.help) {
    console.log(usage);
    return;
  }
  const store = await openLocalBindings();
  const [command, provider, ...extra] = positionals;
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
  main().catch(() => {
    console.error(
      'El companion no pudo completar el comando. Comprueba el vínculo y los permisos locales.'
    );
    process.exitCode = 1;
  });
}
