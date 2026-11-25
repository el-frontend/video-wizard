import { spawnSync } from 'node:child_process';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readFile, stat, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { expect, it } from 'vitest';

function commands(cwd, project) {
  const env = {
    PATH: process.env.PATH,
    HOME: process.env.HOME,
    COMPOSE_FILE: 'docker-compose.yml:fixture.yml',
    COMPOSE_PROJECT_NAME: project,
  };
  // All container output stays private, including when an underlying dependency fails.
  return function run(program, args, step) {
    const result = spawnSync(program, args, { cwd, env, encoding: 'utf8', timeout: 120000 });
    if (result.status !== 0) throw Error(step + ' failed with status ' + result.status);
    return result.stdout.trim();
  };
}

it.skipIf(import.meta.env.MODE !== 'compose')(
  'runs the image workspace and repeats the seed across a stale dependency-volume upgrade',
  async () => {
    const project = 'studio-install-' + randomUUID();
    const cwd = await mkdtemp(join(tmpdir(), project));
    const image = process.env.STUDIO_TEST_WEB_IMAGE || 'video-wizard-web:local';
    const run = commands(cwd, project);
    const docker = (args, step) => run('docker', args, step);
    const compose = (args, step) => docker(['compose', '--env-file', '.env.docker', ...args], step);
    const task = (service, args, step, options = []) =>
      compose(['run', '--rm', '--no-deps', '-T', ...options, service, ...args], step);
    const root = resolve('../..');
    await copyFile(join(root, 'docker-compose.yml'), join(cwd, 'docker-compose.yml'));
    const password = randomBytes(32).toString('hex');
    const fixture = {
      POSTGRES_USER: 'fixture',
      POSTGRES_PASSWORD: password,
      POSTGRES_DB: 'studio_install_test',
      DATABASE_URL: 'postgresql://fixture:' + password + '@postgres:5432/studio_install_test',
      BETTER_AUTH_URL: 'http://app.video-wizard.localhost:3000',
      STUDIO_EDITOR_ORIGIN: 'http://app.video-wizard.localhost:3000',
      STUDIO_PREVIEW_ORIGIN: 'http://preview.video-wizard.localhost:3001',
      BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
      STUDIO_RENDER_SECRET: randomBytes(48).toString('hex'),
      STUDIO_DATA_DIR: '/app/.studio-data',
    };
    await writeFile(
      join(cwd, '.env.docker'),
      Object.entries(fixture)
        .map(([k, v]) => k + '=' + v)
        .join('\n') + '\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(cwd, 'fixture.yml'),
      'services:\n' +
        ['postgres', 'web', 'worker', 'migrate']
          .map(
            (service) =>
              '  ' +
              service +
              ':\n    container_name: ' +
              project +
              '-' +
              service +
              '\n' +
              (service === 'postgres' ? '' : '    build: !reset null\n    image: ' + image + '\n') +
              '    ports: !reset []\n'
          )
          .join('')
    );
    const seed = () => run('sh', [join(root, 'scripts/compose-seed.sh')], 'operator seed');
    const credential = join(cwd, '.studio/bootstrap-user.json');
    const digest = (bytes) => createHash('sha256').update(bytes).digest('hex');
    const member = () =>
      compose(
        [
          'exec',
          '-T',
          'postgres',
          'psql',
          '-At',
          '-U',
          'fixture',
          '-d',
          'studio_install_test',
          '-c',
          "SELECT u.id, md5(a.password), (SELECT count(*) FROM studio_libraries WHERE owner_id = u.id) FROM users u JOIN auth_accounts a ON a.user_id=u.id WHERE u.email='demo@video-wizard.local'",
        ],
        'seed identity'
      );
    const runtime = () => {
      compose(
        ['up', '-d', '--no-build', '--no-deps', '--force-recreate', 'web', 'worker'],
        'start workspace'
      );
      for (const service of ['web', 'worker']) {
        const mounts = JSON.parse(
          docker(
            ['inspect', '--format', '{{json .Mounts}}', project + '-' + service],
            'inspect mounts'
          )
        );
        expect(mounts.map((m) => m.Destination)).toEqual(['/app/.studio-data']);
        compose(
          [
            'exec',
            '-T',
            service,
            'node',
            '--input-type=module',
            '-e',
            "import 'better-auth'; import '@better-auth/drizzle-adapter'; const {createRequire}=await import('node:module'); const r=createRequire('/app/packages/service-auth/package.json'); r.resolve('jose');r.resolve('zod')",
          ],
          'resolve ' + service + ' dependencies'
        );
      }
      compose(
        [
          'exec',
          '-T',
          'web',
          'node',
          '--input-type=module',
          '-e',
          `
        import http from 'node:http';
        import { setTimeout as delay } from 'node:timers/promises';
        let status = 0;
        for (let attempt = 0; attempt < 30; attempt++) {
          status = await new Promise(resolve => http.get({ hostname: '127.0.0.1', port: 3000, path: '/signin',
            headers: { host: 'app.video-wizard.localhost:3000' } }, res => {
              res.resume(); resolve(res.statusCode);
          }).on('error', () => resolve(0)));
          if (status === 200) break;
          await delay(500);
        }
        if (status !== 200) process.exit(status ? 2 : 3);
      `,
        ],
        'serve sign-in from image'
      );
    };
    try {
      compose(['up', '-d', '--no-build', '--wait', 'postgres'], 'start isolated PostgreSQL');
      task('migrate', ['sh', '-ec', 'pnpm auth:preflight && pnpm db:migrate'], 'migrations');
      seed();
      const initial = member();
      expect(initial.split('|')[2] > 0).toBe(true);
      const first = digest(await readFile(credential));
      const meta = await stat(credential);
      expect(meta.mode & 0o777).toBe(0o600);
      expect(meta.uid).toBe(process.getuid());
      runtime();
      const obsolete = [
        'web_node_modules',
        'web_app_node_modules',
        'web_next_cache',
        'worker_node_modules',
        'worker_app_node_modules',
      ];
      for (const volume of obsolete) {
        const name = project + '_' + volume;
        docker(['volume', 'create', name], 'create obsolete volume');
        docker(
          [
            'run',
            '--rm',
            '--network',
            'none',
            '-v',
            name + ':/old',
            image,
            'touch',
            '/old/obsolete-tree',
          ],
          'populate obsolete volume'
        );
      }
      runtime();
      seed();
      expect(member() === initial).toBe(true);
      expect(digest(await readFile(credential)) === first).toBe(true);
      // A Linux named volume exercises actual container UID and mode semantics on Docker Desktop.
      const linuxVolume = project + '_bootstrap';
      const mount = ['-v', linuxVolume + ':/app/.studio'];
      task(
        'web',
        ['sh', '-ec', 'chmod 700 /app/.studio && chown 11441:11441 /app/.studio'],
        'private Linux directory',
        mount
      );
      const linuxSeed = () =>
        task('web', ['sh', 'scripts/compose-seed.sh', '11441', '11441'], 'Linux seed', [
          ...mount,
          '-e',
          'SEED_USER_EMAIL=operator@example.test',
        ]);
      const operator = () =>
        task(
          'web',
          [
            'sh',
            '-ec',
            'f=/app/.studio/bootstrap-user.json; test "$(stat -c %u:%g:%a "$f")" = 11441:11441:600 && sha256sum "$f"',
          ],
          'Linux operator read',
          [...mount, '--user', '11441:11441']
        );
      linuxSeed();
      const original = operator();
      linuxSeed();
      expect(operator() === original).toBe(true);
    } finally {
      compose(['down'], 'stop isolated services');
    }
  },
  300000
);

it.skipIf(import.meta.env.MODE !== 'compose-python')(
  'waits until the standalone Python image is healthy under its own Compose manifest',
  async () => {
    const project = 'studio-health-' + randomUUID();
    const cwd = await mkdtemp(join(tmpdir(), project));
    const run = commands(cwd, project);
    const image = process.env.STUDIO_TEST_PYTHON_IMAGE || 'video-wizard-processing:local';
    await copyFile(
      resolve('../processing-engine/docker-compose.yml'),
      join(cwd, 'docker-compose.yml')
    );
    await writeFile(
      join(cwd, '.env'),
      'STUDIO_RENDER_SECRET=' + randomBytes(48).toString('hex') + '\nUSE_OPENAI_API=false\n',
      { mode: 0o600 }
    );
    await writeFile(
      join(cwd, 'fixture.yml'),
      [
        'services:',
        '  processing-engine:',
        '    build: !reset null',
        '    image: ' + image,
        '    container_name: ' + project,
        '    ports: !reset []',
      ].join('\n') + '\n'
    );
    const compose = (args) => run('docker', ['compose', ...args], 'standalone processor');
    try {
      compose(['up', '-d', '--no-build', '--wait', '--wait-timeout', '90']);
      expect(
        run(
          'docker',
          ['inspect', '--format', '{{.State.Health.Status}}', project],
          'inspect effective health'
        )
      ).toBe('healthy');
    } finally {
      compose(['down']);
    }
  },
  140000
);
