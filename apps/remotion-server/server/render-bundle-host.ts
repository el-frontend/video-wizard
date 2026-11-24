import { randomBytes, createHash } from 'node:crypto';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import type { AddressInfo } from 'node:net';
import { tmpdir } from 'node:os';
import { resolveStudioDataDir, stageOwnedMedia } from '@workspace/render-contract/storage';
import type { LegacyRenderAdmission } from '@workspace/render-contract';
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
  const hashes = Array.from(
    html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi),
    (m) => "'sha256-" + createHash('sha256').update(m[1]!).digest('base64') + "'"
  );
  const policy =
    "default-src 'none'; script-src 'self' " +
    hashes.join(' ') +
    "; style-src 'unsafe-inline' 'self'; img-src 'self' blob: data:; font-src 'self' data:; media-src 'self' blob: data:; connect-src 'self'; worker-src blob: 'self'; base-uri 'none'; form-action 'none'";
  const app = express().disable('x-powered-by');
  app.get(mount + 'index.html', (_req, res) =>
    res
      .set({ 'Cache-Control': 'no-store', 'Content-Security-Policy': policy })
      .type('html')
      .send(html)
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

export async function hostOwnedMedia(
  ownerId: string,
  admission: LegacyRenderAdmission,
  signal: AbortSignal
) {
  const directory = await mkdtemp(join(tmpdir(), 'studio-legacy-'));
  const app = express().disable('x-powered-by');
  const add = async (
    name: string,
    asset: LegacyRenderAdmission['sourceAsset'] | NonNullable<LegacyRenderAdmission['logoAsset']>
  ) => {
    const file = join(directory, name);
    await stageOwnedMedia(resolveStudioDataDir(), ownerId, asset.hash, file, signal);
    const route = '/' + randomBytes(32).toString('hex');
    app.get(route, (_req, res) =>
      res.set('Cache-Control', 'no-store').type(asset.mediaType).sendFile(file)
    );
    return route;
  };
  let server: ReturnType<typeof app.listen> | undefined;
  const close = async () => {
    server?.closeAllConnections();
    if (server?.listening) await new Promise<void>((resolve) => server!.close(() => resolve()));
    await rm(directory, { recursive: true, force: true });
  };
  try {
    const source = await add('source', admission.sourceAsset);
    const logo = admission.logoAsset && (await add('logo', admission.logoAsset));
    signal.throwIfAborted();
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve, reject) => {
      server!.once('listening', resolve);
      server!.once('error', reject);
    });
    signal.throwIfAborted();
    const base = 'http://127.0.0.1:' + (server.address() as AddressInfo).port;
    return {
      inputProps: {
        ...admission.inputProps,
        videoUrl: base + source,
        brandKit: { ...admission.inputProps.brandKit, ...(logo && { logoUrl: base + logo }) },
      },
      close,
    };
  } catch (error) {
    await close();
    throw error;
  }
}
