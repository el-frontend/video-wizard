import { randomUUID } from 'node:crypto';
import { mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';

import { authFixture, authOptions, protocol } from './auth-test-fixture';
import { createAuth } from './config';
import { seedBaseUser } from './seed-user';

it('seedTwicePreservesCredentialAndCatalog', async () => {
  const fixture = await authFixture();
  const storage = await mkdtemp(join(tmpdir(), 'auth-seed-'));
  vi.stubEnv('STUDIO_DATA_DIR', storage);
  const log = vi.spyOn(console, 'log').mockImplementation(() => {});
  const credentialFile = join(storage, 'private', 'bootstrap-user.json');
  const email = 'owner@example.test';
  const args = { email, name: 'Seed user', credentialFile };
  try {
    const first = await seedBaseUser(fixture.db, args);
    expect(Object.keys(first).sort()).toEqual(['created', 'credentialFile', 'userId']);
    expect(first.created).toBe(true);
    expect((await stat(credentialFile)).mode & 0o777).toBe(0o600);
    const saved = await readFile(credentialFile, 'utf8');
    const credentials = JSON.parse(saved);
    expect(credentials.email).toBe(email);
    expect(JSON.stringify(log.mock.calls).includes(credentials.password)).toBe(false);
    const count = async () =>
      (
        await fixture.pool.query(
          'SELECT count(*)::int AS n FROM studio_libraries WHERE owner_id=$1',
          [first.userId]
        )
      ).rows[0].n;
    const before = await count();
    expect(before).toBeGreaterThan(0);
    const second = await seedBaseUser(fixture.db, {
      ...args,
      password: randomUUID(),
      name: 'Other',
    });
    expect(second).toEqual({ created: false, userId: first.userId });
    expect((await readFile(credentialFile, 'utf8')) === saved).toBe(true);
    expect(await count()).toBe(before);
    const auth = createAuth(fixture.db, authOptions);
    const response = await auth.handler(protocol('sign-in/email', credentials));
    expect(response.status).toBe(200);
    expect((await response.json()).user.name).toBe(args.name);
    const blocked = join(storage, 'blocked');
    await writeFile(blocked, 'file');
    await expect(
      seedBaseUser(fixture.db, {
        ...args,
        email: 'new@example.test',
        credentialFile: join(blocked, 'password'),
      })
    ).rejects.toThrow();
    expect(
      (await fixture.pool.query("SELECT id FROM users WHERE email='new@example.test'")).rowCount
    ).toBe(0);
    vi.stubEnv('STUDIO_DATA_DIR', blocked);
    const retrySeed = { ...args, email: 'retry@example.test', password: randomUUID() };
    await expect(seedBaseUser(fixture.db, retrySeed)).rejects.toThrow();
    vi.stubEnv('STUDIO_DATA_DIR', storage);
    const recovered = await seedBaseUser(fixture.db, { ...retrySeed, password: randomUUID() });
    expect(recovered.created).toBe(false);
    expect((await auth.handler(protocol('sign-in/email', retrySeed))).ok).toBe(true);
  } finally {
    await fixture.close();
    log.mockRestore();
    vi.unstubAllEnvs();
    await rm(storage, { recursive: true, force: true });
  }
}, 30000);
