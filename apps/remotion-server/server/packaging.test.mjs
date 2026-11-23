import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { mkdir, mkdtemp, readFile, writeFile, rm, access } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { expect, it } from 'vitest';

const root = resolve('../..');
const packageTest = it.skipIf(import.meta.env.MODE !== 'packaging');
const docker = (args, options = {}) =>
  execFileSync('docker', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 60000,
    ...options,
  }).trim();

packageTest.each(['root', 'python'])(
  'copies only distributable files from the %s build context',
  async (context) => {
    const temp = await mkdtemp(join(tmpdir(), 'studio-docker-context-')),
      src = join(temp, 'src'),
      copied = join(temp, 'copied');
    const prefix = context === 'root' ? 'apps/processing-engine/' : '';
    const excluded = ['temp', 'temp_videos', 'temp_crop_data', 'uploads', 'output'].map(
      (dir) => prefix + dir + '/private.marker'
    );
    const included = [prefix + 'main.py'];
    if (context === 'root') {
      excluded.push('apps/remotion-server/renders/private.marker');
      included.push(
        'apps/web/app/api/studio/projects/[id]/renders/route.ts',
        'apps/web/app/api/studio/projects/[id]/renders/[jobId]/route.ts'
      );
    }
    try {
      for (const file of [...excluded, ...included]) {
        const destination = join(src, file);
        await mkdir(dirname(destination), { recursive: true });
        const content = included.includes(file)
          ? await readFile(join(root, context === 'root' ? '' : 'apps/processing-engine', file))
          : 'synthetic';
        await writeFile(destination, content);
      }
      await writeFile(
        join(src, '.dockerignore'),
        await readFile(join(root, prefix ? '' : 'apps/processing-engine', '.dockerignore'))
      );
      await writeFile(join(src, 'Dockerfile'), 'FROM scratch\nCOPY . /\n');
      docker(['build', '--output', 'type=local,dest=' + copied, src]);
      const present = async (file) =>
        access(join(copied, file)).then(
          () => true,
          () => false
        );
      for (const file of included) expect(await present(file), file).toBe(true);
      for (const file of excluded) expect(await present(file), file).toBe(false);
    } finally {
      await rm(temp, { recursive: true, force: true });
    }
  }
);

packageTest(
  'marks the standalone renderer healthy using the declared Node probe',
  async () => {
    const { services } = JSON.parse(
      docker([
        'compose',
        '--env-file',
        '/dev/null',
        '-f',
        'docker-compose.yml',
        'config',
        '--format',
        'json',
      ])
    );
    const [mode, executable, ...args] = services['remotion-server'].healthcheck.test;
    expect([mode, executable]).toEqual(['CMD', 'node']);
    const quote = (value) => "'" + value.replaceAll("'", "'\"'\"'") + "'";
    const name = 'studio-health-test-' + randomUUID();
    try {
      docker(
        [
          'run',
          '--rm',
          '--detach',
          '--name',
          name,
          '--network',
          'none',
          '-e',
          'STUDIO_RENDER_SECRET',
          '--health-cmd',
          [executable, ...args].map(quote).join(' '),
          '--health-start-period',
          '8s',
          '--health-interval',
          '1s',
          '--health-timeout',
          '4s',
          '--health-retries',
          '50',
          process.env.STUDIO_TEST_RENDER_IMAGE || 'video-wizard-renderer:local',
        ],
        { env: { ...process.env, STUDIO_RENDER_SECRET: randomUUID() } }
      );
      await expect
        .poll(() => docker(['inspect', '--format', '{{.State.Health.Status}}', name]), {
          interval: 600,
          timeout: 65000,
        })
        .toBe('healthy');
    } finally {
      if (docker(['ps', '--filter', 'name=^/' + name + '$', '--format', '{{.Names}}']) === name)
        docker(['stop', '-t', '2', name]);
    }
  },
  75000
);
