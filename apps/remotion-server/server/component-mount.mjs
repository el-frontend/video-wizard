import express from 'express';
import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { join } from 'node:path';
import { writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import {
  compileProject,
  cliPackage,
  readNativeManifest,
} from '@workspace/hyperframes-compositions';
import { buildPreview } from './preview-builder.js';
import { stageMedia } from './project-adapter.js';
import { sceneFrames } from '@workspace/render-contract';

const hash = (data) => createHash('sha256').update(data).digest('hex');
export async function checkMounted(snapshot, workspace, dataDir, signal) {
  const { document } = snapshot,
    { fps, width, height } = document.canvas;
  const native = document.engine === 'hyperframes';
  const app = express().disable('x-powered-by');
  let files,
    base,
    scriptHashes = '',
    moduleHashes;
  if (native) {
    await compileProject(snapshot, workspace, { dataDir, signal, preview: true });
    const manifest = await readNativeManifest(workspace);
    base = join(workspace, 'native');
    files = new Set(manifest.files);
    moduleHashes = manifest.moduleHashes;
    scriptHashes = " 'sha256-" + manifest.scriptHash + "'";
  } else {
    const manifest = await buildPreview(snapshot, workspace, signal);
    await stageMedia(snapshot, join(workspace, 'media'), dataDir, signal);
    files = new Set([
      'player.js',
      ...Object.values(snapshot.dependencies.assets).map((a) => 'media/' + a.hash),
    ]);
    base = workspace;
    moduleHashes = manifest.moduleHashes;
  }
  const server = app.listen(0, '127.0.0.1');
  let browser;
  try {
    await new Promise((ok, fail) => server.once('listening', ok).once('error', fail));
    const origin = 'http://127.0.0.1:' + server.address().port;
    const policy =
      "default-src 'none'; script-src 'self'" +
      scriptHashes +
      "; style-src 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; media-src 'self' blob: data:; connect-src 'self'; base-uri 'none'; form-action 'none'";
    app.use((req, res) => {
      res.set('Content-Security-Policy', policy);
      if (!native && req.path === '/index.html') {
        res
          .type('html')
          .send(
            '<!doctype html><html><head><link rel="icon" href="data:,"></head><body style="margin:0"><div style="width:100vw;height:100vh" id="player" data-check="1" data-instance="check" data-nonce="check" data-parent-origin="' +
              origin +
              '"></div><script src="./player.js"></script></body></html>'
          );
        return;
      }
      const name = req.path.slice(1);
      if (!files.has(name)) {
        res.status(404).end();
        return;
      }
      res.sendFile(join(base, name));
    });
    const require = createRequire(join(cliPackage, 'package.json'));
    const { default: puppeteer } = await import(
      pathToFileURL(require.resolve('puppeteer-core')).href
    );
    browser = await puppeteer.launch({
      headless: true,
      executablePath:
        process.env.REMOTION_BROWSER_EXECUTABLE ||
        process.env.STUDIO_TEST_CHROME ||
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      args: ['--no-sandbox', '--disable-dev-shm-usage'],
      signal,
    });
    const page = await browser.newPage(),
      errors = [];
    await page.setViewport({
      width: Math.min(640, width),
      height: Math.min(720, Math.max(1, Math.round((Math.min(640, width) * height) / width))),
    });
    await page.setRequestInterception(true);
    page.on('request', (r) => {
      const url = new URL(r.url());
      if (
        url.protocol === 'data:' ||
        (url.origin === origin &&
          (url.pathname === '/index.html' || files.has(url.pathname.slice(1))))
      )
        void r.continue();
      else {
        errors.push('Recurso fuera de la composición.');
        void r.abort();
      }
    });
    page.on('pageerror', () => {
      errors.push('El componente produjo un error de montaje.');
    });
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push('La consola registró un error de montaje.');
      }
    });
    await page.evaluateOnNewDocument(() => {
      globalThis.checkEvents = [];
      addEventListener('message', (e) => globalThis.checkEvents.push(e.data));
    });
    await page.goto(origin + '/index.html', { waitUntil: 'load' });
    if (native) {
      await page.evaluate(async (fps) => {
        globalThis.__HF_EXPORT_RENDER_SEEK_CONFIG = { fps, fpsSource: 'render-options' };
        const tag = document.createElement('script');
        tag.src = './runtime.js';
        await new Promise((ok, fail) => {
          tag.onload = ok;
          tag.onerror = fail;
          document.body.append(tag);
        });
      }, fps);
      await page.waitForFunction(
        () => globalThis.__playerReady && globalThis.__renderReady && globalThis.__player,
        { timeout: 12000 }
      );
    } else
      await page.waitForFunction(
        () => globalThis.checkEvents.some((e) => e.type === 'studio.ready'),
        { timeout: 12000 }
      );
    await page.evaluate(() => document.fonts.ready);
    if (errors.length) throw Error(errors[0]);
    const bounds = sceneFrames(document),
      total = Math.ceil((document.durationMs * fps) / 1000),
      indices = new Set([0, total - 1]);
    for (const [i, s] of document.scenes.entries())
      for (const l of s.layers)
        if (l.visible && l.type === 'component') {
          const start = Math.max(
            bounds[i].from,
            Math.floor(((bounds[i].originMs + l.startMs) * fps) / 1000)
          );
          const end = Math.min(
            bounds[i].from + bounds[i].durationInFrames,
            Math.ceil(((bounds[i].originMs + l.endMs) * fps) / 1000)
          );
          if (start < end) {
            indices.add(start);
            indices.add(Math.floor((start + end - 1) / 2));
            indices.add(end - 1);
            if (end < total) indices.add(end);
          }
        }
    if (indices.size > 32) throw Error('La propuesta supera el límite de muestras de revisión.');
    const forward = [...indices].sort((a, b) => a - b),
      samples = [];
    for (const frame of [...forward, ...forward.slice().reverse()]) {
      signal.throwIfAborted();
      if (native) await page.evaluate((t) => globalThis.__player.seek(t), frame / fps);
      else {
        const timeMs = Math.ceil((frame * 1000) / fps);
        await page.evaluate((timeMs) => {
          globalThis.checkEvents = [];
          postMessage(
            { type: 'studio.seek', instance: 'check', nonce: 'check', version: 1, timeMs },
            location.origin
          );
        }, timeMs);
        await page.waitForFunction(
          (ms) => globalThis.checkEvents.some((e) => e.type === 'studio.time' && e.timeMs === ms),
          { timeout: 5000 },
          Math.round((frame * 1000) / fps)
        );
      }
      await page.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map((im) => im.decode()));
        await new Promise((ok) => requestAnimationFrame(() => requestAnimationFrame(ok)));
      });
      if (errors.length) throw Error(errors[0]);
      const png = await page.screenshot(),
        sha256 = hash(png);
      const previous = samples.find((s) => s.frame === frame);
      if (previous && previous.sha256 !== sha256)
        throw Error('La imagen cambió al volver al mismo fotograma.');
      if (!previous) {
        samples.push({ frame, sha256 });
        await writeFile(join(workspace, 'check-' + frame + '.png'), png);
      }
    }
    return { diagnostics: [], samples, moduleHashes };
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise((ok) => server.close(ok));
  }
}
