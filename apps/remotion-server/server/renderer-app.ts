import express from 'express';
import { installStudioRoutes } from './studio-http.js';
import { installLegacyRoutes } from './legacy-http.js';
import type { makeRenderQueue } from './render-queue.js';

export function rendererApp(options: {
  queue: ReturnType<typeof makeRenderQueue>;
  secret: string;
  rendersDir: string;
  editorOrigin: string;
  previewOrigin: string;
  dataDir?: string;
}) {
  const app = express();
  const { queue, secret, rendersDir, editorOrigin, previewOrigin, dataDir } = options;
  const studio = installStudioRoutes(app, {
    secret,
    editorOrigin,
    previewOrigin,
    dataDir,
    schedule: queue.schedule,
  });
  installLegacyRoutes(app, queue, secret, rendersDir);
  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use(
    (error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
      const details = error as { status?: number; headers?: Record<string, string> };
      if (details.status === 416) {
        const range = details.headers?.['Content-Range'];
        if (range && /^bytes \*\/\d+$/.test(range)) res.set('Content-Range', range);
        res
          .set({ 'Cache-Control': 'private, no-store', 'Accept-Ranges': 'bytes' })
          .status(416)
          .end();
        return;
      }
      res.status([400, 413, 415].includes(details.status ?? 0) ? details.status! : 500).end();
    }
  );
  return { app, closeStudio: () => studio.close() };
}
