import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { mkdtemp, open } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const origin = 'http://localhost:3000';
const authWrites = new Set([
  '/api/auth/sign-in/email',
  '/api/auth/sign-out',
  '/api/auth/get-session',
]);

export async function checkLocalStudio(root) {
  const file = await open(
    join(root, '.studio/bootstrap-user.json'),
    constants.O_RDONLY | constants.O_NOFOLLOW
  );
  let credential;
  try {
    const meta = await file.stat();
    assert.ok(
      meta.isFile() && (meta.mode & 0o777) === 0o600 && meta.size <= 4096,
      'Expected a private bootstrap credential.'
    );
    credential = JSON.parse(await file.readFile('utf8'));
  } finally {
    await file.close();
  }
  assert.ok(
    credential.format === 'video-wizard/bootstrap-user/v1' &&
      credential.email === 'demo@video-wizard.local' &&
      typeof credential.password === 'string',
    'This smoke check expects the local demo bootstrap account.'
  );
  const evidence = await mkdtemp(join(tmpdir(), 'studio-live-sidebar-'));
  console.info('Private sidebar screenshots:', evidence);
  const cli = createRequire(join(root, 'packages/hyperframes-compositions/package.json')).resolve(
    'hyperframes/package.json'
  );
  const { default: puppeteer } = await import(
    pathToFileURL(createRequire(cli).resolve('puppeteer-core')).href
  );
  const browser = await puppeteer.launch({
    headless: true,
    executablePath:
      process.env.STUDIO_TEST_CHROME ||
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  });
  let active = false;
  try {
    const page = await browser.newPage();
    await page.setRequestInterception(true);
    page.on('request', (request) => {
      const url = new URL(request.url());
      const read = ['GET', 'HEAD', 'OPTIONS'].includes(request.method());
      const auth =
        request.method() === 'POST' && url.origin === origin && authWrites.has(url.pathname);
      if (read || auth) void request.continue();
      else void request.abort();
    });
    await page.goto(origin + '/projects');
    assert.equal(new URL(page.url()).origin, origin);
    assert.equal(new URL(page.url()).pathname, '/signin');
    await page.locator('#email').fill(credential.email);
    await page.locator('#password').fill(credential.password);
    const reply = page.waitForResponse(
      (r) => r.url() === origin + '/api/auth/sign-in/email' && r.request().method() === 'POST'
    );
    await page.click('button[type=submit]');
    assert.equal((await reply).status(), 200, 'Demo sign-in failed.');
    active = true;
    await page.waitForFunction(
      () =>
        location.pathname === '/projects' &&
        document.querySelector('button[aria-label="Cerrar sesión"]')
    );
    assert.ok(
      await page.evaluate(
        async (email) =>
          (await (await fetch('/api/auth/get-session')).json())?.user?.email === email,
        credential.email
      ),
      'Unexpected workspace identity.'
    );
    for (const width of [800, 1280]) {
      await page.setViewport({ width, height: width === 800 ? 600 : 800 });
      const sidebar = await page.$('aside');
      const layout = await sidebar.evaluate((aside) => {
        const outer = aside.getBoundingClientRect();
        const controls = [...aside.querySelectorAll('.studio-account-control')];
        return {
          width: outer.width,
          controls: controls.length,
          inside: controls.every((control) =>
            [control, control.querySelector('svg')].every((item) => {
              if (!item) return false;
              const box = item.getBoundingClientRect();
              return box.width > 0 && box.left >= outer.left && box.right <= outer.right + 1;
            })
          ),
          compact: controls.every(
            (control) => control.querySelector('span').getBoundingClientRect().width <= 1
          ),
          expanded: controls.every(
            (control) => control.querySelector('span').getBoundingClientRect().width > 1
          ),
        };
      });
      assert.ok(layout.controls === 2 && layout.inside, 'Account controls exceed sidebar bounds.');
      if (width === 800)
        assert.ok(layout.width === 64 && layout.compact, 'Expected compact sidebar.');
      else assert.ok(layout.width > 200 && layout.expanded, 'Expected expanded sidebar.');
      await sidebar.screenshot({ path: join(evidence, 'sidebar-' + width + '.png') });
      console.info('Verified sidebar:', width, 'px viewport,', layout.width, 'px sidebar.');
    }
    await page.click('button[aria-label="Cerrar sesión"]');
    await page.waitForFunction(
      () => location.pathname === '/signin' && document.querySelector('#email')
    );
    assert.ok(
      await page.evaluate(async () => !(await (await fetch('/api/auth/get-session')).json())?.user),
      'Demo session is still active.'
    );
    active = false;
    console.info('Verified demo sign-in, private projects page and sign-out.');
  } finally {
    try {
      if (active) {
        const [page] = (await browser.pages()).filter(
          (tab) => new URL(tab.url()).origin === origin
        );
        if (page)
          await page.evaluate(async () => {
            await fetch('/api/auth/sign-out', {
              method: 'POST',
              headers: { 'content-type': 'application/json' },
              body: '{}',
            });
          });
      }
    } finally {
      await browser.close();
    }
  }
}
