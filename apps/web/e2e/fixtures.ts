import { test as base, expect, type Page, type BrowserContext } from '@playwright/test';
import { join } from 'node:path';
export { expect };
let cookies: Awaited<ReturnType<BrowserContext['cookies']>> | undefined;
export const test = base.extend<{ studio: Page }>({
  studio: async ({ page }, runTest) => {
    const url = process.env.STUDIO_E2E_URL!;
    if (cookies) {
      await page.context().addCookies(cookies);
    } else {
      await page.goto(url + '/signin');
      const success = await page.evaluate(
        async ({ email, password }) => {
          const r = await fetch('/api/auth/sign-in/email', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, password }),
          });
          return r.ok;
        },
        { email: process.env.STUDIO_E2E_EMAIL, password: process.env.STUDIO_E2E_PASSWORD }
      );
      expect(success).toBe(true);
      cookies = await page.context().cookies();
    }
    await page.goto(url + '/projects');
    await runTest(page);
  },
});
export async function api<T>(page: Page, path: string, method = 'GET', body?: unknown): Promise<T> {
  const result = await page.evaluate(
    async ({ path, method, body }) => {
      const r = await fetch(path, {
        method,
        headers: { 'Content-Type': 'application/json' },
        ...(body !== undefined && { body: JSON.stringify(body) }),
      });
      return { status: r.status, json: await r.json() };
    },
    { path, method, body }
  );
  expect(result.status, JSON.stringify(result.json.error)).toBeLessThan(300);
  return result.json.data;
}
export async function shot(page: Page, name: string, width: number) {
  await page.setViewportSize({ width, height: 900 });
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.screenshot({
    path: join(process.env.STUDIO_E2E_EVIDENCE!, name + '-' + width + '.png'),
  });
}
