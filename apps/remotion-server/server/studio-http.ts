import { serviceRequest } from './service-request.js';
import { serviceKey } from '@workspace/service-auth';
import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response } from 'express';
import type { ExportSnapshot } from '@workspace/render-contract';
import { ProjectRecordSchema } from '@workspace/video-project';
import { HyperframesProjectAdapter } from '@workspace/hyperframes-worker';
import { readNativeManifest, type NativeManifest } from '@workspace/hyperframes-compositions';
import { NativePreviewSession } from '@workspace/hyperframes-compositions/preview';
import { buildPreview } from './preview-builder.js';
import { RemotionProjectAdapter, stageMedia } from './project-adapter.js';

interface Session {
  workspace: string;
  owner: string;
  expires: number;
  snapshot: ExportSnapshot;
  native?: NativeManifest;
  previewLink?: { url: string; manifestHash: string };
  ticket?: string;
  ticketExpires?: number;
  cookie?: string;
  status: 'queued' | 'running' | 'failed' | 'completed';
  progress: number;
  abort: AbortController;
  done?: Promise<void>;
  kind: 'preview' | 'render';
}
const previewTicketLifetime = 120_000;
const instanceId = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const token = () => randomBytes(32).toString('hex');
function equal(a: string | undefined, b: string | undefined) {
  const digest = (s: string) => createHash('sha256').update(s).digest();
  return !!a && !!b && timingSafeEqual(digest(a), digest(b));
}
export function installStudioRoutes(
  app: Express,
  config: {
    secret: string;
    editorOrigin: string;
    previewOrigin: string;
    dataDir?: string;
    schedule?: (id: string, run: () => Promise<void>) => void;
  }
) {
  const editor = new URL(config.editorOrigin).origin,
    origin = new URL(config.previewOrigin).origin;
  serviceKey(config.secret);
  if (editor === origin)
    throw new Error('Configura los orígenes separados y la credencial interna de Studio.');
  const sessions = new Map<string, Session>();
  // DELETE can arrive before Next finishes resolving the snapshot for POST.
  const retirements = new Map<string, { instances: Map<string, number>; fullUntil: number }>();
  function retire(owner: string, project: string, instance: string) {
    const key = JSON.stringify([owner, project]);
    const batch = retirements.get(key) ?? { instances: new Map<string, number>(), fullUntil: 0 };
    const until = Date.now() + previewTicketLifetime;
    // Bound cancellation records per authenticated project, including repeated early DELETEs.
    if (batch.instances.size < 2048 || batch.instances.has(instance))
      batch.instances.set(instance, until);
    else batch.fullUntil = until;
    retirements.set(key, batch);
  }
  const remotion = new RemotionProjectAdapter(config.dataDir);
  const native = new HyperframesProjectAdapter(config.dataDir);
  const expires = () => Date.now() + 60 * 60 * 1000;
  const collect = setInterval(() => {
    for (const [key, batch] of retirements) {
      for (const [instance, expiry] of batch.instances)
        if (expiry <= Date.now()) batch.instances.delete(instance);
      if (!batch.instances.size && batch.fullUntil <= Date.now()) retirements.delete(key);
    }
    for (const [id, session] of sessions)
      if (
        (session.expires <= Date.now() ||
          (session.ticket && (session.ticketExpires ?? 0) <= Date.now())) &&
        session.status !== 'running' &&
        session.status !== 'queued'
      ) {
        sessions.delete(id);
        void rm(session.workspace, { recursive: true, force: true }).catch(() =>
          console.error('Studio workspace cleanup failed.')
        );
      }
  }, 60_000);
  collect.unref();
  const deny = (res: Response) => res.status(404).end();
  const owned = async (req: Request, scope: string) => {
    const principal = await serviceRequest(req, scope, config.secret);
    const id = String(req.params.id);
    const session = sessions.get(id);
    return principal &&
      session &&
      principal.jobId === id &&
      principal.projectId === session.snapshot.document.id &&
      principal.ownerId === session.owner
      ? session
      : undefined;
  };

  async function start(req: Request, res: Response, kind: Session['kind']) {
    const principal = await serviceRequest(
      req,
      kind === 'preview' ? 'preview.create' : 'studio.create',
      config.secret
    );
    if (!principal) {
      res.status(401).end();
      return;
    }
    const snapshot: ExportSnapshot | undefined = req.body?.snapshot;
    if (
      !snapshot ||
      !ProjectRecordSchema.shape.document.safeParse(snapshot.document).success ||
      typeof snapshot.revision !== 'string' ||
      !snapshot.ownerId ||
      principal.ownerId !== snapshot.ownerId ||
      principal.projectId !== snapshot.document.id ||
      (kind === 'preview' && (!principal.previewId || principal.previewId !== req.body.instance))
    ) {
      res.status(400).json({ error: 'La instantánea no es válida.' });
      return;
    }
    const id: string =
      kind === 'preview' && req.body.instance !== undefined ? req.body.instance : randomUUID();
    if (typeof id !== 'string' || !instanceId.test(id)) {
      res.status(400).json({ error: 'La instancia no es válida.' });
      return;
    }
    const key = JSON.stringify([snapshot.ownerId, snapshot.document.id]);
    const unavailable = () => {
      const retired = retirements.get(key);
      return (
        sessions.has(id) ||
        (kind === 'preview' &&
          retired &&
          Math.max(retired.fullUntil, retired.instances.get(id) ?? 0) > Date.now())
      );
    };
    const abort = new AbortController();
    const onClose = () => {
      if (!res.writableFinished) abort.abort();
    };
    if (kind === 'preview') res.once('close', onClose);
    let workspace: string | undefined;
    let session: Session | undefined;
    try {
      if (unavailable()) {
        deny(res);
        return;
      }
      const adapter = snapshot.document.engine === 'hyperframes' ? native : remotion;
      const diagnostics = await adapter.validate(snapshot);
      abort.signal.throwIfAborted();
      if (
        diagnostics.some(
          (d) => d.severity === 'error' && (kind === 'render' || d.code !== 'scene-no-frame')
        )
      ) {
        res.status(422).json({ diagnostics });
        return;
      }
      workspace = await mkdtemp(join(tmpdir(), 'video-wizard-studio-'));
      abort.signal.throwIfAborted();
      if (unavailable()) {
        await rm(workspace, { recursive: true, force: true });
        deny(res);
        return;
      }
      const active: Session = {
        workspace,
        owner: snapshot.ownerId,
        snapshot,
        expires: expires(),
        progress: 0,
        abort,
        kind,
        status: 'running',
      };
      session = active;
      sessions.set(id, active);
      if (kind === 'preview') {
        active.done = (async () => {
          if (snapshot.document.engine === 'hyperframes') {
            const nativeSession = new NativePreviewSession(
              active.workspace,
              origin + '/studio/previews/' + id + '/frame',
              {
                dataDir: config.dataDir,
                signal: abort.signal,
              }
            );
            active.previewLink = await nativeSession.createPreview(snapshot);
            active.native = await readNativeManifest(active.workspace);
            return;
          }
          await buildPreview(snapshot, active.workspace, abort.signal);
          abort.signal.throwIfAborted();
          await stageMedia(snapshot, join(active.workspace, 'media'), config.dataDir, abort.signal);
          abort.signal.throwIfAborted();
        })();
        await active.done;
        abort.signal.throwIfAborted();
        session.status = 'completed';
        session.ticket = token();
        session.ticketExpires = Date.now() + previewTicketLifetime;
        res.set('Cache-Control', 'no-store').json({
          instance: id,
          origin,
          ticket: session.ticket,
          diagnostics,
          ...session.previewLink,
        });
        return;
      }
      active.status = 'queued';
      const execute = async () => {
        try {
          active.abort.signal.throwIfAborted();
          active.status = 'running';
          const prepared = await adapter.prepare(snapshot, active.workspace, active.abort.signal);
          await adapter.render(prepared, {
            signal: active.abort.signal,
            onProgress: (p) => {
              active.progress = p;
            },
          });
          active.status = 'completed';
        } catch {
          active.status = 'failed';
        }
        active.expires = expires();
      };
      const run = () => {
        active.done = execute();
        return active.done;
      };
      if (config.schedule) config.schedule(id, run);
      else void run();
      res.status(202).json({ jobId: id });
    } catch {
      if (session && sessions.get(id) === session) sessions.delete(id);
      if (workspace) await rm(workspace, { recursive: true, force: true });
      if (!res.destroyed)
        res
          .status(abort.signal.aborted ? 410 : 500)
          .json({ error: 'No se pudo preparar el proyecto.' });
    } finally {
      res.off('close', onClose);
    }
  }
  app.post('/renders', (req, res, next) => {
    if (req.body?.compositionId === 'StudioProject') void start(req, res, 'render');
    else next();
  });
  app.post('/studio/previews', (req, res) => {
    void start(req, res, 'preview');
  });
  app.delete('/studio/previews/:id', async (req, res) => {
    const principal = await serviceRequest(req, 'preview.release', config.secret);
    const id = String(req.params.id),
      owner = principal?.ownerId,
      project = principal?.projectId;
    const session = sessions.get(id);
    if (
      principal?.previewId !== id ||
      !instanceId.test(id) ||
      !owner ||
      !project ||
      (session &&
        (session.kind !== 'preview' ||
          session.owner !== owner ||
          session.snapshot.document.id !== project))
    ) {
      deny(res);
      return;
    }
    retire(owner, project, id);
    if (session) {
      sessions.delete(id);
      session.abort.abort();
      await session.done?.catch(() => {});
      await rm(session.workspace, { recursive: true, force: true });
    }
    res.status(204).end();
  });
  app.get('/studio/renders/:id', async (req, res) => {
    const s = await owned(req, 'studio.read');
    if (!s || s.kind !== 'render') {
      deny(res);
      return;
    }
    res.set('Cache-Control', 'no-store').json({
      status: s.status,
      progress: s.progress,
      revision: s.snapshot.revision,
      projectId: s.snapshot.document.id,
    });
  });
  app.get('/studio/renders/:id/video', async (req, res) => {
    const s = await owned(req, 'studio.artifact');
    if (!s || s.kind !== 'render' || s.status !== 'completed') {
      deny(res);
      return;
    }
    res.set('Cache-Control', 'no-store').sendFile(join(s.workspace, 'video.mp4'));
  });
  app.use('/studio/previews/:id', (_req, res, next) => {
    res.set({
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
    });
    next();
  });
  app.get('/studio/previews/:id/frame', (_req, res) => {
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; frame-src 'self'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self' blob: data:; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors " +
        editor
    );
    res
      .type('html')
      .send(
        '<!doctype html><html lang="es"><meta charset="utf-8"><title>Vista previa</title><style>html,body,#player{margin:0;width:100%;height:100%}</style><body><div id="player" data-parent-origin="' +
          editor +
          '"></div><script src="./shell.js"></script></body></html>'
      );
  });
  app.get('/studio/previews/:id/shell.js', (_req, res) =>
    res.sendFile(fileURLToPath(new URL('./preview-shell.js', import.meta.url)))
  );
  const preview = (req: Request) => {
    const s = sessions.get(String(req.params.id));
    return s?.kind === 'preview' && s.expires > Date.now() ? s : undefined;
  };
  const cookieName = 'studio_preview';
  app.post('/studio/previews/:id/session', (req, res) => {
    const s = preview(req);
    if (
      !s ||
      !s.ticketExpires ||
      s.ticketExpires <= Date.now() ||
      req.headers.origin !== origin ||
      typeof req.body?.ticket !== 'string' ||
      !equal(req.body.ticket, s.ticket)
    ) {
      deny(res);
      return;
    }
    s.ticket = undefined;
    s.cookie = token();
    res.cookie(cookieName, s.cookie, {
      httpOnly: true,
      secure: origin.startsWith('https:'),
      sameSite: 'strict',
      path: '/studio/previews/' + req.params.id + '/',
      maxAge: s.expires - Date.now(),
    });
    res.status(204).end();
  });
  const authorizedPreview = (req: Request) => {
    const s = preview(req);
    const cookie = req.headers.cookie
      ?.split(/;\s*/)
      .find((c) => c.startsWith(cookieName + '='))
      ?.slice(cookieName.length + 1);
    return s && equal(cookie, s.cookie) ? s : undefined;
  };
  app.get('/studio/previews/:id/player.js', (req, res) => {
    const s = authorizedPreview(req);
    if (!s) {
      deny(res);
      return;
    }
    if (s.native) res.sendFile(fileURLToPath(new URL('./hyperframes-player.js', import.meta.url)));
    else res.sendFile(join(s.workspace, 'player.js'));
  });
  app.get('/studio/previews/:id/native/*', (req: Request, res: Response) => {
    const session = authorizedPreview(req);
    const file = String(req.params[0]);
    if (!session?.native?.files.includes(file)) {
      deny(res);
      return;
    }
    res.set(
      'Content-Security-Policy',
      "default-src 'none'; script-src 'self' 'sha256-" +
        session.native.scriptHash +
        "'; style-src 'unsafe-inline'; media-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self'; base-uri 'none'; frame-ancestors 'self' " +
        editor
    );
    res.sendFile(join(session.workspace, 'native', file), { dotfiles: 'allow' });
  });
  app.get('/studio/previews/:id/media/:hash', async (req, res) => {
    const s = authorizedPreview(req);
    const asset =
      s && Object.values(s.snapshot.dependencies.assets).find((a) => a.hash === req.params.hash);
    if (!s || s.native || !asset) {
      deny(res);
      return;
    }
    try {
      const path = join(s.workspace, 'media', asset.hash);
      res.type(asset.mediaType).sendFile(path, { dotfiles: 'allow' });
    } catch {
      deny(res);
    }
  });
  return {
    close: async () => {
      clearInterval(collect);
      const closing = [...sessions.values()];
      sessions.clear();
      await Promise.all(
        closing.map(async (s) => {
          s.abort.abort();
          await s.done?.catch(() => {});
          await rm(s.workspace, { recursive: true, force: true });
        })
      );
    },
  };
}
