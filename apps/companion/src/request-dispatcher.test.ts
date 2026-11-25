import { createServer } from 'node:http';
import { once } from 'node:events';
import { describe, expect, it } from 'vitest';
import { canonicalOrigin, StudioApi } from './api-client';
import { providerEnvironment } from './protocol';
describe('companion client boundary', () => {
  it('keeps only operational provider environment', () => {
    expect(
      providerEnvironment({
        PATH: '/bin',
        HOME: '/home/test',
        BETTER_AUTH_SECRET: 'hidden',
        STUDIO_RENDER_SECRET: 'hidden',
        OPENAI_API_KEY: 'hidden',
        STUDIO_COMPANION_DIR: '/private',
      })
    ).toEqual({ PATH: '/bin', HOME: '/home/test' });
  });
  it('pins a local canonical origin and refuses credential redirects', async () => {
    expect(canonicalOrigin('http://app.video-wizard.localhost:3150')).toBe(
      'http://app.video-wizard.localhost:3150'
    );
    for (const origin of ['https://evil.test', 'http://u@localhost', 'http://localhost/?s=1'])
      expect(() => canonicalOrigin(origin)).toThrow();
    const client = new StudioApi('http://app.video-wizard.localhost:3150');
    await expect(client.call('GET', '//evil.test', 'private')).rejects.toThrow();
  });
});

it('uses the canonical Host on a local connection and stops at a redirect with no credential forwarding', async () => {
  const seen: { host: string | undefined; url: string | undefined }[] = [];
  const server = createServer((req, res) => {
    seen.push({ host: req.headers.host, url: req.url });
    res.writeHead(307, { Location: '/untrusted' });
    res.end();
  }).listen(0, '127.0.0.1');
  try {
    await once(server, 'listening');
    const address = server.address();
    if (!address || typeof address === 'string') throw Error('Missing port');
    const host = 'app.video-wizard.localhost:' + address.port;
    await expect(
      new StudioApi('http://' + host).call('POST', '/api/studio/companion/bind', 'test', {
        provider: 'codex',
      })
    ).rejects.toThrow('307');
    expect(seen).toEqual([{ host, url: '/api/studio/companion/bind' }]);
  } finally {
    await new Promise<void>((done) => server.close(() => done()));
  }
});
