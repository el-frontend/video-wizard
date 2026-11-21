'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState, useRef, useCallback } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { PreviewHandle, ProjectDraft } from '@workspace/video-project';

const Player = dynamic(
  () => import('./remotion-project-preview').then((module) => module.RemotionProjectPreview),
  {
    ssr: false,
    loading: () => <p role="status">Cargando el reproductor…</p>,
  }
);

interface PreviewProps {
  projectId: string;
  revision: string;
  document: ProjectDraft;
  onTimeChange: (ms: number) => void;
  onReady: (handle: PreviewHandle | null) => void;
}
function DraftPlayer({
  projectId,
  revision,
  document,
  onReady,
}: Omit<PreviewProps, 'onTimeChange'>) {
  const [frame, setFrame] = useState({ revision, document });
  useEffect(() => {
    const timer = setTimeout(() => setFrame({ revision, document }), 500);
    return () => clearTimeout(timer);
  }, [revision, document]);
  return (
    <Player
      projectId={projectId}
      revision={frame.revision}
      document={frame.document}
      onReady={onReady}
    />
  );
}

export function PreviewPanel({
  projectId,
  revision,
  document,
  onTimeChange,
  onReady,
}: PreviewProps) {
  const unsubscribe = useRef<(() => void) | undefined>(undefined);
  const ready = useCallback(
    (handle: PreviewHandle | null) => {
      unsubscribe.current?.();
      unsubscribe.current = handle?.subscribe(onTimeChange);
      onReady(handle);
    },
    [onReady, onTimeChange]
  );
  useEffect(() => () => unsubscribe.current?.(), []);
  const empty = document.durationMs === 0;
  const unavailable = document.engine === 'hyperframes';
  return (
    <div className="studio-stage" aria-label="Vista previa">
      {empty || unavailable ? (
        <div className="stage-note">
          <MonitorPlay aria-hidden="true" size={34} />
          <h3>{empty ? 'Proyecto vacío' : 'Vista previa no disponible'}</h3>
          <p>
            {unavailable
              ? 'La vista previa de HyperFrames aún no está disponible.'
              : 'La vista previa aparecerá cuando el proyecto tenga contenido.'}
          </p>
        </div>
      ) : (
        <DraftPlayer
          projectId={projectId}
          revision={revision}
          document={document}
          onReady={ready}
        />
      )}
    </div>
  );
}
