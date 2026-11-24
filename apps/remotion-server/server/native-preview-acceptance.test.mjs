import { randomBytes, randomUUID } from 'node:crypto';
import { signServiceToken } from '@workspace/service-auth';
import express from 'express';
import { once } from 'node:events';
import { createRequire } from 'node:module';
import { readFile, writeFile } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { it, expect } from 'vitest';
import { cliPackage } from '@workspace/hyperframes-compositions';
import { installStudioRoutes } from './studio-http';

const evidence = resolve(
  process.env.STUDIO_NATIVE_EVIDENCE_DIR ||
    '../../.superpowers/sdd/2026-11-18-video-wizard-03-generacion/r2-evidence'
);
it.skipIf(import.meta.env.MODE !== 'native').each([25, 30, 1, 'fractional', 'font-error'])(
  'seeks the private native preview forward and backward and acknowledges only the exact cue target',
  async (scenario) => {
    const workspace = (await readFile(join(evidence, 'workspace.txt'), 'utf8')).trim();
    const snapshot = JSON.parse(
      await readFile(
        join(
          workspace,
          scenario === 'fractional' ? 'fractional' : 'noticias-liquid-glass',
          'fixture.json'
        ),
        'utf8'
      )
    );
    const fps = typeof scenario === 'number' ? scenario : 30;
    snapshot.document.canvas.fps = fps;
    if (scenario === 1) {
      const d = snapshot.document;
      d.durationMs = d.scenes[0].durationMs = 1000;
      d.scenes[0].layers = [];
      Object.assign(d.globalAudio[0], { startMs: 0, endMs: 1000, sourceInMs: 500, volume: 1 });
    }
    if (fps === 25 || scenario === 30) {
      const layer = snapshot.document.scenes[0].layers.find((l) => l.type === 'captions');
      layer.startMs = 167;
      layer.cues = [
        { id: 'pre', startMs: 0, endMs: 33, text: 'Anterior' },
        { id: 'edge', startMs: 33, endMs: 34, text: 'Preciso' },
        { id: 'next', startMs: 34, endMs: 833, text: 'Primero' },
        { id: 'last', startMs: 833, endMs: 1400, text: 'Segundo' },
      ];
      if (fps === 25) {
        layer.startMs = 0;
        layer.cues = [
          { id: 'pre', startMs: 0, endMs: 40, text: 'Anterior' },
          { id: 'edge', startMs: 40, endMs: 80, text: 'Preciso' },
          { id: 'last', startMs: 80, endMs: 1500, text: 'Segundo' },
        ];
      }
    }
    const backend = express(),
      editor = express();
    const a = backend.listen(0, '127.0.0.1'),
      b = editor.listen(0, '127.0.0.1');
    await Promise.all([once(a, 'listening'), once(b, 'listening')]);
    const origin = (s) => 'http://127.0.0.1:' + s.address().port;
    const editorUrl = 'http://app.video-wizard.localhost:' + b.address().port;
    const previewUrl = 'http://preview.video-wizard.localhost:' + a.address().port;
    const secret = randomBytes(40).toString('hex'),
      instance = randomUUID();
    snapshot.document.id = randomUUID();
    const api = installStudioRoutes(backend, {
      secret,
      editorOrigin: editorUrl,
      previewOrigin: previewUrl,
      dataDir: join(workspace, 'data'),
    });
    const req = createRequire(join(cliPackage, 'package.json'));
    const { default: puppeteer } = await import(pathToFileURL(req.resolve('puppeteer-core')).href);
    let browser;
    try {
      const response = await fetch(origin(a) + '/studio/previews', {
        method: 'POST',
        headers: {
          authorization:
            'Bearer ' +
            (await signServiceToken(
              {
                audience: 'video-wizard-renderer',
                scope: 'preview.create',
                ownerId: snapshot.ownerId,
                projectId: snapshot.document.id,
                previewId: instance,
              },
              { secret }
            )),
          'content-type': 'application/json',
        },
        body: JSON.stringify({ snapshot, instance }),
      });
      expect(response.status).toBe(200);
      const session = await response.json(),
        path = '/studio/previews/' + session.instance;
      expect((await fetch(origin(a) + path + '/native/index.html')).status).toBe(404);
      editor.get('/', (_req, res) =>
        res
          .type('html')
          .send(
            '<style>*{margin:0}iframe{width:480px;height:380px;border:0}</style><iframe title="Studio" sandbox="allow-scripts allow-same-origin" allow="autoplay"></iframe><script>const s=' +
              JSON.stringify(session) +
              ';const f=document.querySelector("iframe");window.events=[];let nonce;window.msg=(type,extra={})=>f.contentWindow.postMessage({version:1,instance:s.instance,nonce,type,...extra},s.origin);onmessage=e=>{const m=e.data;if(e.source!==f.contentWindow||e.origin!==s.origin||m.version!==1||m.instance!==s.instance)return;if(m.type==="studio.connecting"){nonce=m.nonce;msg("studio.connect",{ticket:s.ticket});return;}if(m.nonce===nonce)events.push(m);};f.src=s.origin+"/studio/previews/"+s.instance+"/frame";</script>'
          )
      );
      browser = await puppeteer.launch({
        executablePath:
          process.env.STUDIO_TEST_CHROME ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
        args: ['--autoplay-policy=no-user-gesture-required'],
      });
      const page = await browser.newPage();
      if (scenario === 1)
        await page.evaluateOnNewDocument(() => {
          // Observe the actual Web Audio signal already routed to the output in this fixture.
          const connect = AudioNode.prototype.connect;
          window.meters = [];
          AudioNode.prototype.connect = function (target, ...args) {
            if (target === this.context.destination) {
              const analyser = this.context.createAnalyser();
              connect.call(this, analyser);
              window.meters.push(analyser);
            }
            return connect.call(this, target, ...args);
          };
        });

      if (scenario === 'font-error') {
        await page.setRequestInterception(true);
        page.on('request', (req) =>
          req.url().endsWith('.woff2')
            ? req.respond({
                status: 200,
                contentType: 'font/woff2',
                body: Buffer.from('invalid font'),
              })
            : req.continue()
        );
      }
      await page.goto(editorUrl);
      await page.waitForFunction(
        () => events.some((m) => ['studio.ready', 'studio.error'].includes(m.type)),
        { timeout: 20000 }
      );
      if (scenario === 'font-error') {
        expect(await page.evaluate(() => events.find((m) => m.type === 'studio.error')?.code)).toBe(
          'native-font'
        );
        return;
      }
      expect(await page.evaluate(() => events.map((m) => m.type))).toContain('studio.ready');
      const native = page.frames().find((f) => f.url().endsWith('/native/index.html'));
      expect(native).toBeTruthy();
      if (scenario === 1) {
        for (let run = 0; run < 2; run++) {
          await page.evaluate(() => msg('studio.play'));
          await native.waitForFunction(
            () => window.__player.isPlaying() && window.__player.getTime() > 0.35,
            { timeout: 3000 }
          );
          const sample = await native.evaluate(async () => {
            const audio = document.querySelector('audio');
            if (!window.meters.length) {
              const context = new AudioContext();
              await context.resume();
              const src = context.createMediaStreamSource(audio.captureStream());
              const meter = context.createAnalyser();
              src.connect(meter);
              window.meters.push(meter);
              await new Promise((resolve) => setTimeout(resolve, 70));
            }
            return Math.max(
              ...window.meters.map((meter) => {
                const signal = new Float32Array(meter.fftSize);
                meter.getFloatTimeDomainData(signal);
                return Math.max(...signal);
              })
            );
          });
          expect(sample).toBeGreaterThan(0.015);
          await native.waitForFunction(() => !window.__player.isPlaying(), { timeout: 3000 });
          expect(await native.evaluate(() => window.__player.getTime())).toBeGreaterThan(0.95);
          await writeFile(
            join(evidence, 'last-frame-' + run + '.json'),
            JSON.stringify({ peak: sample })
          );
        }
        return;
      }
      if (scenario === 'fractional') {
        const results = [];
        for (const [ms, index] of [
          [967, 29],
          [1000, 30],
          [1034, 31],
          [1000, 30],
        ]) {
          const before = await page.evaluate((ms) => {
            const n = events.length;
            msg('studio.seek', { timeMs: ms });
            return n;
          }, ms);
          await page.waitForFunction(
            (n) => events.slice(n).some((m) => m.type === 'studio.time'),
            {},
            before
          );
          const actual = await native.evaluate(() => {
            const video = [...document.querySelectorAll('video')].find(
              (el) =>
                getComputedStyle(el).visibility !== 'hidden' &&
                getComputedStyle(el).display !== 'none'
            );
            const canvas = document.createElement('canvas');
            canvas.width = canvas.height = 1;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 1, 1);
            return {
              time: window.__player.getTime(),
              pixel: [...ctx.getImageData(0, 0, 1, 1).data],
              video: video.currentTime,
            };
          });
          expect(actual.time).toBeCloseTo(index / 30, 5);
          const [r, g, b] = actual.pixel;
          if (index === 29) expect(g).toBeGreaterThan(b + 55);
          else if (index === 30) expect(b).toBeGreaterThan(r + 100);
          else expect(r).toBeGreaterThan(b + 100);
          results.push({ index, ...actual });
        }
        await writeFile(join(evidence, 'cut-preview.json'), JSON.stringify(results, null, 2));
        return;
      }
      const resource = await native.evaluate(async () => {
        const r = await fetch(document.querySelector('video').src, {
          headers: { Range: 'bytes=0-3' },
        });
        return [r.status, (await r.arrayBuffer()).byteLength];
      });
      expect(resource).toEqual([206, 4]);
      expect(
        (
          await fetch(origin(a) + path + '/session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Origin: previewUrl },
            body: JSON.stringify({ ticket: session.ticket }),
          })
        ).status
      ).toBe(404);
      const visible = () =>
        native.evaluate(() =>
          [...document.querySelectorAll('.clip span')]
            .filter(
              (e) =>
                getComputedStyle(e.parentElement).visibility !== 'hidden' &&
                getComputedStyle(e.parentElement).display !== 'none'
            )
            .map((e) => e.textContent)
        );
      const history = [];
      for (const [ms, boundary, expected, caption] of fps === 25
        ? [
            [40, 'at-or-after', 40, 'Preciso'],
            [1000, 'at-or-after', 1000, 'Segundo'],
            [33, undefined, 0, 'Anterior'],
            [39, 'at-or-after', 40, 'Preciso'],
          ]
        : [
            [32, 'at-or-after', 33, null],
            [1000, 'at-or-after', 1000, 'Segundo'],
            [200, 'at-or-after', 200, 'Preciso'],
            [199, undefined, 167, null],
            [1000, undefined, 1000, 'Segundo'],
            [200, 'at-or-after', 200, 'Preciso'],
          ]) {
        const count = await page.evaluate(
          (ms, boundary) => {
            const n = events.length;
            msg('studio.seek', { timeMs: ms, boundary });
            return n;
          },
          ms,
          boundary
        );
        await page.waitForFunction(
          (n) => events.slice(n).some((m) => m.type === 'studio.time'),
          {},
          count
        );
        const ack = await page.evaluate(
          (n) => events.slice(n).find((m) => m.type === 'studio.time'),
          count
        );
        expect(ack.timeMs).toBe(expected);
        expect(ack.acknowledgedCueStartMs).toBe(boundary ? ms : undefined);
        const captions = await visible();
        const video = await native.evaluate(() => document.querySelector('video').currentTime);
        const clock = await native.evaluate(() => window.__player.getTime());
        expect(clock).toBeCloseTo(Math.round((expected * fps) / 1000) / fps, 6);
        history.push({
          clock,
          ms,
          boundary,
          timeMs: ack.timeMs,
          cue: ack.acknowledgedCueStartMs,
          captions,
          video,
        });
        await writeFile(
          join(evidence, 'reverse-seek-' + fps + '.json'),
          JSON.stringify(history, null, 2)
        );
        expect(captions).toEqual(caption ? [caption] : []);
        expect(Math.abs(video - (0.25 + expected / 1000))).toBeLessThan(0.004);
      }
      await page.evaluate(() => msg('studio.play'));
      await page.waitForFunction(
        () => events.at(-1).type === 'studio.time' && events.at(-1).timeMs > 1050,
        { timeout: 4000 }
      );
      await page.evaluate(() => msg('studio.pause'));
    } finally {
      await browser?.close();
      await api.close();
      a.closeAllConnections();
      b.closeAllConnections();
      a.close();
      b.close();
    }
  },
  60000
);
