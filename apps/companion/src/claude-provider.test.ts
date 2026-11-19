import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { BindingStore } from './binding-store';
import { ClaudeTransport } from './claude-provider';
import type { Binding } from './protocol';
import { commandSpy, envelope, otherSession, result, sessionId } from './test-fixtures';

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
const organizationDenied = {
  outcome: 'error' as const,
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
};

let root: string;
let store: BindingStore;
const reopenStore = () => BindingStore.open({ workspace: root, dataDir: join(root, 'state') });
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'studio-claude-'));
  store = await reopenStore();
});
afterEach(async () => rm(root, { recursive: true, force: true }));

const transportFor = (run = commandSpy(), bindings = store) =>
  new ClaudeTransport({ store: bindings, run });
const statusRunner = () =>
  commandSpy()
    .mockResolvedValueOnce(result(help))
    .mockResolvedValueOnce(result('{"loggedIn":true}'));
const envelopeFor = (binding: Binding) => ({
  ...envelope,
  bindingId: binding.id,
  provider: 'claude' as const,
});

async function bindSession(id = sessionId, bindings = store) {
  const run = commandSpy().mockResolvedValueOnce(turn(id));
  const receipt = await transportFor(run, bindings).bindManagedSession('Confirm startup.');
  if (!receipt.binding) throw new Error('Expected a verified Claude binding');
  return receipt.binding;
}

it('reports Claude unavailable when installed but the auth status is false', async () => {
  const binding = await bindSession();
  const run = commandSpy().mockResolvedValueOnce(result(help)).mockResolvedValueOnce({
    outcome: 'error',
    stdout: '{"loggedIn":false}',
    stderr: 'private error',
  });
  expect(await transportFor(run).probe(binding)).toEqual({
    available: false,
    authenticated: false,
    canResume: true,
    canSendToBoundSession: false,
    reason: expect.any(String),
  });
  expect(run.mock.calls[1]?.slice(0, 2)).toEqual(['claude', ['auth', 'status', '--json']]);
});

it('does not advertise an old binding without execution evidence after login', async () => {
  const binding = await store.create('claude', sessionId);
  const run = statusRunner();
  expect(await transportFor(run).probe(binding)).toMatchObject({
    available: false,
    authenticated: true,
    canResume: true,
    canSendToBoundSession: false,
    reason: expect.stringContaining('verificar'),
  });
  expect(run.mock.calls.map(([, args]) => args)).toEqual([
    ['--help'],
    ['auth', 'status', '--json'],
  ]);
});

it('reports Claude available after both authenticated CLI and recorded execution', async () => {
  const binding = await bindSession();
  const reopened = await reopenStore();
  expect(await transportFor(statusRunner(), reopened).probe(binding)).toEqual({
    available: true,
    authenticated: true,
    canResume: true,
    canSendToBoundSession: true,
  });
});

it('persists the actual session returned by a managed conversation startup', async () => {
  const run = commandSpy().mockResolvedValueOnce(turn());
  const receipt = await transportFor(run).bindManagedSession('Confirm startup.');
  expect(receipt).toMatchObject({ status: 'sent', binding: { sessionId } });
  expect(await store.get(receipt.binding!.id)).toEqual(receipt.binding);
  expect(run.mock.calls[0]?.[1]).not.toContain('--resume');
});

it('confirms a response only from the original managed session', async () => {
  const binding = await bindSession();
  const request = envelopeFor(binding);
  const run = commandSpy().mockResolvedValueOnce(turn());
  expect(await transportFor(run).dispatch(binding, request)).toEqual({
    status: 'sent',
    deliveryId: 'turn-4',
  });
  expect(run).toHaveBeenCalledExactlyOnceWith(
    'claude',
    ['-p', '--verbose', '--output-format', 'stream-json', '--resume', sessionId],
    {
      cwd: store.workspace,
      timeoutMs: expect.any(Number),
      input: expect.any(String),
    }
  );
  expect(JSON.parse(run.mock.calls[0]![2].input!.split('\n\n')[1]!)).toEqual(request);
});

it('does not confirm a successful response for a different conversation', async () => {
  const binding = await bindSession();
  const run = commandSpy().mockResolvedValueOnce(turn(otherSession));
  expect(await transportFor(run).dispatch(binding, envelopeFor(binding))).toMatchObject({
    status: 'delivery-unknown',
  });
  expect(run).toHaveBeenCalledTimes(1);
});

it('reports sanitized MCP startup issues even when the turn succeeded', async () => {
  const binding = await bindSession();
  const run = commandSpy().mockResolvedValueOnce(turn(sessionId, true));
  const receipt = await transportFor(run).dispatch(binding, envelopeFor(binding));
  expect(receipt).toMatchObject({ status: 'sent', notice: expect.stringContaining('MCP') });
  expect(receipt.notice).not.toContain('private-server-name');
});

it('rejects another workspace or a browser-supplied destination before invoking Claude', async () => {
  const binding = await bindSession();
  const request = envelopeFor(binding);
  const run = commandSpy();
  const transport = transportFor(run);
  expect(await transport.dispatch({ ...binding, workspace: '/other' }, request)).toMatchObject({
    status: 'failed',
  });
  const redirected = { ...request, sessionId: otherSession };
  expect(await transport.dispatch(binding, redirected)).toMatchObject({ status: 'failed' });
  expect(run).not.toHaveBeenCalled();
});

it('reports an organization OAuth rejection without exposing a session ID or creating a binding', async () => {
  const run = commandSpy().mockResolvedValueOnce(organizationDenied);
  const receipt = await transportFor(run).bindManagedSession('Confirm startup.');
  expect(receipt).toMatchObject({
    status: 'failed',
    notice: expect.stringContaining('organización'),
  });
  expect(receipt.binding).toBeUndefined();
  expect(receipt.notice).not.toContain('private');
  expect(run).toHaveBeenCalledTimes(1);
});

it('retains a known OAuth rejection when store, transport and CLI status are recreated', async () => {
  const binding = await bindSession();
  const original = transportFor(commandSpy().mockResolvedValueOnce(organizationDenied));
  expect(await original.dispatch(binding, envelopeFor(binding))).toMatchObject({
    status: 'failed',
    notice: expect.stringContaining('organización'),
  });

  const statusRun = statusRunner();
  const reopened = transportFor(statusRun, await reopenStore());
  expect(await reopened.probe(binding)).toMatchObject({
    authenticated: true,
    available: false,
    canSendToBoundSession: false,
    reason: expect.stringContaining('organización'),
  });
  expect(await reopened.dispatch(binding, envelopeFor(binding))).toMatchObject({
    status: 'failed',
    notice: expect.stringContaining('organización'),
  });
  expect(statusRun.mock.calls.map(([, args]) => args)).toEqual([
    ['--help'],
    ['auth', 'status', '--json'],
  ]);
});

it('allows an explicit verified rebind while leaving the rejected binding blocked', async () => {
  const previous = await bindSession();
  const rejected = transportFor(commandSpy().mockResolvedValueOnce(organizationDenied));
  expect(await rejected.dispatch(previous, envelopeFor(previous))).toMatchObject({
    status: 'failed',
  });

  const reopened = await reopenStore();
  const next = await bindSession(otherSession, reopened);
  expect(next.id).not.toBe(previous.id);
  expect(next.sessionId).toBe(otherSession);
  expect(await transportFor(statusRunner(), reopened).probe(next)).toMatchObject({
    available: true,
    canSendToBoundSession: true,
  });
  expect(await transportFor(statusRunner(), reopened).probe(previous)).toMatchObject({
    available: false,
    canSendToBoundSession: false,
  });
});

it('does not mark a new binding verified if the CLI never confirms startup completion', async () => {
  const run = commandSpy().mockResolvedValueOnce({ ...turn(), outcome: 'timeout' });
  const receipt = await transportFor(run).bindManagedSession('Confirm startup.');
  expect(receipt.status).toBe('delivery-unknown');
  expect(receipt.binding).toBeUndefined();
});
