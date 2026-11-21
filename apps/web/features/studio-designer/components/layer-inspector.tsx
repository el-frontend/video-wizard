import { useId } from 'react';
import { SelectField } from './select-field';
import type { AssetDescriptor, Layer, LibraryManifest } from '@workspace/video-project';
import {
  boxOverflows,
  checkLayerRange,
  fitBox,
  type Canvas,
  type CommandHandler,
  type LayerPatch,
} from '../lib/editor-commands';
import { NumberField } from './number-field';
import { ComponentProperties } from './component-properties';
import { MediaInspector } from './media-inspector';

interface Props {
  sceneId: string;
  sceneDuration?: number;
  layer: Layer;
  canvas: Canvas;
  manifest?: LibraryManifest | null;
  asset?: AssetDescriptor | null;
  onCommand: CommandHandler;
}

export function LayerInspector({
  sceneId,
  sceneDuration,
  layer,
  canvas,
  manifest,
  asset,
  onCommand,
}: Props) {
  const textId = useId();
  function patch(value: LayerPatch) {
    onCommand({ type: 'update-layer', sceneId, layerId: layer.id, patch: value });
  }
  function range(value: LayerPatch) {
    const issue = checkLayerRange(layer, value, asset?.durationMs);
    if (issue) return issue;
    patch(value);
  }
  const box = 'box' in layer ? layer.box : null;
  const measured = !('sourceInMs' in layer) || asset?.durationMs !== undefined;
  return (
    <section className="edit-panel" aria-label="Inspector de capa">
      <h2>Inspector de capa</h2>
      {layer.type === 'text' && (
        <div className="edit-field">
          <label htmlFor={textId}>Texto</label>
          <textarea
            id={textId}
            value={layer.text}
            onChange={(e) => patch({ text: e.target.value })}
          />
        </div>
      )}
      <fieldset className="edit-section">
        <legend>Intervalo</legend>
        <div className="edit-grid">
          <NumberField
            label="Inicio (ms)"
            value={layer.startMs}
            min={0}
            disabled={!measured}
            onCommit={(startMs) => range({ startMs })}
          />
          <NumberField
            label="Fin (ms)"
            value={layer.endMs}
            min={1}
            disabled={!measured}
            onCommit={(endMs) =>
              range({
                endMs,
                ...(layer.endAnchor === 'scene-end' && endMs !== sceneDuration
                  ? { endAnchor: 'fixed' as const }
                  : {}),
              })
            }
          />
        </div>
        <SelectField
          label="Anclaje del fin"
          value={layer.endAnchor}
          onChange={(e) => {
            if (e.target.value === 'fixed') patch({ endAnchor: 'fixed' });
            else if (sceneDuration !== undefined)
              range({ endAnchor: 'scene-end', endMs: sceneDuration });
          }}
        >
          <option value="fixed">Tiempo fijo</option>
          <option
            value="scene-end"
            disabled={
              sceneDuration === undefined ||
              !!checkLayerRange(layer, { endMs: sceneDuration }, asset?.durationMs)
            }
          >
            Fin de la escena
          </option>
        </SelectField>
        {sceneDuration !== undefined && layer.endMs > sceneDuration && (
          <p className="edit-note">La capa termina fuera de la escena.</p>
        )}
      </fieldset>
      <fieldset className="edit-section">
        <legend>Composición</legend>
        <div className="edit-grid">
          {box &&
            (['x', 'y', 'width', 'height'] as const).map((key) => (
              <NumberField
                key={key}
                label={{ x: 'X (px)', y: 'Y (px)', width: 'Ancho (px)', height: 'Alto (px)' }[key]}
                step="any"
                value={box[key]}
                onCommit={(value) => {
                  if ((key === 'width' || key === 'height') && value <= 0)
                    return 'El tamaño debe ser mayor que cero.';
                  patch({ box: { ...box, [key]: value } });
                }}
              />
            ))}
          <NumberField
            label="Orden Z"
            value={layer.zIndex}
            onCommit={(zIndex) => patch({ zIndex })}
          />
          <label className="edit-check">
            <input
              type="checkbox"
              checked={layer.visible}
              onChange={(e) => patch({ visible: e.target.checked })}
            />
            Visible
          </label>
        </div>
        {box && boxOverflows(box, canvas) && (
          <div className="edit-note">
            La capa sobresale del lienzo.{' '}
            <button
              type="button"
              className="edit-button"
              onClick={() => patch({ box: fitBox(box, canvas) })}
            >
              Encajar en el lienzo
            </button>
          </div>
        )}
      </fieldset>
      {'assetId' in layer && (
        <MediaInspector sceneId={sceneId} layer={layer} asset={asset} onCommand={onCommand} />
      )}
      {layer.type === 'component' &&
        (manifest ? (
          <ComponentProperties
            key={JSON.stringify([layer.id, layer.componentRef, layer.props, manifest])}
            manifest={manifest}
            props={layer.props}
            onApply={(props) => patch({ props })}
          />
        ) : (
          <p className="edit-note" role="status">
            {manifest === null ? 'Manifiesto no disponible.' : 'Cargando manifiesto…'}
          </p>
        ))}
    </section>
  );
}
