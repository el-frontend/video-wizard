import { serviceKey } from '@workspace/service-auth';
import { rendererApp } from './renderer-app.js';
import { hostRenderBundle, bundlePublicPath } from './render-bundle-host.js';
import { bundle } from '@remotion/bundler';
import { ensureBrowser } from '@remotion/renderer';
import fs from 'node:fs';
import path from 'node:path';
import { makeRenderQueue } from './render-queue.js';

const {
  PORT = 3001,
  REMOTION_SERVE_URL,
  RENDERS_DIR = './renders',
  PUBLIC_URL = `http://preview.video-wizard.localhost:${PORT}`,
} = process.env;

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
  const rendersDir = path.resolve(RENDERS_DIR);
  fs.mkdirSync(rendersDir, { recursive: true });
  const { app, closeStudio } = rendererApp({
    queue: makeRenderQueue({ serveUrl: remotionBundleUrl, rendersDir }),
    secret: process.env.STUDIO_RENDER_SECRET!,
    rendersDir,
    editorOrigin: process.env.STUDIO_EDITOR_ORIGIN || 'http://app.video-wizard.localhost:3000',
    previewOrigin: process.env.STUDIO_PREVIEW_ORIGIN || PUBLIC_URL,
  });

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
