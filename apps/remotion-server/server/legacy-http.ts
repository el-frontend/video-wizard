import type { Express, Request } from 'express';
import { join } from 'node:path';
import { legacyAdmission } from '@workspace/render-contract';
import { serviceRequest } from './service-request.js';
import type { makeRenderQueue } from './render-queue.js';

export function installLegacyRoutes(
  app: Express,
  queue: ReturnType<typeof makeRenderQueue>,
  secret: string,
  rendersDir: string
) {
  app.post('/renders', async (req, res) => {
    const principal = await serviceRequest(req, 'render.create', secret);
    if (!principal) {
      res.status(401).end();
      return;
    }
    const input = legacyAdmission.safeParse(req.body);
    if (!input.success || input.data.webJobId !== principal.jobId) {
      res.status(400).end();
      return;
    }
    res
      .status(202)
      .json({ jobId: queue.createJob({ ownerId: principal.ownerId, admission: input.data }) });
  });
  async function owned(req: Request, scope: string) {
    const principal = await serviceRequest(req, scope, secret);
    const id = String(req.params.id);
    if (!principal || principal.rendererJobId !== id) return;
    const job = queue.jobs.get(id);
    if (job?.data.ownerId === principal.ownerId && job.data.admission.webJobId === principal.jobId)
      return job;
  }
  app.get('/renders/:id.mp4', async (req, res) => {
    const job = await owned(req, 'render.artifact');
    if (job?.status !== 'completed') {
      res.status(404).end();
      return;
    }
    res.set('Cache-Control', 'no-store').sendFile(join(rendersDir, String(req.params.id) + '.mp4'));
  });
  app.get('/renders/:id', async (req, res) => {
    const job = await owned(req, 'render.read');
    if (!job) {
      res.status(404).end();
      return;
    }
    res.set('Cache-Control', 'no-store').json({ status: job.status, progress: job.progress });
  });
  app.delete('/renders/:id', async (req, res) => {
    const job = await owned(req, 'render.cancel');
    if (!job) {
      res.status(404).end();
      return;
    }
    if (job.status !== 'queued' && job.status !== 'in-progress') {
      res.status(409).end();
      return;
    }
    job.cancel();
    res.status(204).end();
  });
}
