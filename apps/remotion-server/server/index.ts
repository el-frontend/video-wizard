import { bundle } from '@remotion/bundler';
import { ensureBrowser } from '@remotion/renderer';
import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { makeRenderQueue } from './render-queue.js';

const { 
  PORT = 3001, 
  REMOTION_SERVE_URL, 
  RENDERS_DIR = './renders',
  PUBLIC_URL = `http://localhost:${PORT}`,
  // Maximum render jobs that can run concurrently (default: 1 to conserve memory)
  MAX_CONCURRENT_RENDERS = '1',
  // Number of CPU threads / Chromium tabs per render job (default: Remotion auto-detect)
  RENDER_CONCURRENCY,
  // Per-render timeout in milliseconds (default: 5 minutes)
  RENDER_TIMEOUT_MS = '300000',
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

  const parsedMaxConcurrent = parseInt(MAX_CONCURRENT_RENDERS, 10);
  if (isNaN(parsedMaxConcurrent) || parsedMaxConcurrent < 1) {
    console.warn(`⚠️  Invalid MAX_CONCURRENT_RENDERS="${MAX_CONCURRENT_RENDERS}", using default: 1`);
  }
  const maxConcurrentRenders = !isNaN(parsedMaxConcurrent) && parsedMaxConcurrent >= 1 ? parsedMaxConcurrent : 1;

  const parsedTimeout = parseInt(RENDER_TIMEOUT_MS, 10);
  if (isNaN(parsedTimeout) || parsedTimeout <= 0) {
    console.warn(`⚠️  Invalid RENDER_TIMEOUT_MS="${RENDER_TIMEOUT_MS}", using default: 300000`);
  }
  const timeoutInMilliseconds = !isNaN(parsedTimeout) && parsedTimeout > 0 ? parsedTimeout : 300_000;

  const parsedConcurrencyPerRender = RENDER_CONCURRENCY ? parseInt(RENDER_CONCURRENCY, 10) : undefined;
  if (parsedConcurrencyPerRender !== undefined && (isNaN(parsedConcurrencyPerRender) || parsedConcurrencyPerRender < 1)) {
    console.warn(`⚠️  Invalid RENDER_CONCURRENCY="${RENDER_CONCURRENCY}", using Remotion auto-detect`);
  }
  const concurrencyPerRender =
    parsedConcurrencyPerRender !== undefined && !isNaN(parsedConcurrencyPerRender) && parsedConcurrencyPerRender >= 1
      ? parsedConcurrencyPerRender
      : undefined;

  const queue = makeRenderQueue({
    serveUrl: remotionBundleUrl,
    rendersDir,
    publicUrl: PUBLIC_URL,
    maxConcurrentRenders,
    concurrencyPerRender,
    timeoutInMilliseconds,
  });

  // Serve rendered videos
  app.use('/renders', express.static(rendersDir));
  app.use(express.json());

  /**
   * POST /renders
   * Create a new render job
   * 
   * Body:
   * {
   *   "compositionId": "VideoWithSubtitles",
   *   "inputProps": {
   *     "videoUrl": "https://example.com/video.mp4",
   *     "subtitles": [...],
   *     "template": "viral",
   *     "backgroundColor": "#000000"
   *   }
   * }
   */
  app.post('/renders', async (req, res) => {
    try {
      const { compositionId, inputProps } = req.body;

      if (!compositionId || typeof compositionId !== 'string') {
        res.status(400).json({ message: 'compositionId is required and must be a string' });
        return;
      }

      if (!inputProps || typeof inputProps !== 'object') {
        res.status(400).json({ message: 'inputProps is required and must be an object' });
        return;
      }

      // Validate required input props
      if (!inputProps.videoUrl || typeof inputProps.videoUrl !== 'string') {
        res.status(400).json({ message: 'inputProps.videoUrl is required and must be a string' });
        return;
      }

      if (!Array.isArray(inputProps.subtitles)) {
        res.status(400).json({ message: 'inputProps.subtitles is required and must be an array' });
        return;
      }

      const jobId = queue.createJob({ compositionId, inputProps });

      console.info(`Created render job: ${jobId}`);

      res.json({ jobId });
    } catch (error) {
      console.error('Error creating render job:', error);
      res.status(500).json({ message: 'Failed to create render job', error: String(error) });
    }
  });

  /**
   * GET /renders/:jobId
   * Get the status of a render job
   */
  app.get('/renders/:jobId', (req, res) => {
    const jobId = req.params.jobId;
    const job = queue.jobs.get(jobId);

    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    res.json(job);
  });

  /**
   * DELETE /renders/:jobId
   * Cancel a running render job
   */
  app.delete('/renders/:jobId', (req, res) => {
    const jobId = req.params.jobId;

    const job = queue.jobs.get(jobId);

    if (!job) {
      res.status(404).json({ message: 'Job not found' });
      return;
    }

    if (job.status !== 'queued' && job.status !== 'in-progress') {
      res.status(400).json({ message: 'Job is not cancellable' });
      return;
    }

    job.cancel();

    console.info(`Cancelled render job: ${jobId}`);

    res.json({ message: 'Job cancelled' });
  });

  /**
   * GET /health
   * Health check endpoint
   */
  app.get('/health', (req, res) => {
    res.json({ status: 'ok', timestamp: new Date().toISOString() });
  });

  return app;
}

/**
 * Main server initialization
 * Ensures browser is available and bundles Remotion compositions
 */
async function main() {
  console.info('🚀 Starting Remotion Render Server...');

  // Ensure browser is installed
  console.info('📦 Ensuring browser is installed...');
  await ensureBrowser();

  // Bundle Remotion compositions or use pre-bundled URL
  let remotionBundleUrl: string;

  if (REMOTION_SERVE_URL) {
    console.info(`📦 Using pre-bundled Remotion project: ${REMOTION_SERVE_URL}`);
    remotionBundleUrl = REMOTION_SERVE_URL;
  } else {
    console.info('📦 Bundling Remotion compositions...');
    remotionBundleUrl = await bundle({
      entryPoint: path.resolve('../../packages/remotion-compositions/src/index.ts'),
      onProgress(progress) {
        console.info(`Bundling progress: ${progress}%`);
      },
    });
    console.info(`✅ Bundling complete: ${remotionBundleUrl}`);
  }

  // Setup Express app
  const app = setupApp({ remotionBundleUrl });

  // Start server
  app.listen(Number(PORT), () => {
    console.info(`✅ Server is running on port ${PORT}`);
    console.info(`📹 Ready to accept render jobs at http://localhost:${PORT}/renders`);
    console.info(`⚙️  Max concurrent renders: ${MAX_CONCURRENT_RENDERS}`);
    if (RENDER_CONCURRENCY) console.info(`⚙️  Threads per render: ${RENDER_CONCURRENCY}`);
  });
}

main().catch((error) => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});
