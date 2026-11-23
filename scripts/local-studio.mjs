import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEnv } from 'node:util';

const root = fileURLToPath(new URL('../', import.meta.url));
const web = join(root, 'apps/web');
const python = join(root, 'apps/processing-engine');
const envFile = (path) => parseEnv(readFileSync(path, 'utf8'));
const privateEnv = join(root, '.env.studio-auth');
const command = process.argv[2];
process.umask(0o077);

function run(program, args, env, cwd = root, capture = false) {
  const result = spawnSync(program, args, {
    cwd,
    env,
    encoding: 'utf8',
    stdio: capture ? ['ignore', 'pipe', 'ignore'] : 'inherit',
  });
  if (result.status !== 0)
    throw new Error(program + ' failed. Check the installation and configuration.');
  return result.stdout;
}

function service(program, args, env, cwd = root) {
  const child = spawn(program, args, { env, cwd, stdio: 'inherit' });
  for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
  child.once('exit', (code, signal) => process.exit(code ?? (signal ? 1 : 0)));
}

async function main() {
  if (command === 'smoke') {
    const { checkLocalStudio } = await import('./local-studio-smoke.mjs');
    return checkLocalStudio(root);
  }
  const render = envFile(join(root, '.env.studio-render'));
  const webEnv = envFile(join(web, '.env.local'));
  const target = new URL(webEnv.DATABASE_URL);
  assert.ok(
    ['localhost', '127.0.0.1'].includes(target.hostname) &&
      target.port === '5447' &&
      target.pathname === '/studio' &&
      !target.search &&
      ['postgres:', 'postgresql:'].includes(target.protocol),
    'Expected the local studio installation on localhost:5447/studio.'
  );
  assert.ok(
    Buffer.byteLength(render.STUDIO_RENDER_SECRET ?? '') >= 32,
    'Missing private service secret.'
  );
  if (command === 'prepare' && !existsSync(privateEnv)) {
    const secret = webEnv.BETTER_AUTH_SECRET || randomBytes(48).toString('base64url');
    assert.ok(
      Buffer.byteLength(secret) >= 32 && secret !== render.STUDIO_RENDER_SECRET,
      'Invalid Better Auth secret.'
    );
    // Only generated or already configured secret material is written to this private overlay.
    if (webEnv.BETTER_AUTH_SECRET) {
      writeFileSync(privateEnv, '# BETTER_AUTH_SECRET is configured in apps/web/.env.local\n', {
        mode: 0o600,
        flag: 'wx',
      });
    } else {
      writeFileSync(privateEnv, 'BETTER_AUTH_SECRET=' + secret + '\n', { mode: 0o600, flag: 'wx' });
    }
  }
  assert.equal(statSync(privateEnv).mode & 0o777, 0o600, 'Expected mode 0600 on .env.studio-auth.');
  const data = webEnv.STUDIO_DATA_DIR || join(root, '.studio-data');
  assert.ok(data.startsWith('/'), 'STUDIO_DATA_DIR must be absolute.');
  const env = {
    ...process.env,
    ...webEnv,
    BETTER_AUTH_SECRET: envFile(privateEnv).BETTER_AUTH_SECRET ?? webEnv.BETTER_AUTH_SECRET,
    STUDIO_RENDER_SECRET: render.STUDIO_RENDER_SECRET,
    STUDIO_DATA_DIR: data,
    BETTER_AUTH_URL: 'http://app.video-wizard.localhost:3000',
    STUDIO_EDITOR_ORIGIN: 'http://app.video-wizard.localhost:3000',
    STUDIO_PREVIEW_ORIGIN: 'http://preview.video-wizard.localhost:3001',
    REMOTION_SERVER_URL: 'http://127.0.0.1:3001',
    PYTHON_ENGINE_INTERNAL_URL: 'http://127.0.0.1:8000',
  };
  assert.ok(
    Buffer.byteLength(env.BETTER_AUTH_SECRET ?? '') >= 32 &&
      env.BETTER_AUTH_SECRET !== env.STUDIO_RENDER_SECRET,
    'Invalid Better Auth secret.'
  );
  if (command === 'prepare') return console.info('Private local configuration ready:', privateEnv);

  if (command === 'migrate') {
    const { Client } = createRequire(join(web, 'package.json'))('pg');
    const db = new Client({ connectionString: webEnv.DATABASE_URL });
    await db.connect();
    try {
      assert.equal((await db.query('SELECT current_database() AS name')).rows[0].name, 'studio');
      run('pnpm', ['--filter', 'web', 'auth:preflight'], env);
      const directory = join(root, '.studio/backups');
      mkdirSync(directory, { recursive: true, mode: 0o700 });
      const backup = join(
        directory,
        'studio-' + new Date().toISOString().replaceAll(':', '-') + '-' + randomUUID() + '.dump'
      );
      const pg = {
        PATH: process.env.PATH,
        PGHOST: target.hostname,
        PGPORT: target.port,
        PGDATABASE: 'studio',
        PGUSER: decodeURIComponent(target.username),
        PGPASSWORD: decodeURIComponent(target.password),
      };
      run('pg_dump', ['--no-password', '--format=custom', '--file', backup], pg, root, true);
      assert.ok(statSync(backup).size > 0 && (statSync(backup).mode & 0o777) === 0o600);
      const contents = run('pg_restore', ['--list', backup], pg, root, true);
      assert.ok(contents.includes('Format: CUSTOM') && contents.includes('dbname: studio'));
      console.info('Verified database backup:', backup);
      // Compare ownership pairs and legacy credentials in memory, without printing rows.
      // A fresh database has no prior rows; older installations may lack Studio tables.
      const protectedTables = [
        ['users', 'id', 'password_hash'],
        ['jobs', 'id', 'user_id'],
        ['studio_projects', 'id', 'owner_id'],
        ['studio_project_revisions', 'revision,project_id', 'author_id'],
        ['studio_assets', 'id', 'owner_id'],
        ['studio_libraries', 'id,version', 'owner_id'],
      ];
      const fingerprints = async (tables) => {
        const values = [];
        for (const [table, identifiers, association] of tables) {
          const result = await db.query(
            `SELECT md5(string_agg(row(${identifiers},${association})::text, ',' ORDER BY ${identifiers},${association})) AS digest FROM ${table}`
          );
          values.push(result.rows[0].digest);
        }
        return values;
      };
      const present = [];
      for (const spec of protectedTables) {
        if ((await db.query('SELECT to_regclass($1) AS name', [spec[0]])).rows[0].name)
          present.push(spec);
      }
      const before = await fingerprints(present);
      run('pnpm', ['--filter', 'web', 'db:migrate'], env);
      assert.ok(
        JSON.stringify(before) === JSON.stringify(await fingerprints(present)),
        'Migration changed stored identity or ownership.'
      );
      console.info('Verified existing identity and ownership after migration.');
      // A second explicit seed must preserve the actual identity, hash and catalog.
      const email = (env.SEED_USER_EMAIL || 'demo@video-wizard.local').trim().toLowerCase();
      const seedState = async () =>
        (
          await db.query(
            `SELECT u.id, u.name, a.password,
        (SELECT count(*) FROM studio_assets WHERE owner_id=u.id) AS assets,
        (SELECT count(*) FROM studio_libraries WHERE owner_id=u.id) AS library
        FROM users u LEFT JOIN auth_accounts a ON a.user_id=u.id AND a.provider_id='credential'
        WHERE u.email=$1`,
            [email]
          )
        ).rows;
      run('pnpm', ['--filter', 'web', 'auth:seed'], env);
      const first = await seedState();
      assert.ok(first.length === 1 && Number(first[0].library) > 0);
      run('pnpm', ['--filter', 'web', 'auth:seed'], env);
      assert.ok(
        JSON.stringify(first) === JSON.stringify(await seedState()),
        'The seed changed the identity or catalog.'
      );
      console.info('Verified repeated seed.');
    } finally {
      await db.end();
    }
    return;
  }
  if (command === 'build') return service('pnpm', ['--filter', 'web', 'build'], env);
  if (command === 'web')
    return service(
      'pnpm',
      ['exec', 'next', 'start', '--hostname', '127.0.0.1', '--port', '3000'],
      env,
      web
    );
  if (command === 'worker') return service('pnpm', ['--filter', 'web', 'worker'], env);
  if (command === 'python')
    return service(
      '.venv/bin/python',
      ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', '8000'],
      {
        ...process.env,
        ...envFile(join(python, '.env.local')),
        STUDIO_RENDER_SECRET: env.STUDIO_RENDER_SECRET,
      },
      python
    );
  if (command === 'renderer') {
    assert.ok(existsSync(data), 'Studio storage must exist.');
    const outputs = join(root, 'apps/remotion-server/renders');
    mkdirSync(outputs, { recursive: true });
    return service(
      'docker',
      [
        'run',
        '--detach',
        '--name',
        'video-wizard-studio-renderer',
        '--restart',
        'unless-stopped',
        '--shm-size=2g',
        '--publish',
        '127.0.0.1:3001:3001',
        '--mount',
        'type=bind,source=' + data + ',target=/app/.studio-data,readonly',
        '--mount',
        'type=bind,source=' + outputs + ',target=/app/apps/remotion-server/renders',
        '-e',
        'STUDIO_RENDER_SECRET',
        '-e',
        'STUDIO_EDITOR_ORIGIN',
        '-e',
        'STUDIO_PREVIEW_ORIGIN',
        '-e',
        'RENDER_CONCURRENCY=2',
        process.argv[3] || 'video-wizard-renderer:local',
      ],
      env
    );
  }
  throw new Error('Expected prepare, migrate, build, web, worker, python, renderer or smoke.');
}
main().catch((error) => {
  // A rejected connection may include the original connection string in a driver error.
  console.error(
    error instanceof assert.AssertionError ? error.message : 'Studio command failed: ' + command
  );
  process.exitCode = 1;
});
