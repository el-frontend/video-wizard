// Isolated, opt-in local acceptance. All credentials, media and browser evidence stay in the fixture.
import assert from 'node:assert/strict';
import { execFileSync, spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import {
  mkdirSync,
  mkdtempSync,
  copyFileSync,
  readFileSync,
  writeFileSync,
  existsSync,
  openSync,
  closeSync,
  readdirSync,
  realpathSync,
  statSync,
} from 'node:fs';
import { dirname, join, resolve, basename } from 'node:path';
import { createServer } from 'node:net';
import { once } from 'node:events';
import { setTimeout as wait } from 'node:timers/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url)),
  web = join(root, 'apps/web'),
  require = createRequire(join(web, 'package.json'));
const [command, directory, ...args] = process.argv.slice(2);
process.umask(0o077);
const common = Object.fromEntries(
  ['HOME', 'PATH', 'LANG', 'TMPDIR', 'USER', 'SHELL'].flatMap((k) =>
    process.env[k] ? [[k, process.env[k]]] : []
  )
);
function save(path, data) {
  writeFileSync(path, JSON.stringify(data, null, 2), { mode: 0o600 });
}
async function port() {
  const s = createServer().listen(0, '127.0.0.1');
  await once(s, 'listening');
  const p = s.address().port;
  await new Promise((ok) => s.close(ok));
  return p;
}
function run(bin, argv, env = common, cwd = root) {
  return execFileSync(bin, argv, { env, cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
}
function isolatedCopy(space) {
  const copy = join(space, 'checkout');
  mkdirSync(copy);
  const names = run('git', ['ls-files', '-co', '--exclude-standard', '-z'])
    .split('\0')
    .filter((s) =>
      /^(apps\/(web|companion|remotion-server|hyperframes-worker)\/|packages\/|scripts\/local-studio\.mjs$|pnpm-workspace.yaml$|pnpm-lock.yaml$|package.json$)/.test(
        s
      )
    );
  for (const n of names) {
    const dest = join(copy, n);
    mkdirSync(dirname(dest), { recursive: true });
    copyFileSync(join(root, n), dest);
  }
  const modules = ['', ...names.filter((s) => s.endsWith('/package.json')).map(dirname)];
  for (const p of new Set(modules)) {
    const from = join(root, p, 'node_modules');
    if (existsSync(from)) run('cp', ['-cR', from, join(copy, p, 'node_modules')]);
  }
  return copy;
}
async function start() {
  const space = mkdtempSync('/private/tmp/vw-r4-'),
    copy = isolatedCopy(space),
    data = join(space, 'media');
  mkdirSync(data);
  mkdirSync(join(space, 'companion'));
  const [pgPort, webPort, renderPort] = await Promise.all([port(), port(), port()]);
  const pg = 'vw-r4-pg-' + randomUUID().slice(0, 8),
    renderer = 'vw-r4-render-' + randomUUID().slice(0, 8);
  const password = randomBytes(24).toString('hex'),
    dbName = 'r4_acceptance_test',
    origin = 'http://app.video-wizard.localhost:' + webPort,
    preview = 'http://preview.video-wizard.localhost:' + renderPort;
  const connection = 'postgres://postgres:' + password + '@127.0.0.1:' + pgPort + '/' + dbName;
  const renderEnv = {
    ...common,
    STUDIO_RENDER_SECRET: randomBytes(48).toString('hex'),
    STUDIO_EDITOR_ORIGIN: origin,
    STUDIO_PREVIEW_ORIGIN: preview,
  };
  const webEnv = {
    ...renderEnv,
    DATABASE_URL: connection,
    BETTER_AUTH_URL: origin,
    BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
    STUDIO_DATA_DIR: data,
    REMOTION_SERVER_URL: 'http://127.0.0.1:' + renderPort,
    PYTHON_ENGINE_INTERNAL_URL: 'http://127.0.0.1:1',
    NEXT_TELEMETRY_DISABLED: '1',
    OPENAI_API_KEY: '',
  };
  const fixture = {
    space,
    pg,
    renderer,
    origin,
    webPort,
    renderPort,
    email: randomUUID() + '@example.test',
    password: randomBytes(20).toString('hex'),
  };
  save(join(space, 'fixture.json'), fixture);
  console.info('Private R4 fixture:', space);
  run(
    'docker',
    [
      'run',
      '--pull=never',
      '-d',
      '--name',
      pg,
      '-p',
      '127.0.0.1:' + pgPort + ':5432',
      '-e',
      'POSTGRES_PASSWORD',
      '-e',
      'POSTGRES_DB',
      'postgres:16-alpine',
    ],
    { ...common, POSTGRES_PASSWORD: password, POSTGRES_DB: dbName }
  );
  const { Client } = require('pg');
  let client;
  for (let n = 0; n < 100; n++) {
    client = new Client({ connectionString: connection });
    try {
      await client.connect();
      break;
    } catch {
      await client.end().catch(() => {});
      await wait(200);
    }
  }
  try {
    assert.equal((await client.query('select current_database() db')).rows[0].db, dbName);
    const migrations = join(copy, 'apps/web/server/db/migrations');
    for (const f of readdirSync(migrations)
      .filter((f) => /^\d.*\.sql$/.test(f))
      .sort())
      await client.query(readFileSync(join(migrations, f), 'utf8'));
  } finally {
    await client.end();
  }
  const mounts = [
    'apps/remotion-server/server',
    'apps/remotion-server/package.json',
    'apps/hyperframes-worker/src',
    'apps/hyperframes-worker/package.json',
    ...readdirSync(join(copy, 'packages')).flatMap((p) =>
      ['src', 'package.json'].map((n) => 'packages/' + p + '/' + n)
    ),
  ]
    .filter((p) => existsSync(join(copy, p)))
    .flatMap((p) => [
      '--mount',
      'type=bind,source=' + join(copy, p) + ',target=/app/' + p + ',readonly',
    ]);
  run(
    'docker',
    [
      'run',
      '--pull=never',
      '-d',
      '--name',
      renderer,
      '--init',
      '--shm-size=1g',
      '-p',
      '127.0.0.1:' + renderPort + ':3001',
      '--mount',
      'type=bind,source=' + data + ',target=/app/.studio-data,readonly',
      ...mounts,
      '-e',
      'STUDIO_RENDER_SECRET',
      '-e',
      'STUDIO_EDITOR_ORIGIN',
      '-e',
      'STUDIO_PREVIEW_ORIGIN',
      '-e',
      'REMOTION_SERVE_URL=http://127.0.0.1:1',
      '--workdir',
      '/app/apps/remotion-server',
      'video-wizard-r2-review:local',
      'node',
      '--import',
      'tsx',
      'server/index.ts',
    ],
    renderEnv
  );
  const webCopy = join(copy, 'apps/web'),
    log = openSync(join(space, 'next.log'), 'a', 0o600);
  try {
    execFileSync('pnpm', ['build'], { cwd: webCopy, env: webEnv, stdio: ['ignore', log, log] });
    const child = spawn(
      process.execPath,
      ['node_modules/next/dist/bin/next', 'start', '-H', '127.0.0.1', '-p', String(webPort)],
      { cwd: webCopy, env: webEnv, detached: true, stdio: ['ignore', log, log] }
    );
    child.unref();
    fixture.pid = child.pid;
    save(join(space, 'fixture.json'), fixture);
  } finally {
    closeSync(log);
  }
  for (const target of [
    'http://127.0.0.1:' + webPort + '/signin',
    'http://127.0.0.1:' + renderPort + '/health',
  ]) {
    let ready = false;
    for (let n = 0; n < 150 && !ready; n++) {
      ready = await fetch(target, { redirect: 'manual' }).then(
        (r) => r.status < 400,
        () => false
      );
      if (!ready) await wait(200);
    }
    assert.ok(ready, 'Revisa el registro privado ' + space);
  }
  await browserAction(fixture, 'seed', []);
  console.info('Ready:', origin, 'Evidence:', space);
}
async function browserAction(f, action, argv) {
  const { chromium } = require('@playwright/test'),
    browser = await chromium.launch({
      headless: true,
      executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    });
  try {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    await page.goto(f.origin + '/signin');
    const api = (path, body, method = body ? 'POST' : 'GET') =>
      page.evaluate(
        async ({ path, body, method }) => {
          const r = await fetch(path, {
            method,
            headers: { 'Content-Type': 'application/json' },
            body: body ? JSON.stringify(body) : undefined,
          });
          if (!r.ok) throw Error('HTTP ' + r.status + ' ' + path);
          const value = await r.json();
          return value.data ?? value;
        },
        { path, body, method }
      );
    await api('/api/auth/' + (action === 'seed' ? 'sign-up/email' : 'sign-in/email'), {
      email: f.email,
      password: f.password,
      ...(action === 'seed' && { name: 'Pruebas de conversación' }),
    });
    if (action === 'seed') {
      const p = await api('/api/studio/projects', {
        title: 'Edición técnica R4',
        engine: 'remotion',
        canvas: { width: 640, height: 360, fps: 25 },
      });
      const wav = join(f.space, 'base-tecnica.wav');
      run('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=16000:cl=mono',
        '-t',
        '1',
        wav,
      ]);
      const asset = await page.evaluate(async (b) => {
        const r = await fetch('/api/studio/assets', {
          method: 'POST',
          headers: { 'Content-Type': 'audio/wav', 'X-Studio-Filename': 'base-tecnica.wav' },
          body: Uint8Array.from(atob(b), (c) => c.charCodeAt(0)),
        });
        if (!r.ok) throw Error('Asset ' + r.status);
        return (await r.json()).data;
      }, readFileSync(wav).toString('base64'));
      const common = { visible: true, startMs: 0, endMs: 8000, endAnchor: 'fixed', zIndex: 1 },
        box = { x: 30, y: 40, width: 550, height: 180 };
      const doc = {
        ...p.document,
        durationMs: 8000,
        assetIds: [asset.id],
        scenes: [
          {
            id: 'escena',
            durationMs: 8000,
            editorial: {
              headline: 'Titular técnico',
              narration: 'Esto es una prueba. Inteligencia artificial al día.',
            },
            layers: [
              { ...common, id: 'titular', type: 'text', text: 'Titular técnico', box },
              {
                ...common,
                id: 'voz',
                type: 'audio',
                endMs: 1000,
                assetId: asset.id,
                sourceInMs: 0,
                volume: 1,
              },
              {
                ...common,
                id: 'subtitulos',
                type: 'captions',
                box: { ...box, y: 240, height: 90 },
                cues: [],
                sourceAudioLayerId: 'voz',
              },
            ],
          },
        ],
      };
      await api(
        '/api/studio/projects/' + doc.id,
        { baseRevision: p.revision, document: doc },
        'PUT'
      );
      f.projectId = doc.id;
      save(join(f.space, 'fixture.json'), f);
      return;
    }
    const sourceProject = ['review', 'reuse'].includes(action) && argv[1] ? argv[1] : f.projectId;
    assert.match(sourceProject, /^[a-f0-9-]{36}$/);
    const path = '/api/studio/projects/' + sourceProject;
    if (action === 'controlled') {
      const base = await api(path),
        clone = await api(path + '/duplicate', { baseRevision: base.revision });
      const id = clone.document.id;
      const dir = join(f.space, 'controlled');
      mkdirSync(dir, { recursive: true, mode: 0o700 });
      const cli = (args) =>
        run(process.execPath, [
          join(root, 'scripts/local-studio.mjs'),
          'companion',
          ...args,
          '--config-dir',
          dir,
        ]);
      save(join(dir, 'binding.json'), {
        workspace: realpathSync(root),
        codexThreadId: randomUUID(),
      });
      const { bindingId } = JSON.parse(
        cli(['bind', 'codex', '--session-file', join(dir, 'binding.json')])
      );
      save(join(dir, 'pairing.json'), await api('/api/studio/projects/' + id + '/pairing', {}));
      cli([
        'pair',
        '--origin',
        f.origin,
        '--binding-id',
        bindingId,
        '--file',
        join(dir, 'pairing.json'),
      ]);
      await page.goto(f.origin + '/designer/' + id);
      const panel = page.locator('details.assistant-panel');
      await panel.locator('summary').first().click();
      const list = page.getByRole('region', { name: 'Capas de la escena' });
      await list.locator('ol button').filter({ hasText: 'Titular técnico' }).click();
      const shot = async (name, width) => {
        await page.setViewportSize({ width, height: 900 });
        await panel.scrollIntoViewIfNeeded();
        await page.screenshot({ path: join(f.space, name + '-' + width + '.png') });
      };
      for (const outcome of ['feedback', 'component', 'waiting', 'delivery-unknown']) {
        const kind = outcome === 'component' ? 'component' : 'feedback';
        const latest = await api('/api/studio/projects/' + id);
        const title = latest.document.scenes[0].layers.find((l) => l.id === 'titular').text;
        await list.locator('ol button').filter({ hasText: title }).click();
        await panel.getByLabel('Conversación vinculada').selectOption(bindingId);
        await panel.getByLabel('Solicitud', { exact: true }).selectOption(kind);
        await panel.getByLabel('Instrucciones para el chat').fill(
          {
            feedback: 'Revisar el titular seleccionado',
            component: 'Proponer un componente para esta escena',
            waiting: 'Comprobar la pausa del chat',
            'delivery-unknown': 'Revisar el envío sin confirmación',
          }[outcome]
        );
        const response = page.waitForResponse(
          (r) => r.request().method() === 'POST' && r.url().endsWith('/requests')
        );
        await panel.getByRole('button', { name: 'Enviar al chat vinculado' }).click();
        const r = await response;
        assert.ok(r.ok(), 'HTTP ' + r.status());
        const receipt = (await r.json()).data;
        assert.equal(receipt.selection.layerId, 'titular');
        if (outcome === 'feedback') await shot('solicitud-pendiente', 1440);
        const output = run(
          process.execPath,
          [
            '--import',
            'tsx',
            'test/fixture-dispatch.ts',
            f.space,
            id,
            bindingId,
            receipt.id,
            outcome,
          ],
          common,
          join(root, 'apps/companion')
        );
        const done = JSON.parse(output);
        assert.equal(
          done.status,
          ['feedback', 'component'].includes(outcome) ? 'completed' : outcome
        );
        if (outcome === 'component') assert.ok(done.proposalId);
        await page.reload();
        await panel.locator('summary').first().click();
        await panel.locator('li').first().waitFor();
      }
      await shot('recibos', 1440);
      await shot('recibos', 1024);
      console.info('Controlled UI and action callbacks passed, clone ' + id);
      return;
    }
    if (action === 'pair-intent') {
      save(join(f.space, 'pairing.json'), await api(path + '/pairing', {}, 'POST'));
      console.info('Private pairing file:', join(f.space, 'pairing.json'));
      return;
    }
    if (action === 'receipts') {
      console.log(JSON.stringify(await api(path + '/requests')));
      return;
    }
    if (action === 'head') {
      console.log(JSON.stringify(await api(path)));
      return;
    }
    if (action === 'request') {
      const [file] = argv;
      const body = readPrivate(file),
        p = await api(path);
      assert.ok(['component', 'feedback', 'voice', 'storyboard', 'shorts'].includes(body.kind));
      const data = await api(path + '/requests', {
        ...body,
        engine: p.document.engine,
        baseRevision: body.baseRevision ?? p.revision,
        idempotencyKey: body.idempotencyKey ?? randomUUID(),
      });
      console.log(JSON.stringify(data));
      return;
    }
    await page.goto(f.origin + '/designer/' + sourceProject);
    await page.locator('summary').filter({ hasText: 'Asistente de la conversación' }).click();
    if (action === 'screen') {
      for (const width of [1024, 1440]) {
        await page.setViewportSize({ width, height: 900 });
        await page
          .locator('select')
          .filter({ has: page.locator('option') })
          .first()
          .waitFor();
        await page.locator('.assistant-panel').scrollIntoViewIfNeeded();
        await page.waitForTimeout(450);
        await page.screenshot({
          path: join(
            f.space,
            'asistente-' + (argv[0] ?? 'panel').replace(/[^a-z0-9-]/gi, '') + '-' + width + '.png'
          ),
        });
      }
      return;
    }
    if (action === 'editor-request') {
      const body = readPrivate(argv[0]);
      assert.ok(['component', 'feedback', 'voice', 'storyboard'].includes(body.kind));
      if (body.selection?.layerId) {
        const list = page.getByRole('region', { name: 'Capas de la escena' });
        const buttons = list.locator('ol button');
        const p = await api(path),
          layer = p.document.scenes[0].layers.find((l) => l.id === body.selection.layerId);
        assert.ok(layer);
        await buttons
          .filter({
            hasText:
              layer.type === 'text'
                ? layer.text
                : layer.type === 'audio'
                  ? 'base-tecnica.wav'
                  : 'Subtítulos',
          })
          .first()
          .click();
      }
      const panel = page.locator('.assistant-panel');
      await panel.getByLabel('Conversación vinculada').selectOption(body.bindingId);
      await panel.getByLabel('Solicitud', { exact: true }).selectOption(body.kind);
      await panel.getByLabel('Instrucciones para el chat').fill(body.message);
      const response = page.waitForResponse(
        (r) => r.url().endsWith('/requests') && r.request().method() === 'POST'
      );
      await panel.getByRole('button', { name: 'Enviar al chat vinculado' }).click();
      const r = await response;
      assert.ok(r.ok(), 'Solicitud HTTP ' + r.status());
      console.log(JSON.stringify((await r.json()).data));
      return;
    }
    if (action === 'reuse') {
      const [proposalId] = argv;
      assert.match(proposalId, /^[a-f0-9-]{36}$/);
      const proposal = await api(path + '/proposals/' + proposalId),
        entry = proposal.candidate;
      assert.ok(
        entry && proposal.appliedRevision,
        'Aplica la propuesta y guarda su versión antes de reutilizarla.'
      );
      const project = await api('/api/studio/projects', {
        title: 'Reutilización de ' + entry.name,
        engine: entry.engine,
        canvas: { width: 640, height: 360, fps: 25 },
      });
      await page.goto(f.origin + '/designer/' + project.document.id);
      await page.getByRole('button', { name: 'Añadir escena' }).click();
      await page.getByText('Referencias de la escena', { exact: true }).click();
      const pinned = JSON.stringify([entry.id, entry.version]);
      const catalog = await api(
        '/api/studio/libraries/component?verified=1&engine=' + entry.engine
      );
      assert.ok(
        catalog.some((l) => l.id === entry.id && l.version === entry.version),
        'La versión no está en el catálogo verificado.'
      );
      await page
        .getByRole('combobox', { name: /^Componente visual/ })
        .selectOption(pinned, { timeout: 8000 });
      const saved = page.waitForResponse(
        (r) =>
          r.request().method() === 'PUT' &&
          r.url().endsWith('/' + project.document.id) &&
          r
            .request()
            .postDataJSON()
            ?.document?.scenes?.some((s) => s.layers.some((l) => l.componentRef?.id === entry.id))
      );
      await page.getByRole('button', { name: 'Insertar componente visual' }).click();
      assert.ok((await saved).ok());
      const result = await api('/api/studio/projects/' + project.document.id);
      assert.ok(
        result.document.scenes.some((s) =>
          s.layers.some(
            (l) => l.componentRef?.id === entry.id && l.componentRef.version === entry.version
          )
        )
      );
      await page.getByRole('button', { name: 'Reproducir', exact: true }).click({ timeout: 30000 });
      await page.getByRole('button', { name: 'Pausar', exact: true }).click();
      await page.screenshot({ path: join(f.space, 'reutilizacion-' + proposalId + '.png') });
      console.log(
        JSON.stringify({
          projectId: project.document.id,
          revision: result.revision,
          componentId: entry.id,
          version: entry.version,
        })
      );
      return;
    }
    if (action === 'review') {
      const [id] = argv;
      assert.match(id, /^[a-f0-9-]{36}$/);
      const panel = page
        .locator('details')
        .filter({ has: page.locator('summary').filter({ hasText: 'Revisar propuestas' }) })
        .first();
      await panel.locator('summary').first().click();
      await panel.getByLabel('Propuesta', { exact: true }).selectOption(id);
      await panel.getByRole('button', { name: 'Previsualizar propuesta' }).click();
      await panel.getByRole('button', { name: 'Reproducir propuesta' }).click({ timeout: 30000 });
      await panel.getByRole('button', { name: 'Pausar propuesta' }).click();
      const preview = panel.locator('iframe').first();
      await preview.screenshot({ path: join(f.space, 'propuesta-' + id + '.png') });
      if (!(await api(path + '/proposals/' + id)).appliedRevision)
        await panel.getByRole('button', { name: /Aplicar/ }).click();
      await panel.getByRole('button', { name: /Guardar.*biblioteca/ }).click();
      await panel.getByText('Versión guardada en biblioteca.', { exact: true }).waitFor();
      console.log('Aplicada y guardada en biblioteca.');
      return;
    }
    throw Error('Comando de aceptación desconocido.');
  } finally {
    await browser.close();
  }
}
function readPrivate(file) {
  const info = statSync(file);
  assert.ok(info.isFile() && !(info.mode & 0o077));
  return JSON.parse(readFileSync(file, 'utf8'));
}
async function main() {
  if (command === 'start') return start();
  const space = realpathSync(directory);
  assert.equal(dirname(space), '/private/tmp');
  assert.match(basename(space), /^vw-r4-[a-zA-Z0-9]+$/);
  const f = readPrivate(join(space, 'fixture.json'));
  assert.equal(f.space, space);
  if (command === 'suite-config') {
    const copy = join(space, 'checkout');
    const files = run('git', ['ls-files', '-co', '--exclude-standard', '-z'])
      .split('\0')
      .filter((s) => s && !s.startsWith('.agents/') && !s.startsWith('.superpowers/'));
    for (const file of files) {
      if (!existsSync(join(root, file)) || !statSync(join(root, file)).isFile()) continue;
      const dest = join(copy, file);
      mkdirSync(dirname(dest), { recursive: true });
      copyFileSync(join(root, file), dest);
    }
    assert.match(f.pg, /^vw-r4-pg-[a-f0-9]{8}$/);
    const info = JSON.parse(run('docker', ['inspect', f.pg]))[0],
      port = info.NetworkSettings.Ports['5432/tcp'][0];
    assert.equal(port.HostIp, '127.0.0.1');
    assert.equal(info.Config.Image, 'postgres:16-alpine');
    const env = Object.fromEntries(
      info.Config.Env.map((v) => [v.slice(0, v.indexOf('=')), v.slice(v.indexOf('=') + 1)])
    );
    assert.equal(env.POSTGRES_DB, 'r4_acceptance_test');
    const dbName = 'r4_suite_' + randomUUID().replaceAll('-', '') + '_test';
    run('docker', ['exec', f.pg, 'createdb', '-U', 'postgres', dbName]);
    writeFileSync(
      join(copy, '.env.studio-test'),
      'STUDIO_TEST_DATABASE_URL=postgres://postgres:' +
        env.POSTGRES_PASSWORD +
        '@127.0.0.1:' +
        port.HostPort +
        '/' +
        dbName +
        '\n',
      { mode: 0o600 }
    );
    console.info('Test copy prepared:', copy);
    return;
  }
  if (command === 'info') {
    console.log(
      JSON.stringify({
        space: f.space,
        projectId: f.projectId,
        origin: f.origin,
        configDir: join(space, 'companion'),
      })
    );
    return;
  }
  return browserAction(f, command, args);
}
main().catch((e) => {
  console.error(
    'No se completó la aceptación:',
    e instanceof Error ? e.message.split('\n')[0] : 'Error'
  );
  process.exitCode = 1;
});
