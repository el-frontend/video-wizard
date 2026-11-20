import { randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import express from 'express';

export const bundlePublicPath = '/studio-build/';

/** Remotion's directory server binds all interfaces. Only its export browser needs these bytes. */
export async function hostRenderBundle(directory: string) {
  const mount = '/' + randomBytes(24).toString('hex') + '/';
  const html = (await readFile(join(directory, 'index.html'), 'utf8')).replaceAll(
    bundlePublicPath,
    mount
  );
  const app = express().disable('x-powered-by');
  app.get(mount + 'index.html', (_req, res) =>
    res.set('Cache-Control', 'no-store').type('html').send(html)
  );
  app.use(mount, express.static(directory, { dotfiles: 'deny', index: false }));
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve, reject) => {
    server.once('listening', resolve);
    server.once('error', reject);
  });
  const port = (server.address() as AddressInfo).port;
  return {
    url: 'http://127.0.0.1:' + port + mount + 'index.html',
    close: () => {
      server.closeAllConnections();
      server.close();
    },
  };
}
