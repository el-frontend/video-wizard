import express, { type Express, type Request, type RequestHandler, type Response } from 'express';
import { mkdir, rm } from 'node:fs/promises';
import type { EngineAdapter, ExportSnapshot } from '@workspace/render-contract';
import { exportTimes, snapshotDigest, verifyRenderResult } from '@workspace/render-contract/export';
import { ProjectDraftSchema } from '@workspace/video-project';
import type { ServicePrincipal } from '@workspace/service-auth';
import { requireService } from './service-request.js';
import {
  attemptDirectory,
  isTerminal,
  publicReceipt,
  readReceipt,
  writeReceipt,
  type ExportReceipt,
} from './export-receipt.js';

interface Attempt {
  receipt: ExportReceipt;
  abort: AbortController;
  touched: number;
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
  const writes = new Map<string, Promise<unknown>>();
  // Serialize only decisions for this exact job/attempt. Physical cancellation waits outside the lock.
  function serialized<T>(workspace: string, decide: () => Promise<T>): Promise<T> {
    const previous = writes.get(workspace) || Promise.resolve();
    const current = previous.then(decide, decide);
    writes.set(workspace, current);
    return current.finally(() => {
      if (writes.get(workspace) === current) writes.delete(workspace);
    });
  }
  function initial(p: ServicePrincipal, digest: string | null): ExportReceipt {
    return {
      ownerId: p.ownerId,
      projectId: p.projectId!,
      attemptId: p.attemptId!,
      snapshotHash: digest,
      status: digest ? 'queued' : 'cancelled',
      progress: 0,
    };
  }
  async function store(workspace: string, receipt: ExportReceipt, session?: Attempt) {
    await writeReceipt(workspace, receipt);
    if (session) session.receipt = receipt;
    return receipt;
  }
  async function reconcile(workspace: string, receipt: ExportReceipt) {
    if (sessions.has(workspace) || isTerminal(receipt)) return receipt;
    // After renderer restart the former process tree is gone, and the consumed UUID cannot run again.
    return store(
      workspace,
      receipt.status === 'cancelling'
        ? { ...receipt, status: 'cancelled' }
        : {
            ...receipt,
            status: 'failed',
            error: 'El motor se reinició durante la exportación.',
            retryable: true,
          }
    );
  }
  async function execute(workspace: string, attempt: Attempt, snapshot: ExportSnapshot) {
    const { signal } = attempt.abort;
    if (signal.aborted) return;
    let created = false;
    let phase = 'preparación';
    let outcome: Partial<ExportReceipt>;
    let error: string | undefined;
    try {
      attempt.receipt.status = 'running';
      await mkdir(workspace, { mode: 0o700 });
      created = true;
      const adapter = adapters[snapshot.document.engine];
      const bad = (await adapter.validate(snapshot, signal)).find((d) => d.severity === 'error');
      if (bad) {
        error = bad.message;
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
      attempt.receipt.progress = 0.15;
      phase = 'codificación';
      const result = await adapter.render(prepared, {
        signal,
        onProgress: (p) => {
          attempt.receipt.progress = 0.15 + 0.84 * p;
        },
      });
      signal.throwIfAborted();
      phase = 'verificación';
      outcome = {
        status: 'completed',
        progress: 1,
        result: verifyRenderResult(snapshot, {
          ...result,
          artifacts: [...stills, ...result.artifacts],
        }),
      };
    } catch {
      outcome = {
        status: 'failed',
        error: error ?? 'El motor no pudo terminar la ' + phase + '.',
        retryable: !error,
      };
    }
    await serialized(workspace, async () => {
      if (signal.aborted) outcome = { status: 'cancelled' };
      try {
        if (outcome.status !== 'completed' && created)
          await rm(workspace, { recursive: true, force: true });
        await store(workspace, { ...attempt.receipt, ...outcome }, attempt);
      } catch (error) {
        // Media work is already over. Reconcile the last durable decision on the next request.
        sessions.delete(workspace);
        throw error;
      }
      attempt.touched = Date.now();
    });
  }
  async function stop(workspace: string, receipt: ExportReceipt) {
    const session = sessions.get(workspace);
    if (isTerminal(receipt)) return;
    if (!session || !session.done) {
      session?.unschedule?.();
      session?.abort.abort();
      await store(workspace, { ...receipt, status: 'cancelled' }, session);
      return;
    }
    if (receipt.status !== 'cancelling')
      await store(workspace, { ...receipt, status: 'cancelling' }, session);
    session.abort.abort();
    // Do not await .done here. Its terminal write also holds the per-attempt lock.
    return { done: session.done };
  }

  const path = '/studio/export-attempts/:id';
  const guard = (scope: string) => requireService(secret, scope);
  type Decision = (
    workspace: string,
    prior: ExportReceipt | undefined,
    p: ServicePrincipal,
    req: Request,
    res: Response
  ) => Promise<{ done: Promise<void> } | void>;
  function route(legacyStatus: number, decide: Decision): RequestHandler {
    return (req, res, next) => {
      const p: ServicePrincipal = res.locals.principal;
      if (p.attemptId !== req.params.id) {
        res.status(404).end();
        return;
      }
      const workspace = attemptDirectory(p);
      void serialized(workspace, async () => {
        const session = sessions.get(workspace);
        const prior = session?.receipt ?? (await readReceipt(workspace));
        if (prior === 'legacy') {
          // A consumed digest from a previous renderer cannot resume or divulge an unscoped result.
          res.status(legacyStatus).end();
          return;
        }
        if (
          prior &&
          (prior.ownerId !== p.ownerId ||
            prior.projectId !== p.projectId ||
            prior.attemptId !== p.attemptId)
        ) {
          res.status(404).end();
          return;
        }
        if (session) session.touched = Date.now();
        return decide(workspace, prior, p, req, res);
      })
        .then(async (stopping) => {
          await stopping?.done;
          if (!res.headersSent) res.status(204).end();
        })
        .catch(next);
    };
  }
  app.post(
    path,
    guard('export.create'),
    express.json({ limit: '32mb' }),
    route(409, async (workspace, prior, p, req, res) => {
      const snapshot: ExportSnapshot | undefined = req.body?.snapshot;
      if (snapshot?.ownerId !== p.ownerId || snapshot?.document?.id !== p.projectId) {
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
      if (prior) {
        if (prior.snapshotHash && digest !== prior.snapshotHash) {
          res.status(409).end();
          return;
        }
        res.status(202).json(publicReceipt(await reconcile(workspace, prior)));
        return;
      }
      const receipt = initial(p, digest);
      await writeReceipt(workspace, receipt, true);
      const session: Attempt = { receipt, abort: new AbortController(), touched: Date.now() };
      sessions.set(workspace, session);
      const run = () => (session.done = execute(workspace, session, snapshot));
      if (schedule) session.unschedule = schedule(p.attemptId!, run) || undefined;
      else void run().catch(() => console.error('No se pudo guardar el resultado de exportación.'));
      res.status(202).json(publicReceipt(receipt));
    })
  );
  app.get(
    path,
    guard('export.read'),
    route(404, async (workspace, prior, _p, _req, res) => {
      if (!prior) {
        res.status(404).end();
        return;
      }
      res.set('Cache-Control', 'no-store').json(publicReceipt(await reconcile(workspace, prior)));
    })
  );
  app.delete(
    path,
    guard('export.cancel'),
    route(204, async (workspace, prior, p) => {
      if (prior) return stop(workspace, prior);
      await writeReceipt(workspace, initial(p, null), true);
    })
  );

  async function retire(workspace: string, session: Attempt, idleOnly = false) {
    const stopping = await serialized(workspace, async () => {
      if (sessions.get(workspace) !== session || (idleOnly && Date.now() - session.touched < 60000))
        return;
      if (isTerminal(session.receipt)) {
        sessions.delete(workspace);
        return;
      }
      return stop(workspace, session.receipt);
    });
    await stopping?.done;
  }
  const collect = setInterval(() => {
    for (const [workspace, session] of sessions)
      if (Date.now() - session.touched >= 60000)
        void retire(workspace, session, true).catch(() =>
          console.error('No se pudo retirar el intento de exportación.')
        );
  }, 5000).unref();
  return async () => {
    clearInterval(collect);
    await Promise.all([...sessions].map(([workspace, session]) => retire(workspace, session)));
    sessions.clear();
  };
}
