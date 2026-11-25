import { execFile } from 'node:child_process';
import { isAbsolute } from 'node:path';
import {
  AssistantProviderSchema,
  CompanionRequestSchema,
  IdSchema,
} from '@workspace/video-project';
import { z } from 'zod';

export const SessionIdSchema = z.guid().transform((value) => value.toLowerCase());
export const BindingSchema = z.strictObject({
  id: z.uuid(),
  provider: AssistantProviderSchema,
  sessionId: SessionIdSchema,
  workspace: z.string().refine(isAbsolute),
  createdAt: z.iso.datetime(),
});
export type Binding = z.infer<typeof BindingSchema>;

export const RequestEnvelopeSchema = CompanionRequestSchema.pick({
  projectId: true,
  baseRevision: true,
  provider: true,
  bindingId: true,
  engine: true,
  selection: true,
  kind: true,
  message: true,
}).extend({
  requestId: IdSchema,
  instruction: z.string().max(4000).optional(),
  sourceAssetId: z.uuid().optional(),
  callback: z
    .strictObject({
      url: z.url({ protocol: /^https?$/ }).refine((value) => {
        if (!URL.canParse(value)) return false;
        const url = new URL(value);
        return !url.username && !url.password && !url.search && !url.hash;
      }),
    })
    .nullable(),
});
export type RequestEnvelope = z.infer<typeof RequestEnvelopeSchema>;

export interface TransportCapabilities {
  available: boolean;
  authenticated: boolean;
  canResume: boolean;
  canSendToBoundSession: boolean;
  reason?: string;
}

export interface DeliveryReceipt {
  status: 'sent' | 'delivery-unknown' | 'failed';
  deliveryId?: string;
  paused?: boolean;
  notice?: string;
}

export interface AssistantTransport {
  probe(binding: Binding): Promise<TransportCapabilities>;
  dispatch(binding: Binding, envelope: RequestEnvelope): Promise<DeliveryReceipt>;
}

export interface CommandOptions {
  cwd: string;
  timeoutMs: number;
  input?: string;
}

export interface CommandResult {
  outcome: 'ok' | 'error' | 'timeout' | 'not-started';
  stdout: string;
  stderr: string;
}

export type CommandRunner = (
  binary: string,
  args: string[],
  options: CommandOptions
) => Promise<CommandResult>;

export interface TransportOptions {
  workspace: string;
  run?: CommandRunner;
}

export function providerEnvironment(env: NodeJS.ProcessEnv = process.env) {
  return Object.fromEntries(
    [
      'PATH',
      'HOME',
      'USER',
      'LOGNAME',
      'SHELL',
      'TERM',
      'LANG',
      'LC_ALL',
      'TMPDIR',
      'CODEX_HOME',
      'XDG_CONFIG_HOME',
      'XDG_DATA_HOME',
      'CLAUDE_CONFIG_DIR',
    ].flatMap((key) => (env[key] !== undefined ? [[key, env[key]!]] : []))
  );
}

export const runCommand: CommandRunner = (binary, args, { cwd, timeoutMs, input }) =>
  new Promise((resolve) => {
    let timedOut = false;
    let forceKill: NodeJS.Timeout | undefined;
    const child = execFile(
      binary,
      args,
      {
        cwd,
        env: providerEnvironment(),
        encoding: 'utf8',
        shell: false,
        maxBuffer: 8 * 1024 * 1024,
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        clearTimeout(deadline);
        clearTimeout(forceKill);
        let outcome: CommandResult['outcome'] = 'ok';
        if (timedOut) outcome = 'timeout';
        else if (error?.code === 'ENOENT' || error?.code === 'EACCES') outcome = 'not-started';
        else if (error) outcome = 'error';
        resolve({ outcome, stdout, stderr });
      }
    );
    const deadline = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      forceKill = setTimeout(() => child.kill('SIGKILL'), 2000);
    }, timeoutMs);
    child.stdin?.on('error', () => {
      // The child may exit before reading stdin. Its exit and output determine the receipt.
    });
    child.stdin?.end(input);
  });

export function matchesBinding(binding: Binding, provider: Binding['provider'], workspace: string) {
  const parsed = BindingSchema.safeParse(binding);
  return parsed.success && parsed.data.provider === provider && parsed.data.workspace === workspace;
}

export function promptFor(
  binding: Binding,
  envelope: RequestEnvelope,
  provider: Binding['provider'],
  workspace: string
): string | null {
  const parsed = RequestEnvelopeSchema.safeParse(envelope);
  if (!parsed.success || !matchesBinding(binding, provider, workspace)) return null;
  if (parsed.data.bindingId !== binding.id || parsed.data.provider !== provider) return null;

  const context = parsed.data.callback
    ? 'Usa únicamente la API autorizada del editor para leer o editar el proyecto. Respeta la revisión base y registra el resultado con el callback de la solicitud.'
    : 'Esta es una comprobación de conexión. Responde en esta conversación y continúa la integración en curso. No uses herramientas, cambies archivos ni videos, ni generes voz.';
  return `Solicitud de Video Wizard en la conversación vinculada. ${context}\n\n${JSON.stringify(parsed.data)}`;
}

export function capabilities(
  compatible: boolean,
  authenticated: boolean,
  bindingMatches: boolean,
  reason?: string
): TransportCapabilities {
  return {
    available: compatible && authenticated,
    authenticated,
    canResume: compatible,
    canSendToBoundSession: compatible && authenticated && bindingMatches,
    ...(reason ? { reason } : {}),
  };
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

export function invalidDestination(): DeliveryReceipt {
  return {
    status: 'failed',
    notice: 'El vínculo local no coincide con el destino de la solicitud.',
  };
}
