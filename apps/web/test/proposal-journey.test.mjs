import { it, expect } from 'vitest';
import { createServer } from 'node:net';
import { mkdtemp, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { randomBytes, randomUUID } from 'node:crypto';
import { authFixture } from '../server/auth/auth-test-fixture';
import { componentExample } from '@workspace/video-project';

it.skipIf(import.meta.env.MODE !== 'r3-journey')(
  'reviews, previews, applies and publishes in the authenticated designer',
  async () => {
    const { chromium } = await import('@playwright/test');
    const { installStudioRoutes } = await import('../../remotion-server/server/studio-http');
    const express = createRequire(new URL('../../remotion-server/package.json', import.meta.url))(
      'express'
    );
    const app = express(),
      http = app.listen(0, '127.0.0.1'),
      reserve = createServer().listen(0, '127.0.0.1');
    await Promise.all([once(http, 'listening'), once(reserve, 'listening')]);
    const port = reserve.address().port,
      renderPort = http.address().port;
    await new Promise((ok) => reserve.close(ok));
    const origin = 'http://app.video-wizard.localhost:' + port,
      renderer = 'http://127.0.0.1:' + renderPort,
      preview = 'http://preview.video-wizard.localhost:' + renderPort;
    const secret = randomBytes(40).toString('hex'),
      fixture = await authFixture(),
      space = await mkdtemp(join(tmpdir(), 'r3-browser-')),
      dataDir = join(space, 'data');
    await mkdir(dataDir);
    const api = installStudioRoutes(app, {
      secret,
      editorOrigin: origin,
      previewOrigin: preview,
      dataDir,
    });
    let browser, child;
    try {
      child = spawn(
        process.execPath,
        [
          createRequire(import.meta.url).resolve('next/dist/bin/next'),
          'start',
          '--port',
          String(port),
          '--hostname',
          '127.0.0.1',
        ],
        {
          stdio: 'ignore',
          env: {
            ...process.env,
            DATABASE_URL: fixture.connectionString,
            BETTER_AUTH_URL: origin,
            BETTER_AUTH_SECRET: randomBytes(48).toString('hex'),
            STUDIO_RENDER_SECRET: secret,
            STUDIO_EDITOR_ORIGIN: origin,
            STUDIO_PREVIEW_ORIGIN: preview,
            REMOTION_SERVER_URL: renderer,
            STUDIO_DATA_DIR: dataDir,
          },
        }
      );
      browser = await chromium.launch({
        executablePath:
          process.env.STUDIO_TEST_CHROME ||
          '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
        headless: true,
      });
      const page = await browser.newPage();
      await expect
        .poll(
          async () => {
            try {
              return (await fetch('http://127.0.0.1:' + port + '/signin')).status;
            } catch {
              return 0;
            }
          },
          { timeout: 25000 }
        )
        .toBe(200);
      await page.goto(origin + '/signin');
      const request = (url, body, method = body ? 'POST' : 'GET') =>
        page.evaluate(
          async ({ url, body, method }) => {
            const r = await fetch(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: body ? JSON.stringify(body) : undefined,
            });
            const result = await r.json();
            if (!r.ok) throw Error(r.status + ' ' + JSON.stringify(result));
            return result.data ?? result;
          },
          { url, body, method }
        );
      await request('/api/auth/sign-up/email', {
        name: 'Prueba R3',
        email: randomUUID() + '@example.test',
        password: randomBytes(24).toString('hex'),
      });
      for (const engine of ['remotion', 'hyperframes']) {
        const project = await request('/api/studio/projects', {
          title: 'Revisión R3 ' + engine,
          engine,
          canvas: { width: 320, height: 180, fps: 25 },
        });
        const path = '/api/studio/projects/' + project.document.id + '/proposals',
          ex = componentExample(engine);
        const input = {
          ...ex,
          kind: 'component',
          name: 'Título ' + engine,
          engine,
          requestId: randomUUID(),
          baseRevision: project.revision,
          commands: [
            {
              type: 'add-scene',
              scene: {
                id: 'inicio',
                durationMs: 800,
                layers: [
                  {
                    id: 'overlay',
                    type: 'component',
                    componentRef: { id: '$candidate', version: 1 },
                    props: ex.manifest.initialProps,
                    visible: true,
                    zIndex: 0,
                    startMs: 25,
                    endMs: 680,
                    endAnchor: 'fixed',
                    box: { x: 8, y: 12, width: 300, height: 120 },
                  },
                ],
              },
            },
          ],
        };
        const stage = await request(path, input);
        expect(stage.diagnostics).toEqual([]);
        const row = await request(path + '/' + stage.proposalId);
        expect(row.samples.length).toBeGreaterThan(0);
        const sampleUrl = path + '/' + row.id + '/samples/' + row.samples[0].frame;
        expect(
          await page.evaluate(
            async (url) => (await fetch(url)).headers.get('content-type'),
            sampleUrl
          )
        ).toBe('image/png');
        const privateResponse = await page.evaluate(
          async (url) => (await fetch(url, { credentials: 'omit' })).status,
          sampleUrl
        );
        expect(privateResponse).toBe(401);
        await page.goto(origin + '/designer/' + project.document.id);
        await page.getByText('Revisar propuestas', { exact: true }).click();
        await page.getByLabel('Propuesta', { exact: true }).selectOption(row.id);
        await page.getByRole('button', { name: 'Previsualizar propuesta' }).click();
        await page.getByRole('button', { name: 'Reproducir propuesta' }).click({ timeout: 20000 });
        await page.getByRole('button', { name: 'Pausar propuesta' }).click();
        await page.screenshot({ path: join(space, engine + '-review.png') });
        await page.getByRole('button', { name: 'Aplicar propuesta' }).click();
        await page.getByRole('button', { name: 'Guardar en biblioteca' }).waitFor();
        expect(
          (await request('/api/studio/libraries/component?engine=' + engine)).find(
            (e) => e.id === row.candidate.id
          )
        ).toBeUndefined();
        await page.getByRole('button', { name: 'Guardar en biblioteca' }).click();
        await page.getByText('Versión guardada en biblioteca.').waitFor();
        expect(
          await request('/api/studio/libraries/component?engine=' + engine + '&verified=1')
        ).toContainEqual(expect.objectContaining({ id: row.candidate.id, version: 1 }));
        if (engine === 'remotion') {
          const projectUrl = '/api/studio/projects/' + project.document.id;
          const applied = await request(projectUrl);
          const recoverable = {
            ...input,
            requestId: randomUUID(),
            baseRevision: applied.revision,
            manifest: { ...ex.manifest, dependencies: ['gsap'] },
          };
          const rejection = await request(path, recoverable);
          expect(rejection.diagnostics[0].message).toContain('manifest.dependencies');
          const recover = await request(path + '/' + rejection.proposalId);
          expect(recover).toMatchObject({
            status: 'invalid',
            input: { files: ex.files, manifest: recoverable.manifest },
          });
          expect(await request(projectUrl)).toEqual(applied);
          expect((await request(path + '/' + row.id)).moduleHash).toBe(row.moduleHash);
          const eight = await request('/api/studio/projects', {
            title: 'Ocho componentes',
            engine,
            canvas: { width: 320, height: 180, fps: 25 },
          });
          const id = eight.document.id,
            endpoint = '/api/studio/projects/' + id;
          const layer = (i, componentRef) => ({
            ...input.commands[0].scene.layers[0],
            id: 'capa-' + i,
            componentRef,
            startMs: (5 + 20 * i) * 40,
            endMs: (15 + 20 * i) * 40,
          });
          const old = Array.from({ length: 7 }, (_, i) =>
            layer(i, { id: row.candidate.id, version: 1 })
          );
          const base = await request(
            endpoint,
            {
              baseRevision: eight.revision,
              document: {
                ...eight.document,
                durationMs: 8000,
                scenes: [{ id: 'montaje', durationMs: 8000, layers: old }],
              },
            },
            'PUT'
          );
          const eighth = await request(endpoint + '/proposals', {
            ...input,
            requestId: randomUUID(),
            baseRevision: base.revision,
            commands: [
              {
                type: 'add-layer',
                sceneId: 'montaje',
                layer: layer(7, { id: '$candidate', version: 1 }),
              },
            ],
          });
          expect(eighth.diagnostics).toEqual([]);
          const detail = await request(endpoint + '/proposals/' + eighth.proposalId);
          expect(detail.samples.some((s) => s.frame >= 145 && s.frame < 155)).toBe(true);
          const mixed = await request('/api/studio/projects', {
            title: 'Contexto mixto',
            engine,
            canvas: { width: 320, height: 180, fps: 25 },
          });
          const mixedPath = '/api/studio/projects/' + mixed.document.id + '/proposals';
          const a = { ...input.commands[0].scene.layers[0], id: 'A', startMs: 800, endMs: 1200 };
          const aStage = await request(mixedPath, {
            ...input,
            requestId: randomUUID(),
            baseRevision: mixed.revision,
            files: {
              [ex.manifest.entry]:
                'export default function Title({context,timeMs,props}) { if(context.canvas.width < context.canvas.height && timeMs > 80 && timeMs < 300) {return <img assetId="imagen-ausente"/>;} return <strong>{props.title}</strong>; }',
            },
            commands: [
              { type: 'add-scene', scene: { id: 'mixed', durationMs: 4000, layers: [a] } },
            ],
          });
          expect(aStage.diagnostics).toEqual([]);
          const aApplied = await request(mixedPath + '/' + aStage.proposalId + '/apply', {
            baseRevision: mixed.revision,
          });
          const b = { ...a, id: 'B', startMs: 2200, endMs: 2600 };
          const vertical = await request(mixedPath, {
            ...input,
            requestId: randomUUID(),
            baseRevision: aApplied.revision,
            commands: [
              { type: 'set-canvas', canvas: { width: 180, height: 320, fps: 25 } },
              { type: 'add-layer', sceneId: 'mixed', layer: b },
            ],
          });
          expect(vertical.diagnostics).toContainEqual(
            expect.objectContaining({ code: 'component-mount', severity: 'error' })
          );
          expect((await request(mixedPath + '/' + vertical.proposalId)).status).toBe('invalid');
        }
      }
      console.info('Evidencia R3', space);
    } finally {
      await browser?.close();
      if (child && !child.exitCode) {
        child.kill('SIGTERM');
      }
      await api.close();
      http.closeAllConnections();
      await new Promise((ok) => http.close(ok));
      await fixture.close();
    }
  },
  160000
);
