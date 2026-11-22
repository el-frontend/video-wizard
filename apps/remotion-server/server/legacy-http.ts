import express, { type Express, type Request } from 'express';
import type { ServicePrincipal } from '@workspace/service-auth';
import { join } from 'node:path';
import { legacyAdmission } from '@workspace/render-contract';
import { requireService } from './service-request.js';
import type { makeRenderQueue } from './render-queue.js';

export function installLegacyRoutes(
  app: Express,
  queue: ReturnType<typeof makeRenderQueue>,
  secret: string,
  rendersDir: string
) {
  const guard = (scope: string) => requireService(secret, scope);
  app.post('/renders', guard('render.create'), express.json({ limit: '8mb' }), (req, res) => {
    const principal: ServicePrincipal = res.locals.principal;
    const input = legacyAdmission.safeParse(req.body);
    if (!input.success) {
      res.status(400).end();
      return;
    }
    if (input.data.webJobId !== principal.jobId) {
      res.status(404).end();
      return;
    }
    res
      .status(202)
      .json({ jobId: queue.createJob({ ownerId: principal.ownerId, admission: input.data }) });
  });
  function owned(req: Request, principal: ServicePrincipal) {
    const id = String(req.params.id);
    if (!principal || principal.rendererJobId !== id) return;
    const job = queue.jobs.get(id);
    if (job?.data.ownerId === principal.ownerId && job.data.admission.webJobId === principal.jobId)
      return job;
  }
  app.get('/renders/:id.mp4', guard('render.artifact'), (req, res) => {
    const job = owned(req, res.locals.principal);
    if (job?.status !== 'completed') {
      res.status(404).end();
      return;
    }
    res
      .set('Cache-Control', 'private, no-store')
      .sendFile(join(rendersDir, String(req.params.id) + '.mp4'));
  });
  app.get('/renders/:id', guard('render.read'), (req, res) => {
    const job = owned(req, res.locals.principal);
    if (!job) {
      res.status(404).end();
      return;
    }
    res.set('Cache-Control', 'no-store').json({ status: job.status, progress: job.progress });
  });
  app.delete('/renders/:id', guard('render.cancel'), (req, res) => {
    const job = owned(req, res.locals.principal);
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
