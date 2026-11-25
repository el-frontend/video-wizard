import { expect, test, shot, api } from './fixtures';
test('imports a registered episode into its native preview, selects captions and inspects a layer', async ({
  studio: page,
}) => {
  await page.addInitScript(() =>
    window.addEventListener('message', (e) => {
      if (['studio.ready', 'studio.error'].includes(e.data?.type))
        document.documentElement.dataset.preview = e.data.type;
      if (e.data?.type === 'studio.time')
        document.documentElement.dataset.time = String(e.data.timeMs);
    })
  );
  await page.getByRole('button', { name: 'Importar al diseñador' }).click();
  await page.waitForURL('**/designer/**');
  // Install the observer before the native frame connects on a fresh navigation.
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-preview', 'studio.ready', {
    timeout: 45000,
  });
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect
    .poll(() => page.locator('html').getAttribute('data-time').then(Number))
    .toBeGreaterThan(250);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('slider', { name: 'Posición de reproducción' }).click();
  await expect
    .poll(() => page.locator('html').getAttribute('data-time').then(Number))
    .toBeGreaterThan(50);
  await page.getByRole('button', { name: /Primera escena.*Z/ }).click();
  await expect(page.getByRole('heading', { name: 'Inspector de capa' })).toBeVisible();
  await page.getByRole('button', { name: /Subtítulos.*Z/ }).click();
  await expect(page.getByRole('region', { name: 'Editor de subtítulos' })).toContainText(
    'Subtítulo técnico'
  );
  await shot(page, 'native-import', 1280);
});

test('previews the registered operator demo with its verified style and single master track', async ({
  studio: page,
}) => {
  test.skip(
    !process.env.STUDIO_DEMO_ROOT,
    'Requires a read-only operator-selected Motion Studio source.'
  );
  await api(page, '/api/studio/catalog', 'POST', {});
  page.on('response', async (response) => {
    if (
      response.request().method() !== 'POST' ||
      !response.url().endsWith('/preview') ||
      response.ok()
    )
      return;
    const reason = await response.json().catch(() => ({}));
    console.info(
      'Operator preview rejection',
      response.status(),
      (reason.diagnostics ?? []).map((d: { code: string; message: string }) => [d.code, d.message])
    );
  });
  await page.addInitScript(() =>
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'studio.ready') document.documentElement.dataset.ready = 'yes';
      if (e.data?.type === 'studio.time')
        document.documentElement.dataset.time = String(e.data.timeMs);
    })
  );
  await page.getByLabel('Fuente de Motion Studio').selectOption('demo-registrada');
  await page.getByRole('button', { name: 'Importar al diseñador' }).click();
  await page.waitForURL('**/designer/**');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'yes', { timeout: 60000 });
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect
    .poll(() => page.locator('html').getAttribute('data-time').then(Number))
    .toBeGreaterThan(1000);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page
    .getByRole('region', { name: 'Capas de la escena' })
    .getByRole('button', { name: /Subtítulos.*Z/ })
    .click();
  await page.locator('.studio-stage').scrollIntoViewIfNeeded();
  await shot(page, 'real-motion-demo', 1440);
});

test('opens an owned legacy job through the explicit designer bridge and keeps unproven jobs in recovery', async ({
  studio: page,
}) => {
  await page.goto(process.env.STUDIO_E2E_URL + '/editor/' + process.env.STUDIO_E2E_JOB);
  await page.getByRole('button', { name: 'Abrir este trabajo en el diseñador' }).click();
  await page.waitForURL('**/designer/**');
  const path = new URL(page.url()).pathname.replace('/designer/', '/api/studio/projects/');
  const { document: d } = await api<import('@workspace/video-project').ProjectRecord>(page, path);
  expect(d.engine).toBe('remotion');
  expect(d.durationMs).toBe(1000);
  expect(d.assetIds).toContain(process.env.STUDIO_E2E_ASSET);
  expect(d.scenes[0]?.layers.find((l) => l.type === 'captions')?.cues[0]).toMatchObject({
    startMs: 100,
    endMs: 800,
    words: [
      { text: 'Una', startMs: 0, endMs: 250 },
      { text: 'prueba', startMs: 250, endMs: 700 },
    ],
  });
  await page.goto(process.env.STUDIO_E2E_URL + '/editor/' + process.env.STUDIO_E2E_UNPROVEN);
  await expect(page.getByRole('link', { name: 'Importar video' })).toBeVisible();
  await expect(
    page.getByRole('button', { name: 'Abrir este trabajo en el diseñador' })
  ).toHaveCount(0);
  const status = await page.evaluate(
    async (id) =>
      (
        await fetch('/api/studio/imports', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ kind: 'legacy-job', sourceId: id }),
        })
      ).status,
    process.env.STUDIO_E2E_UNPROVEN
  );
  expect(status).toBe(400);
});
test('preserves a flat original as view-only media', async ({ studio: page }) => {
  await page.getByLabel('Fuente de Motion Studio').selectOption('archivo-original');
  await page.getByRole('button', { name: 'Importar al diseñador' }).click();
  await expect(
    page.getByRole('heading', { name: 'Archivo original · Solo lectura' })
  ).toBeVisible();
  await expect(page.getByLabel('Reproducir archivo original')).toBeVisible();
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).duration))
    .toBe(1);
  await page.locator('video').evaluate(async (element) => {
    const v = element as HTMLVideoElement;
    v.muted = true;
    await v.play();
  });
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).currentTime))
    .toBeGreaterThan(0.15);
  await page.locator('video').evaluate((v) => {
    (v as HTMLVideoElement).pause();
    (v as HTMLVideoElement).currentTime = 0.5;
  });
  await expect
    .poll(() => page.locator('video').evaluate((v) => (v as HTMLVideoElement).readyState))
    .toBeGreaterThan(1);
  await expect(page.getByLabel('Título del proyecto')).toHaveCount(0);
  await shot(page, 'original', 1024);
});

test('repairs a missing take in the same manually edited project', async ({ studio: page }) => {
  await page.getByLabel('Fuente de Motion Studio').selectOption('toma-pendiente');
  await page.getByRole('button', { name: 'Importar al diseñador' }).click();
  await page.waitForURL('**/designer/**');
  const path = new URL(page.url()).pathname.replace('/designer/', '/api/studio/projects/');
  await page.getByLabel('Título del proyecto').fill('Mi edición de la toma');
  await page.getByRole('button', { name: 'Guardar', exact: true }).click();
  const chooser = page.getByRole('combobox', { name: /Reemplazar · Falta la toma/ });
  await expect(chooser).toBeEnabled();
  await expect(chooser.getByRole('option', { name: 'audio-tecnico.wav' })).toBeAttached();
  await shot(page, 'repair', 1024);
  const before = await api<import('@workspace/video-project').ProjectRecord>(page, path);
  await chooser.selectOption(process.env.STUDIO_E2E_AUDIO!);
  await expect(page.getByText('Reemplazado', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Título del proyecto')).toHaveValue('Mi edición de la toma');
  const after = await api<import('@workspace/video-project').ProjectRecord>(page, path);
  expect(after.revision).not.toBe(before.revision);
  expect(after.document.id).toBe(before.document.id);
  expect(after.document.scenes[0]?.durationMs).toBe(2000);
  expect(after.document.scenes[0]?.layers.find((l) => l.type === 'audio')).toMatchObject({
    startMs: 200,
    endMs: 1200,
    assetId: process.env.STUDIO_E2E_AUDIO,
  });
});
