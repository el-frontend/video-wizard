import { cp, mkdtemp, mkdir, rm, stat, symlink, writeFile, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
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

it('migrates a verified private binding without changing its destination or Claude execution evidence', async () => {
  const old = await BindingStore.open({ workspace, dataDir }),
    binding = await old.createVerifiedClaudeBinding(sessionId);
  await old.recordClaudeOrganizationRejection(binding);
  const migrated = await BindingStore.open({ workspace, dataDir: join(root, 'new') });
  expect(await migrated.migrate(binding.id, dataDir)).toEqual(binding);
  expect(await migrated.migrate(binding.id, dataDir)).toEqual(binding);
  expect(await migrated.getClaudeExecution(binding)).toBe('organization-rejected');
});

it('rejects both directions of overlap through canonical parents, including uncreated descendants', async () => {
  const alias = join(root, 'alias');
  await mkdir(dataDir, { recursive: true, mode: 0o700 });
  await symlink(dataDir, alias);
  try {
    vi.stubEnv('STUDIO_DATA_DIR', join(alias, 'attempts'));
    await expect(BindingStore.open({ workspace, dataDir })).rejects.toThrow(/medios/);
    vi.stubEnv('STUDIO_DATA_DIR', dataDir);
    await expect(BindingStore.open({ workspace, dataDir: join(alias, 'pairs') })).rejects.toThrow(
      /medios/
    );
    await expect(access(join(dataDir, 'pairs'))).rejects.toThrow();
  } finally {
    vi.unstubAllEnvs();
  }
});

it('honors the renderer mount configured only in the web env when running the launcher', async () => {
  const repo = fileURLToPath(new URL('../../../', import.meta.url));
  const app = join(workspace, 'apps/companion');
  const scripts = join(workspace, 'scripts');
  await mkdir(app, { recursive: true });
  await mkdir(scripts);
  await mkdir(join(workspace, 'apps/web'));
  await cp(join(repo, 'scripts/local-studio.mjs'), join(scripts, 'local-studio.mjs'));
  await cp(join(repo, 'apps/companion/src'), join(app, 'src'), { recursive: true });
  await cp(join(repo, 'apps/companion/package.json'), join(app, 'package.json'));
  await symlink(join(repo, 'apps/companion/node_modules'), join(app, 'node_modules'));
  const media = join(root, 'configured media');
  await writeFile(
    join(workspace, 'apps/web/.env.local'),
    'STUDIO_DATA_DIR="' + media + '"\nBETTER_AUTH_SECRET=synthetic-test-only\n'
  );
  const session = join(root, 'session.json');
  await writeFile(session, JSON.stringify({ codexThreadId: sessionId, workspace }), {
    mode: 0o600,
  });
  const invoke = (dir: string) =>
    spawnSync(
      process.execPath,
      [
        join(scripts, 'local-studio.mjs'),
        'companion',
        'bind',
        'codex',
        '--config-dir',
        dir,
        '--session-file',
        session,
      ],
      { env: { PATH: process.env.PATH }, encoding: 'utf8' }
    );
  expect(invoke(join(root, 'allowed')).status).toBe(0);
  expect(invoke(join(media, 'private')).status).toBe(1);
  await expect(access(join(media, 'private', 'bindings'))).rejects.toThrow();
});

it('keeps new private files outside a future mount on case-insensitive volumes', async ({
  skip,
}) => {
  await mkdir(join(root, 'Probe'));
  if (!(await stat(join(root, 'probe')).catch(() => null))) return skip();
  vi.stubEnv('STUDIO_DATA_DIR', join(root, 'Media'));
  try {
    await expect(
      BindingStore.open({ workspace, dataDir: join(root, 'media', 'private') })
    ).rejects.toThrow(/medios/);
  } finally {
    vi.unstubAllEnvs();
  }
});
