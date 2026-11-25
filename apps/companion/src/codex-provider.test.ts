import { expect, it } from 'vitest';
import { CodexTransport } from './codex-provider';
import {
  binding,
  commandSpy,
  envelope,
  otherSession,
  result,
  sessionId,
  workspace,
} from './test-fixtures';

it('reports an installed Codex CLI without the queue protocol as unavailable', async () => {
  const run = commandSpy().mockResolvedValueOnce(result('Usage: codex [OPTIONS]'));
  const transport = new CodexTransport({ workspace, run });
  expect(await transport.probe(binding)).toMatchObject({
    available: false,
    canSendToBoundSession: false,
  });
  expect(run.mock.calls[0]?.slice(0, 2)).toEqual(['codex', ['queue', '--help']]);
});

it('reports an authenticated CLI that supports queuing and resuming', async () => {
  const run = commandSpy()
    .mockResolvedValueOnce(result('--thread <THREAD> --message <TEXT> --resume'))
    .mockResolvedValueOnce(result('Logged in using ChatGPT'));
  const transport = new CodexTransport({ workspace, run });
  expect(await transport.probe(binding)).toEqual({
    available: true,
    authenticated: true,
    canResume: true,
    canSendToBoundSession: true,
  });
});

it('queues one message to the bound thread using separate process arguments', async () => {
  const run = commandSpy().mockResolvedValueOnce(
    result(`Queued message delivery-4 for thread ${sessionId}.`)
  );
  const transport = new CodexTransport({ workspace, run });
  expect(await transport.dispatch(binding, envelope)).toEqual({
    status: 'sent',
    deliveryId: 'delivery-4',
  });
  expect(run).toHaveBeenCalledExactlyOnceWith(
    'codex',
    ['queue', '--thread', sessionId, '--message', expect.any(String), '--resume'],
    { cwd: workspace, timeoutMs: expect.any(Number) }
  );
  expect(JSON.parse(run.mock.calls[0]![1][4]!.split('\n\n')[1]!)).toEqual(envelope);
});

it.each(['ok', 'error'] as const)(
  'records the queue receipt when outcome is %s and the CLI warns that resumption failed',
  async (outcome) => {
    const run = commandSpy().mockResolvedValueOnce({
      outcome,
      stdout: `Queued message delivery-4 for thread ${sessionId}.`,
      stderr: 'Warning: could not resume thread (internal diagnostic)',
    });
    const transport = new CodexTransport({ workspace, run });
    expect(await transport.dispatch(binding, envelope)).toEqual({
      status: 'sent',
      paused: true,
      deliveryId: 'delivery-4',
      notice: expect.stringContaining('continuar'),
    });
    expect(run).toHaveBeenCalledTimes(1);
  }
);

it.each([
  { outcome: 'timeout' as const, stdout: '', stderr: 'private diagnostic' },
  result(`Queued message another-delivery for thread ${otherSession}.`),
  result('Code exited successfully with no acknowledgement'),
])('marks unconfirmed delivery as uncertain after a single invocation', async (output) => {
  const run = commandSpy().mockResolvedValueOnce(output);
  const transport = new CodexTransport({ workspace, run });
  expect(await transport.dispatch(binding, envelope)).toEqual({
    status: 'delivery-unknown',
    notice: expect.stringContaining('confirmar'),
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it.each([
  { binding: { ...binding, workspace: '/another/studio' }, envelope },
  { binding, envelope: { ...envelope, sessionId: otherSession } },
  { binding, envelope: { ...envelope, bindingId: 'unexpected-binding' } },
  { binding, envelope: { ...envelope, provider: 'claude' } },
])('rejects an unbound destination before invoking Codex', async (input) => {
  const run = commandSpy();
  const transport = new CodexTransport({ workspace, run });
  expect(await transport.dispatch(input.binding, input.envelope as typeof envelope)).toMatchObject({
    status: 'failed',
  });
  expect(run).not.toHaveBeenCalled();
});

it.each([
  'invalid-url',
  'http://user:password@localhost/project',
  'http://localhost/project?credential=private',
  'http://localhost/project#credential',
])('rejects an invalid or credential-bearing callback before starting Codex', async (url) => {
  const run = commandSpy();
  const transport = new CodexTransport({ workspace, run });
  const callback = { url };
  expect(await transport.dispatch(binding, { ...envelope, callback })).toMatchObject({
    status: 'failed',
  });
  expect(run).not.toHaveBeenCalled();
});

it.each([
  { outcome: 'timeout' as const, stderr: 'private diagnostic' },
  { outcome: 'timeout' as const, stderr: 'Warning: could not resume thread (private diagnostic)' },
  { outcome: 'error' as const, stderr: 'private diagnostic' },
])('retains the queue ID on $outcome when resumption is uncertain', async ({ outcome, stderr }) => {
  const run = commandSpy().mockResolvedValueOnce({
    outcome,
    stdout: `Queued message delivery-4 for thread ${sessionId}.`,
    stderr,
  });
  const transport = new CodexTransport({ workspace, run });
  const receipt = await transport.dispatch(binding, envelope);
  expect(receipt).toMatchObject({
    status: 'delivery-unknown',
    deliveryId: 'delivery-4',
    notice: expect.stringMatching(/cola.*no se pudo confirmar la reanudación/i),
  });
  expect(receipt.notice).not.toContain('private');
  expect(run).toHaveBeenCalledTimes(1);
});
