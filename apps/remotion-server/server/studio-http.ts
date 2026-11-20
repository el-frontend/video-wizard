import { createHash, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Express, Request, Response } from 'express';
import type { ExportSnapshot } from '@workspace/render-contract';
import { ProjectRecordSchema } from '@workspace/video-project';
import { buildPreview } from './preview-builder.js';
import { RemotionProjectAdapter, stageMedia } from './project-adapter.js';

interface Session {
  workspace: string;
  owner: string;
  expires: number;
  snapshot: ExportSnapshot;
  ticket?: string;
  ticketExpires?: number;
  cookie?: string;
  status: 'queued' | 'running' | 'failed' | 'completed';
  progress: number;
  abort: AbortController;
  done?: Promise<void>;
  kind: 'preview' | 'render';
}
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
  if (editor === origin || !config.secret)
    throw new Error('Configura los orígenes separados y la credencial interna de Studio.');
  const sessions = new Map<string, Session>();
  const adapter = new RemotionProjectAdapter(config.dataDir);
  const expires = () => Date.now() + 60 * 60 * 1000;
  const collect = setInterval(() => {
    for (const [id, session] of sessions)
      if (
        session.expires <= Date.now() &&
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
  const internal = (req: Request) => equal(req.headers.authorization, 'Bearer ' + config.secret);
  const deny = (res: Response) => res.status(404).end();
  const owned = (req: Request) => {
    const s = sessions.get(String(req.params.id));
    return internal(req) && s?.owner === req.headers['x-studio-owner'] ? s : undefined;
  };

  async function start(req: Request, res: Response, kind: Session['kind']) {
    if (!internal(req)) {
      deny(res);
      return;
    }
    const snapshot: ExportSnapshot | undefined = req.body?.snapshot;
    if (
      !snapshot ||
      !ProjectRecordSchema.shape.document.safeParse(snapshot.document).success ||
      typeof snapshot.revision !== 'string' ||
      !snapshot.ownerId ||
      req.headers['x-studio-owner'] !== snapshot.ownerId
    ) {
      res.status(400).json({ error: 'La instantánea no es válida.' });
      return;
    }
    let workspace: string | undefined;
    try {
      const diagnostics = await adapter.validate(snapshot);
      if (diagnostics.some((d) => d.severity === 'error')) {
        res.status(422).json({ diagnostics });
        return;
      }
      workspace = await mkdtemp(join(tmpdir(), 'video-wizard-studio-'));
      const id = randomUUID();
      const session: Session = {
        workspace,
        owner: snapshot.ownerId,
        snapshot,
        expires: expires(),
        progress: 0,
        abort: new AbortController(),
        kind,
        status: 'running',
      };
      if (kind === 'preview') {
        await buildPreview(snapshot, workspace);
        await stageMedia(snapshot, join(workspace, 'media'), config.dataDir);
        session.status = 'completed';
        session.ticket = token();
        session.ticketExpires = Date.now() + 120_000;
        sessions.set(id, session);
        res
          .set('Cache-Control', 'no-store')
          .json({ instance: id, origin, ticket: session.ticket, diagnostics });
        return;
      }
      sessions.set(id, session);
      session.status = 'queued';
      const execute = async () => {
        try {
          session.abort.signal.throwIfAborted();
          session.status = 'running';
          const prepared = await adapter.prepare(snapshot, session.workspace);
          await adapter.render(prepared, {
            signal: session.abort.signal,
            onProgress: (p) => {
              session.progress = p;
            },
          });
          session.status = 'completed';
        } catch {
          session.status = 'failed';
        }
        session.expires = expires();
      };
      const run = () => {
        session.done = execute();
        return session.done;
      };
      if (config.schedule) config.schedule(id, run);
      else void run();
      res.status(202).json({ jobId: id });
    } catch {
      if (workspace) await rm(workspace, { recursive: true, force: true });
      res.status(500).json({ error: 'No se pudo preparar el proyecto.' });
    }
  }
  app.post('/renders', (req, res, next) => {
    if (req.body?.compositionId === 'StudioProject') void start(req, res, 'render');
    else next();
  });
  app.post('/studio/previews', (req, res) => {
    void start(req, res, 'preview');
  });
  app.get('/studio/renders/:id', (req, res) => {
    const s = owned(req);
    if (!s || s.kind !== 'render') {
      deny(res);
      return;
    }
    res
      .set('Cache-Control', 'no-store')
      .json({
        status: s.status,
        progress: s.progress,
        revision: s.snapshot.revision,
        projectId: s.snapshot.document.id,
      });
  });
  app.get('/studio/renders/:id/video', (req, res) => {
    const s = owned(req);
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
      "default-src 'none'; script-src 'self'; style-src 'unsafe-inline'; media-src 'self' blob: data:; img-src 'self' blob: data:; connect-src 'self'; font-src 'self'; base-uri 'none'; frame-ancestors " +
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
    res.sendFile(join(s.workspace, 'player.js'));
  });
  app.get('/studio/previews/:id/media/:hash', async (req, res) => {
    const s = authorizedPreview(req);
    const asset =
      s && Object.values(s.snapshot.dependencies.assets).find((a) => a.hash === req.params.hash);
    if (!s || !asset) {
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
          await s.done;
          await rm(s.workspace, { recursive: true, force: true });
        })
      );
    },
  };
}
