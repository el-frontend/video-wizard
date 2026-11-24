import { it, expect, beforeAll, afterAll, describe } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { componentExample } from '@workspace/video-project';
import { visualContext, libraryKey } from '@workspace/render-contract';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
describe.skipIf(import.meta.env.MODE !== 'r3-journey')(
  'browser host values from edited props',
  () => {
    let browser, remotionHost;
    const project = exampleProject(),
      style = project.styleRef,
      layer = project.scenes[0].layers.find((l) => l.type === 'component');
    const context = visualContext(
      project,
      {
        libraries: {
          [libraryKey(style)]: {
            ...style,
            kind: 'style',
            name: 'Tipo vinculado',
            assetIds: [],
            tokens: { typography: { display: { fontFamily: 'Apariencia Ágil' } } },
          },
        },
        assets: {
          fuente: { mediaType: 'font/woff2', hash: '123', url: '/f' },
          otra: { mediaType: 'font/woff2', hash: '456', url: '/g' },
        },
      },
      layer,
      { ...componentExample('remotion').manifest, assetIds: ['fuente'] },
      0
    );

    const nativeHost = fileURLToPath(
      new URL('../../../packages/hyperframes-compositions/src/native-visual.js', import.meta.url)
    );
    const nativeRequire = createRequire(
      new URL('../../../packages/hyperframes-compositions/package.json', import.meta.url)
    );
    beforeAll(async () => {
      const { chromium } = await import('@playwright/test');
      browser = await chromium.launch({
        executablePath:
          process.env.STUDIO_TEST_CHROME ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      });
      const renderer = createRequire(
        new URL('../../remotion-server/package.json', import.meta.url)
      );
      const { build } = renderer('esbuild');
      const remotionDir = fileURLToPath(
        new URL('../../../packages/remotion-compositions/', import.meta.url)
      );
      remotionHost = (
        await build({
          stdin: {
            contents: 'export { GeneratedVisual } from "./src/compositions/generated-visual"',
            resolveDir: remotionDir,
          },
          write: false,
          bundle: true,
          format: 'iife',
          globalName: 'host',
          jsx: 'automatic',
          define: { 'process.env.NODE_ENV': '"production"' },
        })
      ).outputFiles[0].text;
    });
    afterAll(() => browser?.close());
    async function mount(engine, props) {
      const page = await browser.newPage();
      try {
        if (engine === 'hyperframes') {
          await page.addScriptTag({ path: nativeRequire.resolve('gsap/dist/gsap.min.js') });
          await page.addScriptTag({ path: nativeHost });
        } else await page.addScriptTag({ content: remotionHost });
        return await page.evaluate(
          ({ engine, props, context }) => {
            if (engine === 'remotion') {
              globalThis.__studioVisualModules = {
                ejemplo:
                  ({ createElement }) =>
                  ({ props }) =>
                    createElement('strong', { style: { fontFamily: props.family } }, 'Texto'),
              };
              return host.GeneratedVisual({ sourceHash: 'ejemplo', props, context, timeMs: 500 })
                .props.style.fontFamily;
            }
            globalThis.__studioVisualModules = {
              ejemplo:
                () =>
                ({ root, element, timeline, props }) => {
                  const title = element(root, 'strong', {
                    text: 'Texto',
                    style: { display: 'inline-block', fontFamily: props.family },
                  });
                  timeline.fromTo(title, { x: 0 }, { x: props.x, duration: 1, ease: 'none' }, 0);
                },
            };
            const tl = gsap.timeline({ paused: true });
            mountStudioVisual(document.body, 'ejemplo', props, context, tl, 0);
            tl.seek(0.5);
            const title = document.querySelector('strong');
            return props.measure
              ? Number(gsap.getProperty(title, 'x'))
              : title.style.fontFamily.replaceAll('"', '');
          },
          { engine, props, context }
        );
      } finally {
        await page.close();
      }
    }
    it('validates the tween target before GSAP on independent mounts after a prop edit', async () => {
      for (let i = 0; i < 2; i++) {
        expect(
          await mount('hyperframes', { family: 'sans-serif', x: 80, measure: true })
        ).toBeCloseTo(40);
        await expect(
          mount('hyperframes', { family: 'sans-serif', x: 'random(0,100)', measure: true })
        ).rejects.toThrow(/tween/i);
      }
    });
    it.each(['remotion', 'hyperframes'])(
      'accepts pinned and generic fonts and rejects undeclared font props in %s',
      async (engine) => {
        for (const family of ['Apariencia Ágil', 'StudioAsset123', 'sans-serif'])
          expect(await mount(engine, { family, x: 80 })).toBe(family);
        await expect(mount(engine, { family: 'StudioAsset456', x: 80 })).rejects.toThrow(/fuente/i);
        await expect(mount(engine, { family: 'American Typewriter', x: 80 })).rejects.toThrow(
          /fuente/i
        );
      }
    );
  }
);
