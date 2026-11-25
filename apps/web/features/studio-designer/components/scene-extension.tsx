import { useMemo, useState } from 'react';
import {
  applyCommand,
  sceneStartMs,
  type AssetDescriptor,
  type ProjectDraft,
  type Scene,
} from '@workspace/video-project';
import { checkLayerRange, type CommandHandler } from '../lib/editor-commands';
import { NumberField } from './number-field';

export function SceneExtension({
  document,
  scene,
  asset,
  onCommand,
}: {
  document: ProjectDraft;
  scene: Scene;
  asset: (id: string) => AssetDescriptor | null | undefined;
  onCommand: CommandHandler;
}) {
  const [proposal, setProposal] = useState<number | null>(null);
  const durationMs = proposal ?? scene.durationMs;
  const command = { type: 'extend-scene' as const, sceneId: scene.id, durationMs };
  const preview = useMemo(() => {
    if (durationMs <= scene.durationMs) return null;
    try {
      return applyCommand(document, { type: 'extend-scene', sceneId: scene.id, durationMs });
    } catch {
      return null;
    }
  }, [document, durationMs, scene.id, scene.durationMs]);
  function issue(ms: number) {
    if (!Number.isSafeInteger(ms))
      return 'Introduce una duración entera en el intervalo permitido.';
    for (const layer of scene.layers) {
      if (layer.endAnchor === 'scene-end' && 'sourceInMs' in layer) {
        const message = checkLayerRange(
          layer,
          { endMs: Math.max(ms, layer.endMs) },
          asset(layer.assetId)?.durationMs
        );
        if (message) return message;
      }
    }
  }
  const next = document.scenes[document.scenes.findIndex((s) => s.id === scene.id) + 1];
  return (
    <details className="edit-section">
      <summary>Duración de la escena</summary>
      <NumberField
        label="Ampliar hasta (ms)"
        value={durationMs}
        min={scene.durationMs}
        onCommit={(ms) => {
          const error = issue(ms);
          if (error) return error;
          setProposal(ms);
        }}
      />
      {durationMs > scene.durationMs && !preview && (
        <p role="alert">La ampliación excede la duración permitida del proyecto.</p>
      )}
      {preview && (
        <div>
          <p className="edit-note" role="status">
            Escena de {scene.durationMs} a {durationMs} ms. Proyecto de {document.durationMs} a{' '}
            {preview.durationMs} ms.
            {next && ' La escena siguiente comenzará en ' + sceneStartMs(preview, next.id) + ' ms.'}
            {' Capas con fin anclado que se amplían: ' +
              scene.layers.filter((l) => l.endAnchor === 'scene-end' && l.endMs < durationMs)
                .length +
              '.'}
          </p>
          <button
            className="edit-button"
            type="button"
            disabled={!!issue(durationMs)}
            onClick={() => {
              onCommand(command);
              setProposal(null);
            }}
          >
            Aplicar ampliación
          </button>
        </div>
      )}
    </details>
  );
}
