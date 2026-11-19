import { expect, it } from 'vitest';
import { ClaudeTransport } from './claude-provider';
import {
  binding,
  commandSpy,
  envelope,
  otherSession,
  result,
  sessionId,
  workspace,
} from './test-fixtures';

const claudeBinding = { ...binding, provider: 'claude' } as const;
const claudeEnvelope = { ...envelope, provider: 'claude' } as const;
const help = '--print --resume --output-format stream-json --verbose';
const turn = (id = sessionId, startupFailed = false) =>
  result(
    [
      {
        type: 'system',
        subtype: 'init',
        session_id: id,
        mcp_servers: [
          { name: 'private-server-name', status: startupFailed ? 'failed' : 'connected' },
        ],
      },
      {
        type: 'result',
        subtype: 'success',
        is_error: false,
        session_id: id,
        uuid: 'turn-4',
        result: 'Received.',
      },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n')
  );
const exclusiveSession = async <T>(_sessionId: string, action: () => Promise<T>) => action();
const transportFor = (run = commandSpy()) =>
  new ClaudeTransport({ workspace, run, exclusiveSession });

it('reports Claude unavailable when installed but the auth status is false', async () => {
  const run = commandSpy().mockResolvedValueOnce(result(help)).mockResolvedValueOnce({
    outcome: 'error',
    stdout: '{"loggedIn":false}',
    stderr: 'private error',
  });
  expect(await transportFor(run).probe(claudeBinding)).toEqual({
    available: false,
    authenticated: false,
    canResume: true,
    canSendToBoundSession: false,
    reason: expect.any(String),
  });
  expect(run.mock.calls[1]?.slice(0, 2)).toEqual(['claude', ['auth', 'status', '--json']]);
});

it('reports Claude available on compatible CLI and verified authentication', async () => {
  const run = commandSpy()
    .mockResolvedValueOnce(result(help))
    .mockResolvedValueOnce(result('{"loggedIn":true}'));
  expect(await transportFor(run).probe(claudeBinding)).toEqual({
    available: true,
    authenticated: true,
    canResume: true,
    canSendToBoundSession: true,
  });
});

it('captures the actual session returned by a managed conversation startup', async () => {
  const run = commandSpy().mockResolvedValueOnce(turn());
  expect(await transportFor(run).startManagedSession('Confirm startup.')).toEqual({
    status: 'sent',
    sessionId,
  });
  expect(run.mock.calls[0]?.[1]).not.toContain('--resume');
});

it('confirms a response only from the original managed session', async () => {
  const run = commandSpy().mockResolvedValueOnce(turn());
  expect(await transportFor(run).dispatch(claudeBinding, claudeEnvelope)).toEqual({
    status: 'sent',
    deliveryId: 'turn-4',
  });
  expect(run).toHaveBeenCalledExactlyOnceWith(
    'claude',
    ['-p', '--verbose', '--output-format', 'stream-json', '--resume', sessionId],
    {
      cwd: workspace,
      timeoutMs: expect.any(Number),
      input: expect.any(String),
    }
  );
  expect(JSON.parse(run.mock.calls[0]![2].input!.split('\n\n')[1]!)).toEqual(claudeEnvelope);
});

it('does not confirm a successful response for a different conversation', async () => {
  const run = commandSpy().mockResolvedValueOnce(turn(otherSession));
  expect(await transportFor(run).dispatch(claudeBinding, claudeEnvelope)).toMatchObject({
    status: 'delivery-unknown',
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it('reports sanitized MCP startup issues even when the turn succeeded', async () => {
  const run = commandSpy().mockResolvedValueOnce(turn(sessionId, true));
  const receipt = await transportFor(run).dispatch(claudeBinding, claudeEnvelope);
  expect(receipt).toMatchObject({ status: 'sent', notice: expect.stringContaining('MCP') });
  expect(receipt.notice).not.toContain('private-server-name');
});

it('rejects another workspace or a browser-supplied destination before invoking Claude', async () => {
  const run = commandSpy();
  const transport = transportFor(run);
  expect(
    await transport.dispatch({ ...claudeBinding, workspace: '/other' }, claudeEnvelope)
  ).toMatchObject({ status: 'failed' });
  const redirected = { ...claudeEnvelope, sessionId: otherSession };
  expect(await transport.dispatch(claudeBinding, redirected)).toMatchObject({ status: 'failed' });
  expect(run).not.toHaveBeenCalled();
});

it('reports an organization OAuth rejection without persisting or exposing a session ID', async () => {
  const run = commandSpy().mockResolvedValueOnce({
    outcome: 'error',
    stdout: [
      { type: 'system', subtype: 'init', session_id: sessionId },
      {
        type: 'assistant',
        session_id: sessionId,
        parent_tool_use_id: null,
        error: 'oauth_org_not_allowed',
        message: { diagnostic: 'private organization detail' },
      },
    ]
      .map((event) => JSON.stringify(event))
      .join('\n'),
    stderr: 'internal diagnostic',
  });
  const receipt = await transportFor(run).startManagedSession('Confirm startup.');
  expect(receipt).toMatchObject({
    status: 'failed',
    notice: expect.stringContaining('organización'),
  });
  expect(receipt.sessionId).toBeUndefined();
  expect(receipt.notice).not.toContain('private');
  expect(run).toHaveBeenCalledTimes(1);
});
