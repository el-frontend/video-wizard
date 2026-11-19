import { z } from 'zod';
import { SessionBusyError, type BindingStore } from './binding-store';
import {
  capabilities,
  invalidDestination,
  matchesBinding,
  parseJson,
  promptFor,
  runCommand,
  SessionIdSchema,
  type AssistantTransport,
  type Binding,
  type DeliveryReceipt,
  type RequestEnvelope,
  type CommandRunner,
} from './protocol';

const authSchema = z.object({ loggedIn: z.boolean() });
const initSchema = z.object({
  type: z.literal('system'),
  subtype: z.literal('init'),
  session_id: SessionIdSchema,
  mcp_servers: z.array(z.object({ status: z.string() })).optional(),
  mcp_server_errors: z.array(z.unknown()).optional(),
  plugin_errors: z.array(z.unknown()).optional(),
});
const successSchema = z.object({
  type: z.literal('result'),
  subtype: z.literal('success'),
  is_error: z.literal(false),
  session_id: SessionIdSchema,
  uuid: z.string().min(1),
  result: z.string(),
});

const organizationRejectionSchema = z.object({
  type: z.literal('assistant'),
  session_id: SessionIdSchema,
  parent_tool_use_id: z.null(),
  error: z.literal('oauth_org_not_allowed'),
});

const organizationRejectedNotice =
  'La organización de la sesión OAuth rechazó la ejecución de Claude Code.';
const verificationRequiredNotice =
  'Vincula una conversación de Claude Code desde la CLI para verificar su ejecución.';

type ClaudeTransportOptions = {
  store: BindingStore;
  run?: CommandRunner;
  inspectResponse?: (response: string) => void;
};

type ManagedSessionReceipt = {
  status: DeliveryReceipt['status'];
  binding?: Binding;
  notice?: string;
};

function readEvents<T>(schema: z.ZodType<T>, events: unknown[]): T[] {
  return events.flatMap((event) => {
    const parsed = schema.safeParse(event);
    return parsed.success ? [parsed.data] : [];
  });
}

export class ClaudeTransport implements AssistantTransport {
  private readonly run;
  private readonly store;
  private readonly inspectResponse;

  constructor({ store, run = runCommand, inspectResponse }: ClaudeTransportOptions) {
    this.store = store;
    this.run = run;
    this.inspectResponse = inspectResponse;
  }

  async probe(binding: Binding) {
    if (!matchesBinding(binding, 'claude', this.store.workspace)) {
      return capabilities(false, false, false, invalidDestination().notice);
    }
    const cli = await this.checkCli();
    if (!cli.authenticated) return cli;

    const reason = await this.executionBlock(binding);
    if (reason) return { ...cli, available: false, canSendToBoundSession: false, reason };
    return cli;
  }

  private async executionBlock(binding: Binding) {
    const evidence = await this.store.getClaudeExecution(binding);
    if (evidence === 'organization-rejected') return organizationRejectedNotice;
    if (evidence !== 'verified') return verificationRequiredNotice;
  }

  private async checkCli() {
    const options = { cwd: this.store.workspace, timeoutMs: 5000 };
    const help = await this.run('claude', ['--help'], options);
    const supported =
      help.outcome === 'ok' &&
      ['--print', '--resume', '--output-format', 'stream-json', '--verbose'].every((flag) =>
        help.stdout.includes(flag)
      );
    if (!supported) {
      return capabilities(
        false,
        false,
        true,
        'Se requiere la CLI de Claude Code con soporte para reanudar sesiones.'
      );
    }

    const auth = await this.run('claude', ['auth', 'status', '--json'], options);
    const status = authSchema.safeParse(parseJson(auth.stdout));
    const authenticated = auth.outcome === 'ok' && status.success && status.data.loggedIn;
    return capabilities(
      true,
      authenticated,
      true,
      authenticated
        ? undefined
        : 'Claude Code no confirmó la autenticación local. Comprueba el acceso al llavero desde el proceso local.'
    );
  }

  async bindManagedSession(prompt: string): Promise<ManagedSessionReceipt> {
    const { receipt, sessionId } = await this.runTurn(prompt);
    return {
      status: receipt.status,
      ...(sessionId ? { binding: await this.store.createVerifiedClaudeBinding(sessionId) } : {}),
      ...(receipt.notice ? { notice: receipt.notice } : {}),
    };
  }

  async dispatch(binding: Binding, envelope: RequestEnvelope): Promise<DeliveryReceipt> {
    const prompt = promptFor(binding, envelope, 'claude', this.store.workspace);
    if (!prompt) return invalidDestination();
    try {
      return await this.store.exclusiveSession(binding.sessionId, async () => {
        const reason = await this.executionBlock(binding);
        if (reason) return { status: 'failed', notice: reason };

        const { receipt, organizationRejected } = await this.runTurn(prompt, binding.sessionId);
        if (!organizationRejected) return receipt;

        try {
          await this.store.recordClaudeOrganizationRejection(binding);
          return receipt;
        } catch {
          return { ...receipt, notice: `${receipt.notice} No se pudo guardar el bloqueo local.` };
        }
      });
    } catch (error) {
      if (error instanceof SessionBusyError) {
        return {
          status: 'failed',
          notice: 'La sesión vinculada de Claude ya está ocupada por el companion.',
        };
      }
      return {
        status: 'delivery-unknown',
        notice:
          'No se pudo confirmar el estado de la sesión vinculada. Revísala antes de volver a enviar.',
      };
    }
  }

  private async runTurn(
    prompt: string,
    sessionId?: string
  ): Promise<{
    receipt: DeliveryReceipt;
    sessionId?: string;
    organizationRejected?: true;
  }> {
    const args = ['-p', '--verbose', '--output-format', 'stream-json'];
    if (sessionId) args.push('--resume', sessionId);
    const command = await this.run('claude', args, {
      cwd: this.store.workspace,
      timeoutMs: 120_000,
      input: prompt + '\n',
    });
    if (command.outcome === 'not-started') {
      return { receipt: { status: 'failed', notice: 'No se pudo iniciar la CLI de Claude Code.' } };
    }
    const events = command.stdout.split('\n').map(parseJson);
    const starts = readEvents(initSchema, events);
    const results = readEvents(successSchema, events);
    const startup = starts.length === 1 ? starts[0] : undefined;
    const result = results.length === 1 ? results[0] : undefined;
    const startupIssues = !!(
      startup?.mcp_server_errors?.length ||
      startup?.plugin_errors?.length ||
      startup?.mcp_servers?.some(({ status }) =>
        ['failed', 'needs-auth', 'error'].includes(status)
      ) ||
      /(?:MCP|plugin).*?(?:failed|error|skipped)/i.test(command.stderr)
    );
    const startupNotice = startupIssues
      ? ' Claude Code informó incidencias al iniciar MCP o plugins.'
      : '';
    const organizationRejected =
      startup &&
      (!sessionId || startup.session_id === sessionId) &&
      readEvents(organizationRejectionSchema, events).some(
        (event) => event.session_id === startup.session_id
      );
    if (organizationRejected && !result) {
      return {
        organizationRejected: true,
        receipt: { status: 'failed', notice: organizationRejectedNotice + startupNotice },
      };
    }
    if (
      !startup ||
      !result ||
      (!sessionId && command.outcome !== 'ok') ||
      startup.session_id !== result.session_id ||
      (sessionId && result.session_id !== sessionId)
    ) {
      return {
        receipt: {
          status: 'delivery-unknown',
          notice:
            (sessionId
              ? 'Claude Code no confirmó la respuesta en la sesión vinculada.'
              : 'Claude Code no confirmó el inicio de la conversación gestionada.') + startupNotice,
        },
      };
    }

    this.inspectResponse?.(result.result);
    return {
      receipt: {
        status: 'sent',
        deliveryId: result.uuid,
        ...(startupIssues ? { notice: startupNotice.trimStart() } : {}),
      },
      sessionId: result.session_id,
    };
  }
}
