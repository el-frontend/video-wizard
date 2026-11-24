import { useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';
import { Player, type PlayerRef } from '@remotion/player';
import {
  ProjectComposition,
  projectMetadata,
  type ProjectCompositionProps,
} from '@workspace/remotion-compositions';

export function mountPreview(props: ProjectCompositionProps) {
  // Remotion resolves relative media against the origin; pin the per-instance path.
  for (const asset of Object.values(props.dependencies.assets)) {
    asset.url = new URL(asset.url, window.location.href).href;
  }
  const root = document.getElementById('player')!;
  const { parentOrigin, nonce, instance } = root.dataset;
  if (!parentOrigin || !nonce || !instance)
    throw new Error('La sesión de vista previa no es válida.');
  const target = parentOrigin;
  const post = (type: string, timeMs?: number, acknowledgedCueStartMs?: number) =>
    window.parent.postMessage(
      { type, version: 1, nonce, instance, timeMs, acknowledgedCueStartMs },
      target
    );
  function Preview() {
    const player = useRef<PlayerRef>(null);
    const { fps, width, height, durationInFrames } = projectMetadata(props.document);
    useEffect(() => {
      const ref = player.current!;
      const update = () => post('studio.time', Math.round((ref.getCurrentFrame() * 1000) / fps));
      function receive(event: MessageEvent) {
        if (
          event.source !== window.parent ||
          event.origin !== target ||
          event.data?.version !== 1 ||
          event.data?.nonce !== nonce ||
          event.data?.instance !== instance
        )
          return;
        switch (event.data.type) {
          case 'studio.play':
            ref.play();
            break;
          case 'studio.pause':
            ref.pause();
            break;
          case 'studio.seek':
            if (Number.isSafeInteger(event.data.timeMs) && event.data.timeMs >= 0) {
              const frame = (event.data.timeMs * fps) / 1000;
              const targetFrame =
                event.data.boundary === 'at-or-after' ? Math.ceil(frame) : Math.floor(frame);
              const sampledFrame = Math.min(durationInFrames - 1, targetFrame);
              ref.seekTo(sampledFrame);
              if (event.data.boundary === 'at-or-after') {
                post('studio.time', Math.round((sampledFrame * 1000) / fps), event.data.timeMs);
              } else update();
            }
        }
      }
      window.addEventListener('message', receive);
      ref.addEventListener('frameupdate', update);
      post('studio.ready');
      return () => {
        window.removeEventListener('message', receive);
        ref.removeEventListener('frameupdate', update);
      };
    }, [durationInFrames, fps]);
    return (
      <Player
        ref={player}
        component={ProjectComposition}
        inputProps={props}
        durationInFrames={durationInFrames}
        fps={fps}
        compositionWidth={width}
        compositionHeight={height}
        controls={!root.dataset.check}
        style={{ width: '100%', height: '100%' }}
      />
    );
  }
  createRoot(root).render(<Preview />);
}
