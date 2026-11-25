import { randomUUID } from 'node:crypto';
import { chmod, symlink, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
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

it('recovers the published private credential when identity creation failed at commit', async () => {
  const fixture = await authFixture();
  const storage = await mkdtemp(join(tmpdir(), 'auth-seed-recovery-'));
  vi.stubEnv('STUDIO_DATA_DIR', storage);
  const args = {
    email: 'recovery@example.test',
    name: 'Recovery',
    credentialFile: join(storage, 'bootstrap-user.json'),
  };
  try {
    // Deferral makes the failure occur after the seed transaction's callback has
    // published the real bootstrap file, without a mock transaction or a cleanup hook.
    await fixture.pool.query(`
      CREATE FUNCTION fail_commit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN RAISE EXCEPTION 'fixture deferred commit failure'; END $$;
      CREATE CONSTRAINT TRIGGER fail_commit AFTER INSERT ON auth_accounts
      DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION fail_commit();
    `);
    await expect(seedBaseUser(fixture.db, args)).rejects.toThrow();
    expect((await fixture.pool.query('SELECT id FROM users')).rowCount).toBe(0);
    const saved = await readFile(args.credentialFile, 'utf8');
    await fixture.pool.query('DROP TRIGGER fail_commit ON auth_accounts');
    await expect(
      seedBaseUser(fixture.db, { ...args, email: 'other@example.test' })
    ).rejects.toThrow();
    expect((await fixture.pool.query('SELECT id FROM users')).rowCount).toBe(0);
    await chmod(args.credentialFile, 0o640);
    await expect(seedBaseUser(fixture.db, args)).rejects.toThrow();
    await chmod(args.credentialFile, 0o600);
    const linked = join(storage, 'symlink');
    await symlink(args.credentialFile, linked);
    await expect(seedBaseUser(fixture.db, { ...args, credentialFile: linked })).rejects.toThrow();
    const unrelated = join(storage, 'unrelated');
    const original = JSON.stringify({ email: args.email, password: JSON.parse(saved).password });
    await writeFile(unrelated, original, { mode: 0o600 });
    await expect(
      seedBaseUser(fixture.db, { ...args, credentialFile: unrelated })
    ).rejects.toThrow();
    expect((await readFile(unrelated, 'utf8')) === original).toBe(true);
    const result = await seedBaseUser(fixture.db, args);
    expect(result.created).toBe(true);
    expect((await readFile(args.credentialFile, 'utf8')) === saved).toBe(true);
    const credential = JSON.parse(saved);
    const auth = createAuth(fixture.db, authOptions);
    expect(
      (
        await auth.handler(
          protocol('sign-in/email', { email: args.email, password: credential.password })
        )
      ).ok
    ).toBe(true);
  } finally {
    await fixture.close();
    vi.unstubAllEnvs();
    await rm(storage, { recursive: true, force: true });
  }
}, 30000);
