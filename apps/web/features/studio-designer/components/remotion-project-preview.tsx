'use client';

import { useEffect, useRef, useState } from 'react';
import type { Diagnostic, PreviewHandle, ProjectDraft } from '@workspace/video-project';

interface Session {
  instance: string;
  origin: string;
  ticket: string;
  diagnostics?: Diagnostic[];
}
interface Props {
  projectId: string;
  revision: string;
  document?: ProjectDraft;
  onReady?: (handle: PreviewHandle | null) => void;
}
export function RemotionProjectPreview({ projectId, revision, document, onReady }: Props) {
  const frame = useRef<HTMLIFrameElement>(null);
  const ready = useRef(onReady);
  ready.current = onReady;
  const [session, setSession] = useState<Session | null>(null);
  const [error, setError] = useState('');
  const [source, setSource] = useState<string>();
  useEffect(() => {
    const controller = new AbortController();
    const instance = crypto.randomUUID();
    const url = '/api/studio/projects/' + encodeURIComponent(projectId) + '/preview';
    setSession(null);
    setSource(undefined);
    setError('');
    void (async () => {
      try {
        const response = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ baseRevision: revision, document, instance }),
          signal: controller.signal,
        });
        const data = await response.json();
        if (!response.ok)
          throw new Error(
            data.diagnostics?.[0]?.message || data.error || 'No se pudo abrir la vista previa.'
          );
        if (
          data.instance !== instance ||
          new URL(data.origin).origin !== data.origin ||
          data.origin === location.origin ||
          !/^https?:$/.test(new URL(data.origin).protocol)
        )
          throw new Error('El origen de vista previa no es válido.');
        if (!controller.signal.aborted) setSession(data);
      } catch (cause) {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'No se pudo abrir la vista previa.');
      }
    })();
    return () => {
      controller.abort();
      void fetch(url + '?instance=' + instance, { method: 'DELETE', keepalive: true }).catch(
        () => {}
      );
    };
  }, [projectId, revision, document]);
  useEffect(() => {
    if (!session) return;
    let nonce = '',
      time = 0;
    const listeners = new Set<(ms: number) => void>();
    function send(type: string, extra = {}) {
      frame.current?.contentWindow?.postMessage(
        { type, instance: session!.instance, nonce, ...extra },
        session!.origin
      );
    }
    const handle: PreviewHandle = {
      play: () => send('studio.play'),
      pause: () => send('studio.pause'),
      seek: (timeMs, boundary) => send('studio.seek', { timeMs, boundary }),
      getTimeMs: () => time,
      subscribe: (listener) => {
        listeners.add(listener);
        return () => {
          listeners.delete(listener);
        };
      },
    };
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== session.origin ||
        event.data?.instance !== session.instance
      )
        return;
      const msg = event.data;
      if (
        msg.type === 'studio.connecting' &&
        !nonce &&
        typeof msg.nonce === 'string' &&
        msg.nonce.length === 36
      ) {
        nonce = msg.nonce;
        send('studio.connect', { ticket: session.ticket });
        return;
      }
      if (!nonce || msg.nonce !== nonce) return;
      if (msg.type === 'studio.ready') ready.current?.(handle);
      if (msg.type === 'studio.error') setError('La sesión de vista previa no está disponible.');
      if (msg.type === 'studio.time' && Number.isSafeInteger(msg.timeMs) && msg.timeMs >= 0) {
        time = msg.timeMs;
        listeners.forEach((listener) => listener(time));
      }
    };
    window.addEventListener('message', receive);
    setSource(
      session.origin + '/studio/previews/' + encodeURIComponent(session.instance) + '/frame'
    );
    return () => {
      window.removeEventListener('message', receive);
      listeners.clear();
      ready.current?.(null);
    };
  }, [session]);
  if (error) return <p role="alert">{error}</p>;
  const omitted = session?.diagnostics?.filter(
    (d) => d.code === 'scene-no-frame' || d.code === 'cue-no-frame'
  );
  return source ? (
    <>
      {omitted?.map((d) => (
        <p role="status" key={JSON.stringify([d.sceneId, d.layerId, d.code])}>
          {d.message} ({d.sceneId})
        </p>
      ))}
      <iframe
        ref={frame}
        src={source}
        title="Vista previa del proyecto"
        sandbox="allow-scripts allow-same-origin"
        allow="autoplay"
        referrerPolicy="no-referrer"
        style={{ width: '100%', height: '100%', border: 0 }}
      />
    </>
  ) : (
    <p role="status">Preparando la vista previa…</p>
  );
}
