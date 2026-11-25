import express, { type Express, type Response } from 'express';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { EngineAdapter, ExportSnapshot, RenderResult } from '@workspace/render-contract';
import { exportTimes, snapshotDigest, verifyRenderResult } from '@workspace/render-contract/export';
import { ProjectDraftSchema } from '@workspace/video-project';
import { resolveStudioDataDir } from '@workspace/render-contract/storage';
import type { ServicePrincipal } from '@workspace/service-auth';
import { requireService } from './service-request.js';

interface Attempt {
  principal: ServicePrincipal;
  digest: string;
  abort: AbortController;
  touched: number;
  status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
  progress: number;
  result?: RenderResult;
  error?: string;
  retryable?: boolean;
  done?: Promise<void>;
  unschedule?: () => void;
}
type Adapters = Record<'hyperframes' | 'remotion', EngineAdapter>;
export function installExportRoutes(
  app: Express,
  secret: string,
  adapters: Adapters,
  schedule: ((id: string, run: () => Promise<void>) => void | (() => void)) | undefined
) {
  const sessions = new Map<string, Attempt>();
  const path = '/studio/export-attempts/:id';
  const dir = () =>
    process.env.STUDIO_EXPORT_STAGING || join(resolveStudioDataDir(), 'export-runtime', 'staging');
  const guard = (scope: string) => requireService(secret, scope);
  function owned(id: string, res: Response) {
    const p: ServicePrincipal = res.locals.principal;
    const s = sessions.get(id);
    if (
      p.attemptId === id &&
      s?.principal.ownerId === p.ownerId &&
      s.principal.projectId === p.projectId &&
      s.principal.jobId === p.jobId
    )
      return s;
  }
  function status(id: string, s: Attempt) {
    return {
      attemptId: id,
      snapshotHash: s.digest,
      status: s.status,
      progress: s.progress,
      result: s.result,
      error: s.error,
      retryable: s.retryable,
    };
  }
  app.post(path, guard('export.create'), express.json({ limit: '32mb' }), (req, res) => {
    const id = String(req.params.id),
      principal: ServicePrincipal = res.locals.principal;
    const snapshot: ExportSnapshot | undefined = req.body?.snapshot;
    if (
      principal.attemptId !== id ||
      snapshot?.ownerId !== principal.ownerId ||
      snapshot?.document?.id !== principal.projectId
    ) {
      res.status(404).end();
      return;
    }
    if (
      !snapshot ||
      !ProjectDraftSchema.safeParse(snapshot.document).success ||
      !snapshot.dependencies ||
      !snapshot.bundles ||
      !Array.isArray(snapshot.diagnostics)
    ) {
      res.status(400).end();
      return;
    }
    const digest = snapshotDigest(snapshot);
    if (digest !== req.body.snapshotHash) {
      res.status(400).end();
      return;
    }
    const prior = sessions.get(id);
    if (prior) {
      if (!owned(id, res) || prior.digest !== digest) {
        res.status(409).end();
        return;
      }
      prior.touched = Date.now();
      res.status(202).json(status(id, prior));
      return;
    }
    const attempt: Attempt = {
      principal,
      digest,
      abort: new AbortController(),
      touched: Date.now(),
      status: 'queued',
      progress: 0,
    };
    sessions.set(id, attempt);
    const run = async () => {
      if (attempt.abort.signal.aborted) return;
      const signal = attempt.abort.signal;
      const parent = join(dir(), principal.jobId!);
      const workspace = join(parent, id);
      let created = false;
      let phase = 'preparación';
      try {
        attempt.status = 'running';
        await mkdir(parent, { recursive: true, mode: 0o700 });
        // Keep a tiny consumed-ID marker when bulk workspace files are reclaimed.
        // A duplicate POST after renderer restart cannot execute this UUID again.
        await writeFile(join(parent, id + '.admitted'), digest, { flag: 'wx', mode: 0o600 });
        await mkdir(workspace, { mode: 0o700 });
        created = true;
        const adapter = adapters[snapshot.document.engine];
        const bad = (await adapter.validate(snapshot, signal)).find((d) => d.severity === 'error');
        if (bad) {
          attempt.error = bad.message;
          throw Error();
        }
        const prepared = await adapter.prepare(snapshot, workspace, signal);
        signal.throwIfAborted();
        phase = 'captura';
        const stills = await adapter.snapshots(
          prepared,
          exportTimes(snapshot.document.durationMs),
          signal
        );
        signal.throwIfAborted();
        attempt.progress = 0.15;
        phase = 'codificación';
        const result = await adapter.render(prepared, {
          signal,
          onProgress: (p) => {
            attempt.progress = 0.15 + 0.84 * p;
          },
        });
        signal.throwIfAborted();
        phase = 'verificación';
        attempt.result = verifyRenderResult(snapshot, {
          ...result,
          artifacts: [...stills, ...result.artifacts],
        });
        attempt.status = 'completed';
        attempt.progress = 1;
      } catch {
        if (!attempt.error && !signal.aborted) {
          attempt.retryable = true;
          attempt.error = 'El motor no pudo terminar la ' + phase + '.';
        }
        attempt.status = signal.aborted ? 'cancelled' : 'failed';
        if (created) await rm(workspace, { recursive: true, force: true });
      } finally {
        attempt.touched = Date.now();
      }
    };
    const execute = () => (attempt.done = run());
    if (schedule) attempt.unschedule = schedule(id, execute) || undefined;
    else void execute();
    res.status(202).json(status(id, attempt));
  });
  app.get(path, guard('export.read'), (req, res) => {
    const id = String(req.params.id),
      s = owned(id, res);
    if (!s) {
      res.status(404).end();
      return;
    }
    s.touched = Date.now();
    res.set('Cache-Control', 'no-store').json(status(id, s));
  });
  app.delete(path, guard('export.cancel'), async (req, res, next) => {
    try {
      const id = String(req.params.id),
        s = owned(id, res);
      if (!s) {
        res.status(404).end();
        return;
      }
      s.unschedule?.();
      s.abort.abort();
      await s.done;
      s.status = 'cancelled';
      s.result = undefined;
      s.touched = Date.now();
      res.status(204).end();
    } catch (error) {
      next(error);
    }
  });
  // A dead worker cannot leave expensive capture/encoding running indefinitely.
  const collect = setInterval(() => {
    for (const [id, s] of sessions) {
      if (Date.now() - s.touched < 60000) continue;
      if (s.status === 'running' || s.status === 'queued') {
        s.abort.abort();
        if (s.status === 'queued') {
          s.unschedule?.();
          s.status = 'cancelled';
        }
      } else sessions.delete(id);
    }
  }, 5000).unref();
  return async () => {
    clearInterval(collect);
    for (const s of sessions.values()) {
      s.unschedule?.();
      s.abort.abort();
    }
    await Promise.allSettled([...sessions.values()].map((s) => s.done));
    sessions.clear();
  };
}
