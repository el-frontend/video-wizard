import type { ProjectRecord } from '@workspace/video-project';
import { test, expect, api, shot } from './fixtures';
test('plays and seeks an editable Remotion project with captions and an inspector', async ({
  studio: page,
}) => {
  const created = await api<ProjectRecord>(page, '/api/studio/projects', 'POST', {
    title: 'Montaje técnico',
    engine: 'remotion',
  });
  const timing = {
    startMs: 0,
    endMs: 3000,
    visible: true,
    endAnchor: 'scene-end',
    box: { x: 50, y: 80, width: 750, height: 320 },
  };
  const scene = {
    id: 'scene',
    durationMs: 3000,
    layers: [
      { ...timing, id: 'title', type: 'text', text: 'Titular de prueba', zIndex: 0 },
      {
        ...timing,
        id: 'captions',
        type: 'captions',
        box: { x: 80, y: 1240, width: 860, height: 320 },
        zIndex: 1,
        cues: [{ id: 'cue', startMs: 100, endMs: 2800, text: 'Palabras de prueba' }],
      },
    ],
  };
  await api(page, '/api/studio/projects/' + created.document.id, 'PUT', {
    baseRevision: created.revision,
    document: { ...created.document, durationMs: 3000, scenes: [scene] },
  });
  await page.addInitScript(() =>
    window.addEventListener('message', (e) => {
      if (e.data?.type === 'studio.ready') document.documentElement.dataset.ready = 'yes';
      if (e.data?.type === 'studio.time')
        document.documentElement.dataset.time = String(e.data.timeMs);
    })
  );
  await page.goto(process.env.STUDIO_E2E_URL + '/designer/' + created.document.id);
  await expect(page.locator('html')).toHaveAttribute('data-ready', 'yes', { timeout: 45000 });
  await page.getByRole('button', { name: 'Reproducir', exact: true }).click();
  await expect
    .poll(() => page.locator('html').getAttribute('data-time').then(Number))
    .toBeGreaterThan(250);
  await page.getByRole('button', { name: 'Pausar', exact: true }).click();
  await page.getByRole('slider', { name: 'Posición de reproducción' }).click();
  await expect
    .poll(() => page.locator('html').getAttribute('data-time').then(Number))
    .toBeGreaterThan(50);
  await page.getByRole('button', { name: /Subtítulos.*Z/ }).click();
  await expect(page.getByRole('region', { name: 'Editor de subtítulos' })).toContainText(
    'Palabras de prueba'
  );
  await expect(page.getByRole('heading', { name: 'Inspector de capa' })).toBeVisible();
  await shot(page, 'remotion-captions', 1280);
});
