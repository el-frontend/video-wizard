import {
  capabilities,
  invalidDestination,
  matchesBinding,
  promptFor,
  runCommand,
  type AssistantTransport,
  type Binding,
  type DeliveryReceipt,
  type RequestEnvelope,
  type TransportOptions,
} from './protocol';

export class CodexTransport implements AssistantTransport {
  private readonly run;
  private readonly workspace;

  constructor({ workspace, run = runCommand }: TransportOptions) {
    this.workspace = workspace;
    this.run = run;
  }

  async probe(binding: Binding) {
    if (!matchesBinding(binding, 'codex', this.workspace)) {
      return capabilities(false, false, false, invalidDestination().notice);
    }
    const options = { cwd: this.workspace, timeoutMs: 5000 };
    const help = await this.run('codex', ['queue', '--help'], options);
    const supported =
      help.outcome === 'ok' &&
      ['--thread', '--message', '--resume'].every((flag) => help.stdout.includes(flag));
    if (!supported) {
      return capabilities(
        false,
        false,
        true,
        'Se requiere la CLI de Codex con soporte para queue y resume.'
      );
    }

    const auth = await this.run('codex', ['login', 'status'], options);
    const authenticated =
      auth.outcome === 'ok' && /\bLogged in using\b/i.test(auth.stdout + auth.stderr);
    return capabilities(
      true,
      authenticated,
      true,
      authenticated ? undefined : 'Codex no confirmó la autenticación local.'
    );
  }

  async dispatch(binding: Binding, envelope: RequestEnvelope): Promise<DeliveryReceipt> {
    const prompt = promptFor(binding, envelope, 'codex', this.workspace);
    if (!prompt) return invalidDestination();

    const result = await this.run(
      'codex',
      ['queue', '--thread', binding.sessionId, '--message', prompt, '--resume'],
      { cwd: this.workspace, timeoutMs: 20_000 }
    );
    const acknowledgements = [
      ...result.stdout.matchAll(/^Queued message ([\w-]+) for thread ([\w-]+)\.\r?$/gm),
    ];
    const acknowledgement = acknowledgements.length === 1 ? acknowledgements[0] : undefined;
    if (acknowledgement && acknowledgement[2] === binding.sessionId) {
      if (result.outcome !== 'ok') {
        return {
          status: 'delivery-unknown',
          deliveryId: acknowledgement[1],
          notice:
            'Codex confirmó la aceptación en cola. No se pudo confirmar la reanudación. Revisa la conversación antes de volver a enviar.',
        };
      }
      const needsResume = /could not resume/i.test(result.stderr);
      return {
        status: 'sent',
        deliveryId: acknowledgement[1],
        ...(needsResume
          ? { notice: 'Enviado. Para procesarlo, debes continuar la conversación vinculada.' }
          : {}),
      };
    }
    if (result.outcome === 'not-started') {
      return { status: 'failed', notice: 'No se pudo iniciar la CLI de Codex.' };
    }
    return {
      status: 'delivery-unknown',
      notice:
        'No se pudo confirmar el envío. Revisa la conversación vinculada antes de volver a enviarlo.',
    };
  }
}
