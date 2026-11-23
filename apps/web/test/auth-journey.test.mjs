import { execFileSync, spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { once } from 'node:events';
import dns from 'node:dns';
import { createServer } from 'node:net';
import { mkdir, mkdtemp, open, readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { setTimeout as delay } from 'node:timers/promises';
import { hash } from 'bcryptjs';
import { it, expect, vi } from 'vitest';
import { authFixture } from '../server/auth/auth-test-fixture';

async function port() {
  const server = createServer().listen(0, '127.0.0.1');
  await once(server, 'listening');
  const value = server.address().port;
  await new Promise((done) => server.close(done));
  return value;
}

async function ready(url) {
  for (let i = 0; i < 150; i++) {
    if (
      await fetch(url, { signal: AbortSignal.timeout(2000) }).then(
        (r) => r.ok,
        () => false
      )
    )
      return;
    await delay(500);
  }
  throw Error('A fixture service did not become ready at ' + url);
}

async function status(response, expected) {
  expect(response.status, new URL(response.url).pathname).toBe(expected);
  return response;
}

async function checkAnonymousRoutes(web) {
  const id = randomUUID();
  const privatePages = [
    '/',
    '/projects',
    '/jobs',
    '/shorts',
    '/templates',
    '/styles',
    '/brands',
    '/assets',
    '/components',
    '/video-wizard',
    '/content-intelligence',
    '/subtitle-generator',
    '/editor/' + id,
    '/designer/' + id,
  ];
  for (const path of privatePages) {
    const route = path + '?tab=fixture';
    const res = await fetch(web + route, { redirect: 'manual' });
    expect([307, 308], path).toContain(res.status);
    const target = new URL(res.headers.get('location'), web);
    expect([target.origin, target.pathname, target.searchParams.get('callbackUrl')]).toEqual([
      web,
      '/signin',
      route,
    ]);
  }
  const project = 'studio/projects/' + id;
  const byMethod = {
    GET: [
      'jobs',
      'jobs/' + id,
      'studio/assets',
      'studio/assets/' + id,
      'studio/assets/' + id + '/metadata',
      'studio/projects',
      project,
      project + '/revisions',
      project + '/renders/' + id,
      'studio/libraries/component',
      'studio/libraries/component/' + id + '/1',
    ],
    HEAD: ['studio/assets/' + id, project + '/renders/' + id],
    POST: [
      'analyze-content',
      'create-clip',
      'generate-subtitles',
      'render-final',
      'render-with-subtitles',
      'render-video-subtitles',
      'transcribe',
      'studio/shorts',
      'studio/catalog',
      'studio/assets',
      'studio/projects',
      'studio/library-editions',
      'studio/libraries/component',
      'studio/templates/' + id + '/instantiate',
      ...['audio', 'duplicate', 'preview', 'renders', 'restore', 'template'].map(
        (part) => project + '/' + part
      ),
    ],
    PUT: [project],
    DELETE: [project + '/preview'],
  };
  for (const [method, routes] of Object.entries(byMethod)) {
    for (const route of routes) await status(await fetch(web + '/api/' + route, { method }), 401);
  }
  await status(await fetch(web + '/remotion'), 401);
}

it.skipIf(import.meta.env.MODE !== 'journey')(
  'completes a private local media journey after migrating a bcrypt owner',
  async () => {
    const image = process.env.STUDIO_TEST_RENDER_IMAGE || 'video-wizard-renderer:local';
    const root = resolve('../..'),
      workspace = await mkdtemp(join(tmpdir(), 'studio-auth-journey-'));
    console.info('Private technical fixture evidence:', workspace);
    const data = join(workspace, 'data');
    await mkdir(data);
    const fixture = await authFixture(7);
    const [webPort, pythonPort, rendererPort] = await Promise.all([port(), port(), port()]);
    const web = 'http://app.video-wizard.localhost:' + webPort,
      renderer = 'http://preview.video-wizard.localhost:' + rendererPort;
    // Chrome resolves *.localhost itself. Keep the Node test client independent of OS DNS.
    const lookup = dns.lookup.bind(dns);
    const localHosts = new Set([new URL(web).hostname, new URL(renderer).hostname]);
    const localLookup = vi
      .spyOn(dns, 'lookup')
      .mockImplementation((hostname, ...args) =>
        lookup(localHosts.has(hostname) ? '127.0.0.1' : hostname, ...args)
      );
    const owner = randomUUID(),
      email = 'a-' + owner + '@example.test',
      emailB = 'b-' + owner + '@example.test';
    const password = randomUUID(),
      secret = randomBytes(48).toString('hex');
    const env = {
      ...process.env,
      DATABASE_URL: fixture.connectionString,
      BETTER_AUTH_URL: web,
      STUDIO_EDITOR_ORIGIN: web,
      STUDIO_PREVIEW_ORIGIN: renderer,
      BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
      STUDIO_RENDER_SECRET: secret,
      STUDIO_DATA_DIR: data,
      PYTHON_ENGINE_INTERNAL_URL: 'http://127.0.0.1:' + pythonPort,
      REMOTION_SERVER_URL: 'http://127.0.0.1:' + rendererPort,
      NEXT_TELEMETRY_DISABLED: '1',
      USE_OPENAI_API: 'false',
      OPENAI_API_KEY: '',
      WORKER_QUEUE_NAME: 'default',
    };
    const children = [],
      container = 'studio-journey-' + randomUUID();
    let running = false,
      browser;
    async function start(name, exe, args, cwd) {
      const log = await open(join(workspace, name + '.log'), 'wx', 0o600);
      try {
        const child = spawn(exe, args, {
          cwd,
          env,
          detached: true,
          stdio: ['ignore', log.fd, log.fd],
        });
        children.push(child);
        await once(child, 'spawn');
      } finally {
        await log.close();
      }
    }
    const api = (path, cookie, body, extra = {}) =>
      fetch(web + path, {
        redirect: 'manual',
        method: body ? 'POST' : 'GET',
        ...extra,
        headers: {
          origin: web,
          ...(cookie && { cookie }),
          ...(body && { 'content-type': 'application/json' }),
          ...extra.headers,
        },
        body: body && JSON.stringify(body),
      });
    async function credentials(path, address) {
      const r = await status(
        await api('/api/auth/' + path, '', {
          email: address,
          password,
          ...(path.includes('up') && { name: 'Cuenta técnica B' }),
        }),
        200
      );
      return r.headers
        .getSetCookie()
        .map((v) => v.split(';')[0])
        .join('; ');
    }
    try {
      await fixture.pool.query(
        'INSERT INTO users(id,email,name,password_hash) VALUES($1,$2,$3,$4)',
        [owner, email, 'Cuenta técnica A', await hash(password, 4)]
      );
      await fixture.apply('0008_better_auth.sql');
      execFileSync(
        'docker',
        [
          'run',
          '--pull=never',
          '-d',
          '--rm',
          '--name',
          container,
          '--shm-size=1g',
          '-p',
          '127.0.0.1:' + rendererPort + ':3001',
          '--mount',
          'type=bind,source=' + data + ',target=/app/.studio-data,readonly',
          '-e',
          'STUDIO_RENDER_SECRET',
          '-e',
          'STUDIO_EDITOR_ORIGIN',
          '-e',
          'STUDIO_PREVIEW_ORIGIN',
          '-e',
          'RENDER_CONCURRENCY=2',
          image,
        ],
        { env, stdio: 'ignore' }
      );
      running = true;
      const py = join(root, 'apps/processing-engine');
      await start(
        'python',
        join(py, '.venv/bin/python'),
        ['-m', 'uvicorn', 'main:app', '--host', '127.0.0.1', '--port', String(pythonPort)],
        py
      );
      await start(
        'next',
        process.execPath,
        [
          'node_modules/next/dist/bin/next',
          'start',
          '--hostname',
          '127.0.0.1',
          '--port',
          String(webPort),
        ],
        resolve('.')
      );
      await Promise.all([
        ready(web + '/signin'),
        ready(renderer + '/health'),
        ready(env.PYTHON_ENGINE_INTERNAL_URL + '/health'),
      ]);
      await checkAnonymousRoutes(web);
      console.info('Private page redirects and all application API guards passed.');
      let cookie = await credentials('sign-in/email', email);
      const other = await credentials('sign-up/email', emailB);
      const fixturePath = join(workspace, 'source.mp4');
      execFileSync('ffmpeg', [
        '-v',
        'error',
        '-f',
        'lavfi',
        '-i',
        'color=c=blue:s=320x180:r=25:d=2',
        '-f',
        'lavfi',
        '-i',
        'sine=f=440:d=2',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        fixturePath,
      ]);
      const uploaded = await status(
        await fetch(web + '/api/studio/assets', {
          method: 'POST',
          headers: {
            cookie,
            origin: web,
            'x-studio-filename': 'source.mp4',
            'content-type': 'video/mp4',
          },
          body: await readFile(fixturePath),
        }),
        201
      );
      const asset = (await uploaded.json()).data;
      expect(asset.hasAudio).toBe(true);
      const assetPath = '/api/studio/assets/' + asset.id;
      await status(await api(assetPath, other), 404);
      await status(await api(assetPath, cookie, null, { method: 'HEAD' }), 200);
      const sample = await status(
        await api(assetPath, cookie, null, { headers: { range: 'bytes=0-3' } }),
        206
      );
      expect((await sample.arrayBuffer()).byteLength).toBe(4);
      await status(
        await api(assetPath, cookie, null, { headers: { range: 'bytes=99999999-' } }),
        416
      );
      const transcribe = { action: 'transcribe', assetId: asset.id };
      await status(
        await api('/api/studio/shorts', cookie, transcribe, { headers: { origin: renderer } }),
        401
      );
      const transcript = await (
        await status(await api('/api/studio/shorts', cookie, transcribe), 200)
      ).json();
      expect(
        Array.isArray(transcript.data.cues) && typeof transcript.data.language === 'string'
      ).toBe(true);
      console.info(
        'Authenticated upload, private ranges, foreign owner, origin, local Whisper passed.'
      );
      const cli = createRequire(
        resolve('../../packages/hyperframes-compositions/package.json')
      ).resolve('hyperframes/package.json');
      const puppeteer = (
        await import(pathToFileURL(createRequire(cli).resolve('puppeteer-core')).href)
      ).default;
      browser = await puppeteer.launch({
        headless: true,
        executablePath:
          process.env.STUDIO_TEST_CHROME ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      });
      const tab = await browser.newPage();
      await tab.bringToFront();
      await tab.goto('http://localhost:' + webPort + '/signin?entry=local');
      expect(tab.url()).toBe(web + '/signin?entry=local');
      for (const value of cookie.split('; ')) {
        const split = value.indexOf('=');
        await browser.setCookie({
          name: value.slice(0, split),
          value: value.slice(split + 1),
          domain: new URL(web).hostname,
          path: '/',
          httpOnly: true,
        });
      }
      const network = await tab.createCDPSession();
      await network.send('Network.enable');
      // ExtraInfo reports the actual request headers, including HttpOnly cookies.
      // Retain only names, and correlate by request ID since the events can arrive in either order.
      const previewRequests = new Map();
      const cookieNames = new Map();
      network.on('Network.requestWillBeSent', ({ requestId, request }) => {
        const url = new URL(request.url);
        if (url.origin === renderer && url.pathname.startsWith('/studio/previews/'))
          previewRequests.set(requestId, url.pathname);
      });
      network.on('Network.requestWillBeSentExtraInfo', ({ requestId, headers }) => {
        const cookie = headers.Cookie ?? headers.cookie ?? '';
        cookieNames.set(
          requestId,
          cookie
            .split(';')
            .filter(Boolean)
            .map((pair) => pair.trim().split('=', 1)[0])
        );
      });
      const caption = { id: 'manual', startMs: 100, endMs: 900, text: 'Prueba técnica' };
      // The catalog uses the same storage and scoped database as this installation.
      execFileSync('pnpm', ['--filter', 'web', 'auth:seed'], {
        cwd: root,
        env: { ...env, SEED_USER_EMAIL: email },
        stdio: 'ignore',
      });
      for (const engine of ['remotion', 'hyperframes']) {
        previewRequests.clear();
        cookieNames.clear();
        const shorts = await (
          await status(
            await api('/api/studio/shorts', cookie, {
              action: 'create',
              input: {
                assetId: asset.id,
                engine,
                canvas: { width: 320, height: 180, fps: 25 },
                ranges: [{ startMs: 0, endMs: 1000 }],
                sourceCaptions: [caption],
              },
            }),
            200
          )
        ).json();
        const record = shorts.data[0],
          id = record.document.id,
          project = '/api/studio/projects/' + id;
        expect(
          record.document.scenes[0].layers.some(
            (l) => l.type === 'captions' && l.cues.some((c) => c.text === caption.text)
          )
        ).toBe(true);
        await status(await api(project, other), 404);
        const conflict = await status(
          await api(
            project,
            cookie,
            { baseRevision: randomUUID(), document: record.document },
            { method: 'PUT' }
          ),
          409
        );
        expect((await conflict.json()).current.revision).toBe(record.revision);
        const responses = [];
        const failures = [];
        const collect = (response) => {
          const path = new URL(response.url()).pathname.replace(/[a-f0-9-]{36}/gi, ':id');
          if (path.includes('/preview') || response.status() >= 400)
            responses.push([response.status(), path]);
        };
        const onError = (error) => failures.push(error.name);
        tab.on('response', collect);
        tab.on('pageerror', onError);
        await tab.evaluateOnNewDocument(() => {
          window.addEventListener('message', ({ data }) => {
            if (['studio.ready', 'studio.error', 'studio.connecting'].includes(data?.type))
              document.documentElement.dataset.authJourneyPreview = data.type;
            if (data?.type === 'studio.time' && Number.isFinite(data.timeMs))
              document.documentElement.dataset.authJourneyTime = String(data.timeMs);
          });
        });
        try {
          await tab.goto(web + '/designer/' + id);
          await tab.waitForFunction(
            () => {
              const stage = document.documentElement.dataset.authJourneyPreview;
              return (
                stage === 'studio.ready' ||
                stage === 'studio.error' ||
                document.querySelector('.studio-stage [role=alert]') ||
                location.pathname === '/signin'
              );
            },
            { timeout: 35000, polling: 'mutation' }
          );
          expect(
            await tab.evaluate(() => document.documentElement.dataset.authJourneyPreview)
          ).toBe('studio.ready');
          // Seek with the editor's real timeline to the middle of the authored cue.
          await tab.locator('input[aria-label="Posición de reproducción"]').click();
          await tab.waitForFunction(
            () => {
              const time = Number(document.documentElement.dataset.authJourneyTime);
              return time > 100 && time < 900;
            },
            { timeout: 10000, polling: 'mutation' }
          );
          const observed = [...previewRequests].map(([id, path]) => [path, cookieNames.get(id)]);
          expect(
            observed.some(([path, names]) => path.endsWith('/frame') && names?.length === 0)
          ).toBe(true);
          expect(observed.some(([, names]) => names?.includes('studio_preview'))).toBe(true);
          expect(
            observed.every(([, names]) => names?.every((name) => name === 'studio_preview'))
          ).toBe(true);
          await tab.screenshot({ path: join(workspace, engine + '.png') });
        } catch (error) {
          const ui = await tab.evaluate(() => ({
            page: location.pathname.startsWith('/designer/') ? 'designer' : location.pathname,
            frame: Boolean(document.querySelector('iframe[title="Vista previa del proyecto"]')),
            stage: document.documentElement.dataset.authJourneyPreview || 'none',
            alerts: Array.from(document.querySelectorAll('[role=alert]')).map((el) =>
              el.innerText.slice(0, 200)
            ),
            status: document.querySelector('.studio-stage')?.innerText.slice(0, 200),
          }));
          await tab.screenshot({ path: join(workspace, engine + '-failure.png') });
          console.info('Private preview diagnostic:', { engine, ui, responses, failures });
          throw error;
        } finally {
          tab.off('response', collect);
          tab.off('pageerror', onError);
        }
        console.info(engine + ' private editor preview ready.');
      }
      const renderJob = await (
        await status(
          await api('/api/render-with-subtitles', cookie, {
            sourceAssetId: asset.id,
            template: 'minimal',
            aspectRatio: '16:9',
            subtitles: [{ start: 0.1, end: 0.9, text: caption.text }],
          }),
          202
        )
      ).json();
      const jobPath = '/api/jobs/' + renderJob.data.jobId;
      await status(await api(jobPath, other), 404);
      const token = (await (await status(await api('/api/auth/token', cookie), 200)).json()).token;
      await fixture.pool.query(
        "UPDATE auth_sessions SET expires_at=now()-interval '1 minute' WHERE user_id=$1",
        [owner]
      );
      const bearer = { headers: { authorization: 'Bearer ' + token } };
      await status(await api(jobPath, cookie, null, bearer), 401);
      await start('worker', 'pnpm', ['--filter', 'web', 'worker'], root);
      cookie = await credentials('sign-in/email', email);
      const browserLoginWindow = Date.now() + 11000;
      let result;
      for (let i = 0; i < 180; i++) {
        const job = (await (await status(await api(jobPath, cookie), 200)).json()).data;
        if (job.status === 'completed') {
          result = job.resultData;
          break;
        }
        expect(job.status).not.toBe('failed');
        await delay(1000);
      }
      expect(result?.videoUrl).toMatch(/^\/api\/studio\/assets\//);
      await status(await api(result.videoUrl, other), 404);
      const mp4 = Buffer.from(
        await (await status(await api(result.videoUrl, cookie), 200)).arrayBuffer()
      );
      const file = await open(join(workspace, 'result.mp4'), 'wx', 0o600);
      try {
        await file.writeFile(mp4);
      } finally {
        await file.close();
      }
      const streams = execFileSync('ffprobe', [
        '-v',
        'error',
        '-show_entries',
        'stream=codec_type',
        '-of',
        'json',
        join(workspace, 'result.mp4'),
      ]);
      expect(
        JSON.parse(streams)
          .streams.map((s) => s.codec_type)
          .sort()
      ).toEqual(['audio', 'video']);
      console.info('Queued work finished after expiry. Private MP4 audio/video verified.');
      // Three UI sign-ins follow. Respect the production sign-in limit of three per ten seconds.
      await delay(Math.max(0, browserLoginWindow - Date.now()));
      await tab.goto(web + '/signin');
      async function form(page, address) {
        const uiBefore = await page.evaluate(() => ({
          path: location.pathname,
          prefilled: Boolean(document.querySelector('#email')?.value),
          locked: document.body.innerText.includes('Tu sesión ha caducado'),
        }));
        console.info('Sign-in form before submission:', uiBefore);
        // Logout can briefly show the recovery form before its redirect finishes.
        await page.waitForFunction(
          () => location.pathname === '/signin' && document.querySelector('form'),
          { timeout: 10000, polling: 'mutation' }
        );
        await page.locator('#email').fill(address);
        await page.locator('#password').fill(password);
        const label = address === email ? 'Cuenta técnica A' : 'Cuenta técnica B';
        let responseStatus;
        try {
          expect(await page.$eval('form', (el) => el.checkValidity())).toBe(true);
          const reply = page.waitForResponse(
            (r) =>
              new URL(r.url()).pathname === '/api/auth/sign-in/email' &&
              r.request().method() === 'POST',
            { timeout: 10000 }
          );
          await page.click('button[type=submit]');
          responseStatus = (await reply).status();
          expect(responseStatus).toBe(200);
          await page.waitForFunction(
            (who) =>
              location.pathname === '/projects' &&
              document.querySelector('aside')?.innerText.includes(who),
            { timeout: 12000, polling: 'mutation' },
            label
          );
        } catch (error) {
          await page.screenshot({ path: join(workspace, 'sign-in-failure.png') });
          console.info(
            'Sign-in response:',
            responseStatus,
            await page.evaluate(() => ({
              path: location.pathname,
              valid: document.querySelector('form')?.checkValidity(),
              alert: document.querySelector('[role=alert]')?.innerText.slice(0, 160),
            }))
          );
          throw error;
        }
      }
      await form(tab, email);
      const second = await browser.newPage();
      await second.goto(web + '/projects');
      await second.waitForFunction(() =>
        document.querySelector('aside')?.innerText.includes('Cuenta técnica A')
      );
      await tab.bringToFront();
      const before = await tab.evaluate(
        async () => (await (await fetch('/api/auth/token')).json()).token
      );
      await tab.evaluate(() =>
        Array.from(document.querySelectorAll('button'))
          .find((b) => b.textContent.includes('Cerrar sesión'))
          .click()
      );
      await second.waitForFunction(
        () => document.body.innerText.includes('Tu sesión ha caducado'),
        { timeout: 10000, polling: 'mutation' }
      );
      expect(
        await second.evaluate(() => document.body.innerText.includes('Cuenta técnica A'))
      ).toBe(false);
      await status(
        await api(jobPath, '', null, { headers: { authorization: 'Bearer ' + before } }),
        401
      );
      await form(tab, email);
      await second.goto(web + '/projects');
      await second.waitForFunction(() => document.body.innerText.includes('Cuenta técnica A'), {
        timeout: 10000,
        polling: 'mutation',
      });
      await tab.bringToFront();
      // Direct account change: A's workspace is open in the other tab, without an intervening logout.
      await tab.goto(web + '/signin');
      await form(tab, emailB);
      try {
        await second.waitForFunction(() => !document.body.innerText.includes('Cuenta técnica A'), {
          timeout: 12000,
          polling: 'mutation',
        });
      } catch (error) {
        await second.screenshot({ path: join(workspace, 'previous-account-failure.png') });
        console.info(
          'Previous account still visible after successful direct switch:',
          await second.evaluate(() => document.body.innerText.includes('Cuenta técnica A'))
        );
        throw error;
      }
      await second.bringToFront();
      await second.goto(web + '/projects');
      await second.waitForFunction(() => document.body.innerText.includes('Cuenta técnica B'));
      expect(
        await second.evaluate(() => document.body.innerText.includes('Cuenta técnica A'))
      ).toBe(false);
      await second.screenshot({ path: join(workspace, 'second-account.png') });
      console.info('Two tabs hid the old workspace and switched to the new owner.');
    } finally {
      localLookup.mockRestore();
      await browser?.close();
      const stops = await Promise.allSettled(
        children.reverse().map(async (child) => {
          if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;
          const closed = once(child, 'exit');
          try {
            process.kill(-child.pid, 'SIGTERM');
            if (
              !(await Promise.race([closed.then(() => true), delay(5000, false, { ref: false })]))
            ) {
              process.kill(-child.pid, 'SIGKILL');
              await closed;
            }
          } catch (error) {
            if (error.code !== 'ESRCH') throw error;
          }
        })
      );
      try {
        if (running)
          execFileSync('docker', ['stop', '--time', '2', container], { stdio: 'ignore' });
      } finally {
        await fixture.close();
      }
      expect(
        stops.every((s) => s.status === 'fulfilled'),
        'Stopped the test processes'
      ).toBe(true);
    }
  },
  480000
);
