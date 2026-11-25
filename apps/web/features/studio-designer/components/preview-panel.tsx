'use client';

import dynamic from 'next/dynamic';
import { useEffect, useLayoutEffect, useState } from 'react';
import { MonitorPlay } from 'lucide-react';
import type { PreviewHandle, ProjectDraft } from '@workspace/video-project';

const Player = dynamic(
  () => import('./remotion-project-preview').then((module) => module.RemotionProjectPreview),
  {
    ssr: false,
    loading: () => <p role="status">Cargando el reproductor…</p>,
  }
);

const NativePlayer = dynamic(
  () => import('./hyperframes-project-preview').then((m) => m.HyperframesProjectPreview),
  { ssr: false }
);
interface PreviewProps {
  projectId: string;
  revision: string;
  document: ProjectDraft;
  onTimeChange: (ms: number, acknowledgedCueStartMs?: number) => void;
  onReady: (handle: PreviewHandle | null) => void;
}
// A mounted Player belongs to one immutable document/revision pair.
function FramePlayer({
  active,
  onReady,
  onTimeChange,
  ...props
}: PreviewProps & { active: boolean }) {
  const [handle, setHandle] = useState<PreviewHandle | null>(null);
  useLayoutEffect(() => {
    if (!active || !handle) return;
    let listening = true;
    const unsubscribe = handle.subscribe((ms, acknowledgedCueStartMs) => {
      if (listening) onTimeChange(ms, acknowledgedCueStartMs);
    });
    onReady(handle);
    return () => {
      listening = false;
      unsubscribe();
      onReady(null);
    };
  }, [active, handle, onReady, onTimeChange]);
  const EnginePlayer = props.document.engine === 'hyperframes' ? NativePlayer : Player;
  return <EnginePlayer {...props} onReady={setHandle} />;
}

function DraftPlayer({ document, revision, ...props }: PreviewProps) {
  const [frame, setFrame] = useState({ document, revision, generation: 0 });
  const active = frame.document === document && frame.revision === revision;
  useEffect(() => {
    if (active) return;
    const timer = setTimeout(
      () => setFrame((previous) => ({ document, revision, generation: previous.generation + 1 })),
      500
    );
    return () => clearTimeout(timer);
  }, [active, document, revision]);
  return (
    <FramePlayer
      key={frame.generation}
      {...props}
      active={active}
      document={frame.document}
      revision={frame.revision}
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
  const empty = document.durationMs === 0;
  return (
    <div className="studio-stage" aria-label="Vista previa">
      {empty ? (
        <div className="stage-note">
          <MonitorPlay aria-hidden="true" size={34} />
          <h3>Proyecto vacío</h3>
          <p>La vista previa aparecerá cuando el proyecto tenga contenido.</p>
        </div>
      ) : (
        <DraftPlayer
          projectId={projectId}
          revision={revision}
          document={document}
          onReady={onReady}
          onTimeChange={onTimeChange}
        />
      )}
    </div>
  );
}
