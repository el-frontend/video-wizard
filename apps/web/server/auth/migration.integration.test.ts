import { randomUUID } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { hash } from 'bcryptjs';
import { afterEach, beforeEach, expect, it } from 'vitest';

import { createAuth } from './config';
import { authFixture, authOptions, protocol, responseCookie } from './auth-test-fixture';
import { migrationPreflight } from './migration-preflight';

let fixture: Awaited<ReturnType<typeof authFixture>>;
beforeEach(async () => {
  fixture = await authFixture(7);
});
afterEach(async () => {
  await fixture?.close();
});
const upgrade = () => fixture.apply('0008_better_auth.sql');

it('upgrades0007WithoutChangingOwnership', async () => {
  const id = randomUUID();
  const passwordHash = await hash(randomUUID(), 4);
  await fixture.pool.query(
    'INSERT INTO users(id,email,password_hash,email_verified) VALUES ($1,$2,$3,now())',
    [id, ' \tOWNER@EXAMPLE.TEST\n ', passwordHash]
  );
  const longEmail = 'a'.repeat(60) + '@' + ('b'.repeat(52) + '.').repeat(4) + 'test';
  await fixture.pool.query('INSERT INTO users(email) VALUES ($1)', [longEmail]);
  const [project, revision] = [randomUUID(), randomUUID()];
  await fixture.pool.query(
    "INSERT INTO studio_projects(id,owner_id,revision,engine) VALUES ($1,$2,$3,'remotion')",
    [project, id, revision]
  );
  await fixture.pool.query(
    'INSERT INTO accounts("userId",type,provider,"providerAccountId") VALUES ($1,\'oauth\',\'example\',$2)',
    [id, id]
  );
  expect(await migrationPreflight(fixture.db)).toMatchObject({
    users: 2,
    legacyAccounts: 1,
    collisions: 0,
  });
  await upgrade();
  const identity = (await fixture.pool.query('SELECT * FROM users WHERE id=$1', [id])).rows[0];
  expect(identity.email).toBe('owner@example.test');
  expect(identity.name).toBe(identity.email);
  expect(identity.is_email_verified).toBe(true);
  expect(identity.password_hash === passwordHash).toBe(true);
  expect(
    (await fixture.pool.query('SELECT name FROM users WHERE email=$1', [longEmail])).rows[0].name
  ).toBe(longEmail);
  const accounts = (await fixture.pool.query('SELECT * FROM auth_accounts')).rows;
  expect(accounts).toHaveLength(1);
  expect(accounts[0].user_id).toBe(id);
  expect(accounts[0].provider_id).toBe('credential');
  expect(accounts[0].password === passwordHash).toBe(true);
  const current = await hash(randomUUID(), 4);
  await fixture.pool.query('UPDATE auth_accounts SET password=$1', [current]);
  const migration = await readFile(
    new URL('../db/migrations/0008_better_auth.sql', import.meta.url),
    'utf8'
  );
  const credentialBackfill = migration
    .split('--> statement-breakpoint')
    .find((sql) => sql.trimStart().startsWith('INSERT INTO auth_accounts'));
  if (!credentialBackfill) throw new Error('Missing credential backfill');
  await fixture.pool.query(credentialBackfill);
  expect(
    (await fixture.pool.query('SELECT password FROM auth_accounts')).rows.map(
      (r) => r.password === current
    )
  ).toEqual([true]);
  expect(
    (await fixture.pool.query('SELECT owner_id FROM studio_projects WHERE id=$1', [project]))
      .rows[0].owner_id
  ).toBe(id);
  expect((await fixture.pool.query('SELECT count(*)::int AS n FROM accounts')).rows[0].n).toBe(1);
});

it('preflights a fresh empty database', async () => {
  const empty = await authFixture(-1);
  try {
    expect(await migrationPreflight(empty.db)).toEqual({
      users: 0,
      legacyAccounts: 0,
      legacySessions: 0,
      legacyVerifications: 0,
      collisions: 0,
    });
  } finally {
    await empty.close();
  }
});

it('normalizationCollisionAbortsAtomically', async () => {
  await fixture.pool.query("INSERT INTO users(email) VALUES ('X@example.test'),('x@example.test')");
  expect(await migrationPreflight(fixture.db)).toMatchObject({ collisions: 1 });
  await expect(upgrade()).rejects.toThrow(/collision/i);
  expect(
    (await fixture.pool.query('SELECT email FROM users ORDER BY email COLLATE "C"')).rows.map(
      (r) => r.email
    )
  ).toEqual(['X@example.test', 'x@example.test']);
  expect(
    (await fixture.pool.query("SELECT to_regclass('auth_accounts') AS rel")).rows[0].rel
  ).toBeNull();
});

it('migratesBcryptUnicodeAndLongPasswords', async () => {
  const password = 'ﬁ' + 'x'.repeat(150);
  const email = 'legacy@example.test';
  const legacy = await hash(password, 4);
  await fixture.pool.query('INSERT INTO users(email,password_hash) VALUES($1,$2)', [email, legacy]);
  await upgrade();
  const auth = createAuth(fixture.db, authOptions);
  const login = (secret: string) =>
    auth.handler(protocol('sign-in/email', { email, password: secret }));
  const [valid, refused] = await Promise.all([
    login(password),
    auth.handler(
      protocol('sign-up/email', {
        email: 'long@example.test',
        name: 'Long',
        password,
      })
    ),
  ]);
  expect(valid.status).toBe(200);
  const userData = (await valid.clone().json()).user;
  expect(Object.hasOwn(userData, 'passwordHash')).toBe(false);
  expect(Object.hasOwn(userData, 'legacyEmailVerified')).toBe(false);
  expect(refused.status).toBe(400);
  const change = await auth.handler(
    protocol(
      'change-password',
      { currentPassword: password, newPassword: password + 'more' },
      responseCookie(valid)
    )
  );
  expect(change.status).toBe(400);
  expect((await login(password.normalize('NFKC'))).status).toBe(401);
  expect(
    (await fixture.pool.query('SELECT password FROM auth_accounts')).rows[0].password === legacy
  ).toBe(true);
});
