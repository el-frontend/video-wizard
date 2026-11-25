import { execFileSync, spawn, type ChildProcess } from 'node:child_process';
import { mkdtemp, mkdir, writeFile, open, copyFile, cp, realpath, stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { AssetService } from '../server/services/studio/asset-service';
import { randomBytes, randomUUID } from 'node:crypto';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as delay } from 'node:timers/promises';
import { hash } from 'bcryptjs';
import { authFixture } from '../server/auth/auth-test-fixture';

async function port() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (!address || typeof address === 'string') throw Error('No fixture port');
  await new Promise<void>((done) => server.close(() => done()));
  return address.port;
}
async function isolatedBuild(root: string, space: string, env: NodeJS.ProcessEnv) {
  const supplied = process.env.STUDIO_E2E_BUILD;
  if (supplied) {
    const path = await realpath(supplied);
    if (path === root || !(await stat(join(path, '.d6-isolated-build'))).isFile())
      throw Error('Expected a dedicated build copy');
    return path;
  }
  const copy = join(space, 'build');
  await mkdir(copy);
  const files = execFileSync('git', ['ls-files', '-co', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  }).split('\0');
  for (const name of files.filter((f) =>
    /^(apps\/web\/|packages\/|pnpm-workspace.yaml$|pnpm-lock.yaml$|package.json$)/.test(f)
  )) {
    const target = join(copy, name);
    await mkdir(dirname(target), { recursive: true });
    await copyFile(join(root, name), target);
  }
  const modules = execFileSync('git', ['ls-files', 'packages/*/package.json'], {
    cwd: root,
    encoding: 'utf8',
  })
    .trim()
    .split('\n')
    .map((path) => join(dirname(path), 'node_modules'));
  for (const name of ['node_modules', 'apps/web/node_modules', ...modules]) {
    if (await stat(join(root, name)).catch(() => null))
      await cp(join(root, name), join(copy, name), { recursive: true, verbatimSymlinks: true });
  }
  execFileSync('pnpm', ['build'], { cwd: join(copy, 'apps/web'), env, stdio: 'inherit' });
  return copy;
}
export default async function setup() {
  const root = resolve('../..'),
    space = await realpath(await mkdtemp(join(tmpdir(), 'vw-d6-e2e-')));
  const fixture = await authFixture(7);
  let child: ChildProcess | undefined,
    containerStarted = false;
  const container = 'vw-d6-' + randomUUID();
  const stop = async () => {
    if (child?.pid && child.exitCode === null && child.signalCode === null) {
      child.kill('SIGTERM');
      await Promise.race([once(child, 'exit'), delay(3000)]);
    }
    if (containerStarted)
      execFileSync('docker', ['stop', '-t', '3', container], { stdio: 'ignore' });
    await fixture.close();
  };
  try {
    const owner = randomUUID(),
      email = owner + '@example.test',
      secret = randomUUID();
    await fixture.pool.query(
      'INSERT INTO users (id,email,name,password_hash) VALUES ($1,$2,$3,$4)',
      [owner, email, 'Cuenta de prueba', await hash(secret, 4)]
    );
    await fixture.apply('0008_better_auth.sql');
    await fixture.apply('0009_studio_imports.sql');
    await fixture.apply('0010_studio_proposals.sql');
    await fixture.apply('0011_studio_requests.sql');
    const [webPort, renderPort] = await Promise.all([port(), port()]);
    const web = 'http://app.video-wizard.localhost:' + webPort,
      preview = 'http://preview.video-wizard.localhost:' + renderPort;
    const data = join(space, 'data');
    await mkdir(data);
    const source = join(space, 'motion');
    await mkdir(join(source, 'videos', 'demo'), { recursive: true });
    await writeFile(
      join(source, 'videos/demo/episode.json'),
      JSON.stringify({
        title: 'Edición técnica',
        scenes: [
          {
            kind: 'intro',
            duration: 3,
            titleLines: ['Primera escena'],
            narration: 'Guion técnico',
          },
        ],
      })
    );
    await writeFile(
      join(source, 'videos/demo/captions.json'),
      JSON.stringify([{ text: 'Subtítulo técnico', start: 0.15, end: 2.8 }])
    );
    const original = join(source, 'out', 'archive.mp4');
    await mkdir(dirname(original));
    await mkdir(join(source, 'videos', 'archive'));
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'color=c=blue:s=320x180:r=24:d=1',
      '-c:v',
      'libx264',
      '-pix_fmt',
      'yuv420p',
      original,
    ]);
    const asset = await new AssetService(fixture.db, data).ingest(owner, {
      stream: createReadStream(original),
      filename: 'clip-tecnico.mp4',
      mediaType: 'video/mp4',
    });
    const job = randomUUID(),
      unproven = randomUUID();
    await fixture.pool.query(
      "INSERT INTO jobs (id,user_id,type,status,input_data,result_data) VALUES ($1,$2,'transcription','completed',$3,$4),($5,$2,'transcription','completed',$6,$7)",
      [
        job,
        owner,
        { sourceAssetId: asset.id },
        {
          sourceAssetId: asset.id,
          sourceDurationMs: asset.durationMs,
          videoDuration: asset.durationMs! / 1000,
          totalSegments: 1,
          language: 'es',
          subtitles: [
            {
              start: 100,
              end: 800,
              text: 'Una prueba',
              words: [
                { word: 'Una', start: 100, end: 350 },
                { word: 'prueba', start: 350, end: 800 },
              ],
            },
          ],
        },
        unproven,
        { videoPath: 'old.mp4' },
        { videoPath: 'old.mp4' },
      ]
    );
    Object.assign(process.env, {
      STUDIO_E2E_JOB: job,
      STUDIO_E2E_UNPROVEN: unproven,
      STUDIO_E2E_ASSET: asset.id,
    });
    const sources = [
      { ownerId: owner, sourceId: 'demo-editor', root: source, slug: 'demo', fps: 30 },
      { ownerId: owner, sourceId: 'archivo-original', root: source, slug: 'archive', fps: 30 },
    ];
    await mkdir(join(source, 'videos', 'repair'));
    await writeFile(
      join(source, 'videos/repair/episode.json'),
      JSON.stringify({
        title: 'Reparar una toma',
        scenes: [
          {
            duration: 2,
            titleLines: ['Escena técnica'],
            audio: 'assets/missing.wav',
            audioOffset: 0.2,
          },
        ],
      })
    );
    await writeFile(join(source, 'videos/repair/captions.json'), '[]');
    sources.push({
      ownerId: owner,
      sourceId: 'toma-pendiente',
      root: source,
      slug: 'repair',
      fps: 30,
    });
    const wav = join(space, 'audio-tecnico.wav');
    execFileSync('ffmpeg', [
      '-hide_banner',
      '-loglevel',
      'error',
      '-f',
      'lavfi',
      '-i',
      'anullsrc=r=8000:cl=mono',
      '-t',
      '1',
      wav,
    ]);
    const audio = await new AssetService(fixture.db, data).ingest(owner, {
      stream: createReadStream(wav),
      filename: 'audio-tecnico.wav',
      mediaType: 'audio/wav',
    });
    process.env.STUDIO_E2E_AUDIO = audio.id;
    if (process.env.STUDIO_DEMO_ROOT)
      sources.push({
        ownerId: owner,
        sourceId: 'demo-registrada',
        root: await realpath(process.env.STUDIO_DEMO_ROOT),
        slug: 'studio-demo-noticias',
        fps: 30,
      });
    const registry = join(space, 'registry.json');
    await writeFile(registry, JSON.stringify(sources), { mode: 0o600 });
    const env = {
      ...process.env,
      DATABASE_URL: fixture.connectionString,
      BETTER_AUTH_URL: web,
      BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
      STUDIO_IMPORT_SOURCES: registry,
      STUDIO_EDITOR_ORIGIN: web,
      STUDIO_PREVIEW_ORIGIN: preview,
      STUDIO_RENDER_SECRET: randomBytes(48).toString('hex'),
      STUDIO_DATA_DIR: data,
      REMOTION_SERVER_URL: 'http://127.0.0.1:' + renderPort,
      PYTHON_ENGINE_INTERNAL_URL: 'http://127.0.0.1:1',
      OPENAI_API_KEY: '',
      NEXT_TELEMETRY_DISABLED: '1',
    };
    const build = await isolatedBuild(root, space, env);
    execFileSync(
      'docker',
      [
        'run',
        '--pull=never',
        '--init',
        '-d',
        '--rm',
        '--name',
        container,
        '--shm-size=1g',
        '-p',
        '127.0.0.1:' + renderPort + ':3001',
        '--mount',
        'type=bind,source=' + data + ',target=/app/.studio-data,readonly',
        '-e',
        'STUDIO_RENDER_SECRET',
        '-e',
        'STUDIO_EDITOR_ORIGIN',
        '-e',
        'STUDIO_PREVIEW_ORIGIN',
        '--workdir',
        '/app/apps/remotion-server',
        process.env.STUDIO_TEST_RENDER_IMAGE || 'video-wizard-renderer:local',
        'pnpm',
        'exec',
        'tsx',
        'server/index.ts',
      ],
      { env, stdio: 'ignore' }
    );
    containerStarted = true;
    const dir = join(build, 'apps/web'),
      log = await open(join(space, 'next.log'), 'wx', 0o600);
    try {
      child = spawn(
        process.execPath,
        ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(webPort)],
        { cwd: dir, env, stdio: ['ignore', log.fd, log.fd] }
      );
    } finally {
      await log.close();
    }
    for (const url of [
      'http://127.0.0.1:' + webPort + '/signin',
      'http://127.0.0.1:' + renderPort + '/health',
    ]) {
      let ok = false;
      for (let i = 0; i < 150 && !ok; i++) {
        ok = await fetch(url, { redirect: 'manual', signal: AbortSignal.timeout(1500) }).then(
          (r) => r.status < 400,
          () => false
        );
        if (!ok) await delay(400);
      }
      if (!ok) throw Error('Fixture did not start. See ' + space);
    }
    Object.assign(process.env, {
      STUDIO_E2E_URL: web,
      STUDIO_E2E_EMAIL: email,
      STUDIO_E2E_PASSWORD: secret,
      STUDIO_E2E_EVIDENCE: space,
    });
    console.info('D6 technical evidence:', space);
    return stop;
  } catch (e) {
    await stop();
    throw e;
  }
}
