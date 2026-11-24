import { describe, expect, it, beforeAll, afterAll } from 'vitest';
import { createRequire } from 'node:module';
import { once } from 'node:events';
import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, readFile, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { componentExample } from '@workspace/video-project';
import { libraryKey } from '@workspace/render-contract';
import { compileProject } from '../../../packages/hyperframes-compositions/src/compiler';
import { compileComponent } from '../../remotion-server/server/component-compiler';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
describe.skipIf(import.meta.env.MODE !== 'r3-journey')(
  'font identity in a compiled native composition',
  () => {
    let browser;
    beforeAll(async () => {
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({
        executablePath:
          process.env.STUDIO_TEST_CHROME ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      });
    });
    afterAll(() => browser?.close());
    it.each(['style', 'brand'])(
      'draws the %s appearance and an edited family with the same pinned face',
      async (kind) => {
        const dir = await mkdtemp(join(tmpdir(), 'native-font-alias-')),
          ownerId = randomUUID(),
          family = 'Apariencia Ágil';
        let server, page;
        try {
          const bytes = await readFile(
            new URL(
              '../../../packages/style-packs/packs/fonts/ArchivoBlack-400.woff2',
              import.meta.url
            )
          );
          const hash = sha(bytes),
            asset = 'archivo',
            store = join(dir, 'data', 'assets', ownerId);
          await mkdir(store, { recursive: true });
          await writeFile(join(store, hash), bytes);
          const extraBytes = await readFile(
            new URL(
              '../../../packages/style-packs/packs/fonts/Geist-variable.woff2',
              import.meta.url
            )
          );
          const extraHash = sha(extraBytes);
          await writeFile(join(store, extraHash), extraBytes);
          const ex = componentExample('hyperframes');
          ex.manifest.assetIds = ['extra'];
          ex.manifest.initialProps.title = 'sans-serif';
          ex.manifest.exposedRoles = ['typography.display.fontFamily', 'typography.display.weight'];
          const source =
            'export default function Title({root,element,props,context}) { element(root,"strong",{text:"Familia de prop",style:{fontFamily:props.title}}); element(root,"span",{text:"Familia de contexto",style:{fontFamily:context.appearance.family}}); element(root,"p",{text:"Fuente propia",style:{fontFamily:context.assets.extra.fontFamily || context.appearance.family}}); }';
          const sealed = await compileComponent({ ...ex, files: { [ex.manifest.entry]: source } }),
            bundle = Buffer.from(JSON.stringify(sealed));
          const pin = { id: 'candidato', version: 1 },
            catalogPin = { id: 'apariencia', version: 1 };
          const tokens = { typography: { display: { fontFamily: family, weight: 400 } } };
          const binding = { family, assetId: asset, weight: { min: 400, max: 400 } };
          const library = {
            ...catalogPin,
            kind,
            name: 'Apariencia vinculada',
            assetIds: [asset],
            fonts: [binding, { ...binding, family: 'Fuente ajena' }],
            ...(kind === 'style'
              ? {
                  tokens,
                  family: { id: 'noticias-modern-editorial', version: 1 },
                  engines: ['hyperframes'],
                }
              : { values: tokens }),
          };
          const layer = {
            id: 'titulo',
            type: 'component',
            componentRef: pin,
            props: { title: family },
            visible: true,
            zIndex: 0,
            startMs: 0,
            endMs: 800,
            endAnchor: 'fixed',
            box: { x: 0, y: 0, width: 320, height: 180 },
          };
          const document = {
            schemaVersion: 1,
            id: randomUUID(),
            title: 'Prueba de tipografía',
            engine: 'hyperframes',
            canvas: { width: 320, height: 180, fps: 25 },
            styleRef: kind === 'style' ? catalogPin : null,
            brandSnapshot: kind === 'brand' ? { ref: catalogPin, values: tokens } : null,
            assetIds: [],
            globalAudio: [],
            durationMs: 800,
            scenes: [{ id: 'inicio', durationMs: 800, layers: [layer] }],
          };
          const snapshot = {
            ownerId,
            revision: randomUUID(),
            document,
            diagnostics: [],
            bundles: {
              [libraryKey(pin)]: { base64: bundle.toString('base64'), sha256: sha(bundle) },
            },
            dependencies: {
              assets: {
                extra: {
                  id: 'extra',
                  name: 'Geist',
                  mediaType: 'font/woff2',
                  hash: extraHash,
                  url: 'media/' + extraHash + '.woff2',
                },
                [asset]: {
                  id: asset,
                  name: 'Archivo Black',
                  mediaType: 'font/woff2',
                  hash,
                  url: 'media/' + hash + '.woff2',
                },
              },
              libraries: {
                [libraryKey(catalogPin)]: library,
                [libraryKey(pin)]: {
                  ...pin,
                  kind: 'component',
                  engine: 'hyperframes',
                  name: 'Título',
                  assetIds: ex.manifest.assetIds,
                  manifest: ex.manifest,
                },
              },
            },
          };
          const express = createRequire(
              new URL('../../remotion-server/package.json', import.meta.url)
            )('express'),
            app = express();
          async function compile(version) {
            const output = join(dir, version);
            await compileProject(snapshot, output, { dataDir: join(dir, 'data'), preview: true });
            app.use('/' + version, express.static(join(output, 'native')));
          }
          await compile('correcto');
          server = app.listen(0, '127.0.0.1');
          await once(server, 'listening');
          page = await browser.newPage();
          const errors = [];
          page.on('pageerror', (e) => errors.push(e.message));
          const fontResponse = page.waitForResponse((r) => r.url().endsWith(hash + '.woff2'));
          const extraResponse = page.waitForResponse((r) => r.url().endsWith(extraHash + '.woff2'));
          const origin = 'http://127.0.0.1:' + server.address().port;
          await page.goto(origin + '/correcto/index.html');
          expect(sha(await (await fontResponse).body())).toBe(hash);
          expect(sha(await (await extraResponse).body())).toBe(extraHash);
          await page.evaluate(() => document.fonts.ready);
          expect(errors).toEqual([]);
          const rendered = await page.evaluate(() => {
            const nodes = [
              ...document.querySelectorAll(
                '[data-module] strong,[data-module] span,[data-module] p'
              ),
            ];
            return {
              families: nodes.map((node) => getComputedStyle(node).fontFamily),
              loaded: [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family),
            };
          });
          expect(rendered.families).toHaveLength(3);
          expect(rendered.families[2]).toBe('StudioAsset' + extraHash);
          expect(rendered.loaded).toContain(rendered.families[2]);
          expect(rendered.families[0]).toBe(rendered.families[1]);
          expect(rendered.loaded).toContain(rendered.families[0]);
          const cdp = await page.context().newCDPSession(page);
          await cdp.send('DOM.enable');
          await cdp.send('CSS.enable');
          const { root } = await cdp.send('DOM.getDocument');
          for (const [selector, postScriptName] of [
            ['[data-module] strong', 'ArchivoBlack-Regular'],
            ['[data-module] span', 'ArchivoBlack-Regular'],
            ['[data-module] p', 'Geist-Regular'],
          ]) {
            const { nodeId } = await cdp.send('DOM.querySelector', {
              nodeId: root.nodeId,
              selector,
            });
            const { fonts } = await cdp.send('CSS.getPlatformFontsForNode', { nodeId });
            const used = fonts.find((f) => f.isCustomFont && f.postScriptName === postScriptName);
            expect(used?.glyphCount).toBeGreaterThan(0);
          }
          for (const [i, bad] of ['Fuente ajena', 'American Typewriter'].entries()) {
            errors.length = 0;
            layer.props.title = bad;
            const variant = 'rechazo-' + i;
            await compile(variant);
            await page.goto(origin + '/' + variant + '/index.html');
            expect(errors).toContain('La fuente del componente no está declarada.');
          }
        } finally {
          await page?.close();
          if (server) {
            server.closeAllConnections();
            await new Promise((ok) => server.close(ok));
          }
          await rm(dir, { recursive: true, force: true });
        }
      },
      30000
    );
  }
);
