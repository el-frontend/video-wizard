import { serviceKey } from '@workspace/service-auth';
import { installLegacyRoutes } from './legacy-http.js';
import { hostRenderBundle, bundlePublicPath } from './render-bundle-host.js';
import { bundle } from '@remotion/bundler';
import { ensureBrowser } from '@remotion/renderer';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { installStudioRoutes } from './studio-http.js';
import { makeRenderQueue } from './render-queue.js';

const {
  PORT = 3001,
  REMOTION_SERVE_URL,
  RENDERS_DIR = './renders',
  PUBLIC_URL = `http://localhost:${PORT}`,
} = process.env;

/**
 * Sets up the Express application with render endpoints
 */
function setupApp({ remotionBundleUrl }: { remotionBundleUrl: string }) {
  const app = express();

  const rendersDir = path.resolve(RENDERS_DIR);

  // Ensure renders directory exists
  if (!fs.existsSync(rendersDir)) {
    fs.mkdirSync(rendersDir, { recursive: true });
  }

  const secret = process.env.STUDIO_RENDER_SECRET ?? '';
  const queue = makeRenderQueue({ serveUrl: remotionBundleUrl, rendersDir });
  app.use(express.json({ limit: '8mb' }));
  const studio = installStudioRoutes(app, {
    schedule: queue.schedule,
    secret,
    editorOrigin: process.env.STUDIO_EDITOR_ORIGIN || 'http://localhost:3000',
    previewOrigin: process.env.STUDIO_PREVIEW_ORIGIN || PUBLIC_URL,
  });
  installLegacyRoutes(app, queue, secret, rendersDir);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const status =
        error && typeof error === 'object' && 'status' in error ? Number(error.status) : 500;
      res.status([400, 413, 415].includes(status) ? status : 500).end();
    }
  );
  return { app, closeStudio: () => studio.close() };
}

/**
 * Main server initialization
 * Ensures browser is available and bundles Remotion compositions
 */
async function main() {
  serviceKey(process.env.STUDIO_RENDER_SECRET ?? '');
  console.info('🚀 Starting Remotion Render Server...');

  // Ensure browser is installed
  console.info('📦 Ensuring browser is installed...');
  await ensureBrowser({ browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });

  // Bundle Remotion compositions or use pre-bundled URL
  let remotionBundleUrl: string;
  let closeBundle: (() => void) | undefined;

  if (REMOTION_SERVE_URL) {
    console.info('Using the configured Remotion bundle.');
    remotionBundleUrl = REMOTION_SERVE_URL;
  } else {
    console.info('📦 Bundling Remotion compositions...');
    const directory = await bundle({
      publicPath: bundlePublicPath,
      entryPoint: path.resolve('../../packages/remotion-compositions/src/entry.ts'),
      onProgress(progress) {
        console.info(`Bundling progress: ${progress}%`);
      },
    });
    const host = await hostRenderBundle(directory);
    remotionBundleUrl = host.url;
    closeBundle = host.close;
  }

  // Setup Express app
  const { app, closeStudio } = setupApp({ remotionBundleUrl });

  // Start server
  const server = app.listen(Number(PORT), () => {
    console.info(`✅ Server is running on port ${PORT}`);
    console.info(`📹 Ready to accept render jobs at http://localhost:${PORT}/renders`);
  });
  const shutdown = () => {
    closeBundle?.();
    server.close(() => {
      void closeStudio();
    });
  };
  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
