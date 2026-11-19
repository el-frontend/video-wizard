import { mkdtemp, mkdir, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { BindingStore, SessionBusyError } from './binding-store';
import { otherSession, sessionId } from './test-fixtures';

let root: string;
let workspace: string;
let dataDir: string;
beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'studio-binding-'));
  workspace = join(root, 'checkout');
  dataDir = join(root, 'private', 'companion');
  await mkdir(workspace);
});
afterEach(async () => rm(root, { recursive: true, force: true }));

it('persists the CLI binding across store instances with private file permissions', async () => {
  const store = await BindingStore.open({ workspace, dataDir });
  const binding = await store.create('codex', sessionId);
  const reopened = await BindingStore.open({ workspace, dataDir });
  expect(await reopened.get(binding.id)).toEqual(binding);
  expect((await stat(join(dataDir, 'bindings', `${binding.id}.json`))).mode & 0o777).toBe(0o600);
});

it('rejects a binding saved for another checkout', async () => {
  const store = await BindingStore.open({ workspace, dataDir });
  const binding = await store.create('codex', sessionId);
  const other = await BindingStore.open({ workspace: root, dataDir });
  await expect(other.get(binding.id)).rejects.toThrow(/workspace/i);
});

it('rejects a binding ID that attempts to traverse out of its directory', async () => {
  const store = await BindingStore.open({ workspace, dataDir });
  await expect(store.get('../private')).rejects.toThrow();
});

it('excludes concurrent Claude runs to a single session across store instances', async () => {
  const store = await BindingStore.open({ workspace, dataDir });
  const second = await BindingStore.open({ workspace, dataDir });
  await store.exclusiveSession(sessionId, async () => {
    await expect(
      second.exclusiveSession(sessionId, async () => 'duplicate')
    ).rejects.toBeInstanceOf(SessionBusyError);
    await expect(second.exclusiveSession(otherSession, async () => 'independent')).resolves.toBe(
      'independent'
    );
  });
  await expect(second.exclusiveSession(sessionId, async () => 'finished')).resolves.toBe(
    'finished'
  );
});
