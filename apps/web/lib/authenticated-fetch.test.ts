// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { authenticatedFetch, bindWorkspaceSession, clearAccessToken } from './authenticated-fetch';
const { token } = vi.hoisted(() => ({ token: vi.fn() }));
vi.mock('./auth-client', () => ({ authClient: { token } }));
const jwt = (sub = 'owner', exp = Date.now() / 1000 + 900) =>
  'h.' + btoa(JSON.stringify({ exp, sub, sid: 'session' })) + '.s';
const fetcher = vi.fn<typeof fetch>();
beforeEach(() => {
  bindWorkspaceSession('owner', 'session');
  clearAccessToken();
  token.mockReset().mockResolvedValue({ data: { token: jwt() } });
  vi.stubGlobal(
    'fetch',
    fetcher.mockReset().mockImplementation(async () => new Response(null))
  );
});
afterEach(() => vi.unstubAllGlobals());
it('jwtFetchPreservesAbortBodyHeadersAndSingleFlightsToken', async () => {
  const controller = new AbortController();
  const request = new Request(location.origin + '/api/work', {
    method: 'PUT',
    body: 'abc',
    headers: { 'x-one': '1' },
  });
  await Promise.all([
    authenticatedFetch(request, { signal: controller.signal, headers: { 'x-two': '2' } }),
    authenticatedFetch('/api/work'),
  ]);
  expect(token).toHaveBeenCalledTimes(1);
  const sent = fetcher.mock.calls.find(([input]) => input instanceof Request)!;
  expect(sent[0]).toBe(request);
  expect(sent[1]?.signal).toBe(controller.signal);
  expect(await request.text()).toBe('abc');
  const headers = new Headers(sent[1]?.headers);
  expect(headers.get('x-one')).toBe('1');
  expect(headers.get('x-two')).toBe('2');
  expect(headers.get('Authorization')).toMatch(/^Bearer /);
});
it('jwtFetchNeverSendsCredentialsCrossOrigin', async () => {
  await expect(authenticatedFetch('https://other.test/')).rejects.toThrow();
  expect(token).not.toHaveBeenCalled();
  expect(fetcher).not.toHaveBeenCalled();
  await authenticatedFetch('/api/work', { redirect: 'follow', credentials: 'include' });
  expect(fetcher.mock.calls[0]?.[1]).toMatchObject({
    redirect: 'error',
    credentials: 'same-origin',
  });
});
it('reauthDoesNotReplayUnknownMutation', async () => {
  fetcher.mockResolvedValueOnce(new Response(null, { status: 401 }));
  expect((await authenticatedFetch('/api/work', { method: 'POST', body: 'once' })).status).toBe(
    401
  );
  expect(fetcher).toHaveBeenCalledTimes(1);
});
it('never sends old work with a token for a different user', async () => {
  token.mockResolvedValueOnce({ data: { token: jwt('other') } });
  expect((await authenticatedFetch('/api/work', { method: 'PUT' })).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('discards a late token acquisition after the workspace changes', async () => {
  let finish!: (result: unknown) => void;
  token.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      })
  );
  const pending = authenticatedFetch('/api/work', { method: 'PUT' });
  bindWorkspaceSession('other', 'new-session');
  finish({ data: { token: jwt() } });
  expect((await pending).status).toBe(401);
  expect(fetcher).not.toHaveBeenCalled();
});
it('reacquires a nearly expired token and leaves an aborted request unsent', async () => {
  token.mockResolvedValueOnce({ data: { token: jwt('owner', Date.now() / 1000 + 10) } });
  await authenticatedFetch('/api/work');
  await authenticatedFetch('/api/work');
  expect(token).toHaveBeenCalledTimes(2);
  await expect(authenticatedFetch('/api/work', { signal: AbortSignal.abort() })).rejects.toThrow();
  expect(fetcher).toHaveBeenCalledTimes(2);
});
it('cancels one waiter immediately without cancelling the shared token request', async () => {
  let release!: (value: unknown) => void;
  token.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        release = resolve;
      })
  );
  const abort = new AbortController();
  const first = authenticatedFetch('/api/one', { signal: abort.signal });
  const second = authenticatedFetch('/api/two');
  abort.abort();
  await expect(first).rejects.toThrow();
  release({ data: { token: jwt() } });
  expect((await second).ok).toBe(true);
  expect(token).toHaveBeenCalledTimes(1);
  expect(fetcher).toHaveBeenCalledTimes(1);
});
