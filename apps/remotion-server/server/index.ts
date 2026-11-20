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

  const queue = makeRenderQueue({
    port: Number(PORT),
    serveUrl: remotionBundleUrl,
    rendersDir,
    publicUrl: PUBLIC_URL,
  });

  // Serve rendered videos
  app.use('/renders', express.static(rendersDir));
  app.use(express.json({ limit: '8mb' }));
  let studio: ReturnType<typeof installStudioRoutes> | undefined;
  if (process.env.STUDIO_RENDER_SECRET) {
    studio = installStudioRoutes(app, {
      schedule: queue.schedule,
      secret: process.env.STUDIO_RENDER_SECRET,
      editorOrigin: process.env.STUDIO_EDITOR_ORIGIN || 'http://localhost:3000',
      previewOrigin: process.env.STUDIO_PREVIEW_ORIGIN || PUBLIC_URL,
    });
  }

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

      if (compositionId === 'StudioProject') {
        res.status(404).end();
        return;
      }
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

  return { app, closeStudio: () => studio?.close() };
}

/**
 * Main server initialization
 * Ensures browser is available and bundles Remotion compositions
 */
async function main() {
  console.info('🚀 Starting Remotion Render Server...');

  // Ensure browser is installed
  console.info('📦 Ensuring browser is installed...');
  await ensureBrowser({ browserExecutable: process.env.REMOTION_BROWSER_EXECUTABLE });

  // Bundle Remotion compositions or use pre-bundled URL
  let remotionBundleUrl: string;

  if (REMOTION_SERVE_URL) {
    console.info(`📦 Using pre-bundled Remotion project: ${REMOTION_SERVE_URL}`);
    remotionBundleUrl = REMOTION_SERVE_URL;
  } else {
    console.info('📦 Bundling Remotion compositions...');
    remotionBundleUrl = await bundle({
      entryPoint: path.resolve('../../packages/remotion-compositions/src/entry.ts'),
      onProgress(progress) {
        console.info(`Bundling progress: ${progress}%`);
      },
    });
    console.info(`✅ Bundling complete: ${remotionBundleUrl}`);
  }

  // Setup Express app
  const { app, closeStudio } = setupApp({ remotionBundleUrl });

  // Start server
  const server = app.listen(Number(PORT), () => {
    console.info(`✅ Server is running on port ${PORT}`);
    console.info(`📹 Ready to accept render jobs at http://localhost:${PORT}/renders`);
  });
  const shutdown = () => {
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
