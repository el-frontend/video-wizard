import type { ProjectRecord } from '@workspace/video-project';
import { test, expect, api, shot } from './fixtures';
test('recovers a local draft after reload, compares the remote head, saves a separate copy and restores a historic revision', async ({
  studio: page,
}) => {
  const p = await api<ProjectRecord>(page, '/api/studio/projects', 'POST', {
    title: 'Edición inicial',
    engine: 'remotion',
  });
  const path = '/api/studio/projects/' + p.document.id,
    url = process.env.STUDIO_E2E_URL + '/designer/' + p.document.id;
  await page.goto(url);
  // Keep the local debounce pending while a second writer advances the authenticated API.
  await page.getByLabel('Título del proyecto').fill('Mi borrador local');
  await api(page, path, 'PUT', {
    baseRevision: p.revision,
    document: { ...p.document, title: 'Edición remota' },
  });
  await expect(page.getByRole('region', { name: 'Comparar revisiones' })).toContainText(
    'Edición remota'
  );
  page.on('dialog', (d) => d.accept());
  await page.reload();
  await page.getByRole('button', { name: 'Recuperar borrador' }).click();
  await expect(page.getByLabel('Título del proyecto')).toHaveValue('Mi borrador local');
  await shot(page, 'conflict', 800);
  await shot(page, 'conflict', 1024);
  await page.getByRole('button', { name: 'Guardar borrador como copia' }).click();
  await expect(page).not.toHaveURL(url);
  await expect(page.getByLabel('Título del proyecto')).toHaveValue('Mi borrador local');
  const head = await api<ProjectRecord>(page, path);
  expect(head.document.title).toBe('Edición remota');
  await page.goto(url);
  await page.getByText('Historial de revisiones', { exact: true }).click();
  await expect(page.getByRole('button', { name: 'Restaurar revisión 2' })).toBeVisible();
  await shot(page, 'history', 1440);
  await page.getByRole('button', { name: 'Restaurar revisión 2' }).click();
  await expect(page.getByLabel('Título del proyecto')).toHaveValue('Edición inicial');
  expect((await api<ProjectRecord>(page, path)).revision).not.toBe(p.revision);
});
