import { SelectField } from './select-field';
import type { AssetDescriptor, Layer } from '@workspace/video-project';
import { checkLayerRange, type CommandHandler, type LayerPatch } from '../lib/editor-commands';
import { NumberField } from './number-field';

type Media = Extract<Layer, { type: 'video' | 'image' | 'audio' }>;
export function MediaInspector({
  sceneId,
  layer,
  asset,
  onCommand,
}: {
  sceneId: string;
  layer: Media;
  asset?: AssetDescriptor | null;
  onCommand: CommandHandler;
}) {
  function patch(value: LayerPatch) {
    onCommand({ type: 'update-layer', sceneId, layerId: layer.id, patch: value });
  }
  return (
    <fieldset className="edit-section">
      <legend>Fuente</legend>
      <p className="edit-note" role="status">
        {asset
          ? asset.name + (asset.durationMs !== undefined ? ' · ' + asset.durationMs + ' ms' : '')
          : asset === null
            ? 'Recurso no disponible.'
            : 'Cargando recurso…'}
      </p>
      {layer.type === 'video' && layer.playbackVariant && (
        <div className="edit-note">
          Recorte procesado · {layer.playbackVariant.sourceStartMs}–
          {layer.playbackVariant.sourceEndMs} ms
          <button
            type="button"
            className="edit-button"
            onClick={() => onCommand({ type: 'use-original-video', sceneId, layerId: layer.id })}
          >
            Usar video original
          </button>
        </div>
      )}
      <div className="edit-grid">
        {'sourceInMs' in layer && (
          <>
            <NumberField
              label="Entrada de fuente (ms)"
              value={layer.sourceInMs}
              disabled={asset?.durationMs === undefined}
              min={0}
              onCommit={(sourceInMs) => {
                const issue = checkLayerRange(layer, { sourceInMs }, asset?.durationMs);
                if (issue) return issue;
                patch({ sourceInMs });
              }}
            />
            <NumberField
              label="Salida de fuente (ms)"
              value={layer.sourceInMs + layer.endMs - layer.startMs}
              min={layer.sourceInMs + 1}
              max={asset?.durationMs}
              disabled={asset?.durationMs === undefined}
              onCommit={(sourceOut) => {
                const endMs = layer.startMs + sourceOut - layer.sourceInMs;
                const issue = checkLayerRange(layer, { endMs }, asset?.durationMs);
                if (issue) return issue;
                patch({ endMs, endAnchor: 'fixed' });
              }}
            />
            <NumberField
              label="Volumen (%)"
              min={0}
              step="any"
              value={layer.volume * 100}
              onCommit={(value) => patch({ volume: value / 100 })}
            />
          </>
        )}
        {layer.type === 'video' && (
          <>
            <SelectField
              label="Encuadre"
              value={layer.fit}
              onChange={(e) => patch({ fit: e.target.value === 'cover' ? 'cover' : 'contain' })}
            >
              <option value="cover">Cubrir</option>
              <option value="contain">Contener</option>
            </SelectField>
            {(['x', 'y'] as const).map((axis) => (
              <NumberField
                key={axis}
                label={axis === 'x' ? 'Foco horizontal (%)' : 'Foco vertical (%)'}
                min={0}
                max={100}
                step="any"
                value={layer.focalPoint[axis] * 100}
                onCommit={(value) =>
                  patch({ focalPoint: { ...layer.focalPoint, [axis]: value / 100 } })
                }
              />
            ))}
          </>
        )}
      </div>
      {'sourceInMs' in layer &&
        asset?.durationMs !== undefined &&
        !!checkLayerRange(layer, {}, asset.durationMs) && (
          <p className="edit-note">
            El tramo guardado excede la fuente.
            {asset.durationMs > 0 && (
              <button
                type="button"
                className="edit-button"
                onClick={() => {
                  const duration = asset.durationMs!;
                  const length = Math.min(duration, layer.endMs - layer.startMs);
                  patch({
                    sourceInMs: Math.min(layer.sourceInMs, duration - length),
                    endMs: layer.startMs + length,
                    endAnchor: 'fixed',
                  });
                }}
              >
                Encajar tramo en la fuente
              </button>
            )}
          </p>
        )}
    </fieldset>
  );
}
