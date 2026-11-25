import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { expect, it, vi } from 'vitest';
import { workspacePage } from '@/server/auth/page-policy';
const { auth, redirect } = vi.hoisted(() => ({
  auth: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error('redirección');
  }),
}));
vi.mock('@/auth', () => ({ auth }));
vi.mock('next/navigation', () => ({ redirect }));
vi.mock('../components/workspace-shell', () => ({ WorkspaceShell: () => null }));
it('allFunctionalPagesRequireSession', () => {
  const pages = readdirSync('app', { recursive: true, encoding: 'utf8' }).filter((file) =>
    file.endsWith('page.tsx')
  );
  expect(
    pages
      .filter((file) => !readFileSync(join('app', file), 'utf8').includes('workspacePage('))
      .sort()
  ).toEqual(['signin/page.tsx', 'signup/page.tsx']);
});

it('resolves the owner before private reads and preserves repeated local query parameters', async () => {
  const render = vi.fn(() => 'contenido');
  const page = workspacePage('/designer/[id]', render);
  const props = {
    params: Promise.resolve({ id: 'uno dos' }),
    searchParams: Promise.resolve({ tab: ['a', 'b'], view: 'editor' }),
  };
  auth.mockResolvedValueOnce(null);
  await expect(page(props)).rejects.toThrow('redirección');
  expect(render).not.toHaveBeenCalled();
  expect(redirect).toHaveBeenCalledWith(
    '/signin?callbackUrl=' + encodeURIComponent('/designer/uno%20dos?tab=a&tab=b&view=editor')
  );
  const user = { id: 'owner', email: 'test@private.test', name: null, image: null };
  auth.mockResolvedValueOnce({ user, session: { id: 'session-id' } });
  const result = await page(props);
  expect(render).toHaveBeenCalledWith(user, props);
  expect(result.props.user).toBe(user);
  expect(result.props.sessionId).toBe('session-id');
});
