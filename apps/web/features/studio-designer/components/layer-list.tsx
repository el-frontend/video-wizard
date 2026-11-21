'use client';
import { SelectField } from './select-field';
import { useLayoutEffect, useRef, useState } from 'react';
import { Layers } from 'lucide-react';
import type { AssetDescriptor, Layer, Scene } from '@workspace/video-project';
import {
  mediaLayer,
  moveBeforeId,
  titleLayer,
  type Canvas,
  type CommandHandler,
} from '../lib/editor-commands';
import { uploadEditorAsset } from '../hooks/use-editor-dependencies';

const names = {
  text: 'Texto',
  audio: 'Audio',
  video: 'Video',
  image: 'Imagen',
  component: 'Componente',
  captions: 'Subtítulos',
};
interface Props {
  scene: Scene;
  canvas: Canvas;
  assets: AssetDescriptor[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCommand: CommandHandler;
}

export function LayerList({ scene, canvas, assets, selectedId, onSelect, onCommand }: Props) {
  const ordered = [...scene.layers].sort((a, b) => a.zIndex - b.zIndex);
  const index = ordered.findIndex((layer) => layer.id === selectedId);
  const [status, setStatus] = useState(''),
    [busy, setBusy] = useState(false);
  const addButton = useRef<HTMLButtonElement>(null);
  const upload = useRef<AbortController | null>(null);
  const latest = useRef({ scene, canvas, onCommand });
  useLayoutEffect(() => {
    latest.current = { scene, canvas, onCommand };
  }, [scene, canvas, onCommand]);
  useLayoutEffect(() => () => upload.current?.abort(), []);
  function add(layer: Layer) {
    onCommand({ type: 'add-layer', sceneId: scene.id, layer });
  }
  function move(direction: -1 | 1) {
    if (selectedId)
      onCommand({
        type: 'reorder-layer',
        sceneId: scene.id,
        layerId: selectedId,
        order: 'z-index',
        beforeId: moveBeforeId(ordered, selectedId, direction),
      });
  }
  async function addFile(file: File) {
    upload.current?.abort();
    const controller = new AbortController();
    upload.current = controller;
    setBusy(true);
    setStatus('Subiendo recurso…');
    try {
      const asset = await uploadEditorAsset(file, controller.signal);
      if (controller.signal.aborted) return;
      const current = latest.current;
      current.onCommand({
        type: 'add-layer',
        sceneId: current.scene.id,
        layer: mediaLayer(current.scene, current.canvas, asset),
      });
      setStatus('Recurso añadido.');
    } catch (cause) {
      if (!controller.signal.aborted)
        setStatus(cause instanceof Error ? cause.message : 'No se pudo añadir el recurso.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
    }
  }
  return (
    <section className="edit-panel" aria-label="Capas de la escena">
      <h2>
        <Layers aria-hidden="true" size={19} /> Capas
      </h2>
      <ol className="edit-list">
        {ordered
          .slice()
          .reverse()
          .map((layer) => (
            <li key={layer.id}>
              <button
                type="button"
                aria-pressed={layer.id === selectedId}
                onClick={() => onSelect(layer.id)}
              >
                <span>
                  {layer.type === 'text'
                    ? layer.text || 'Texto vacío'
                    : layer.type === 'component'
                      ? layer.componentRef.id
                      : 'assetId' in layer
                        ? assets.find((asset) => asset.id === layer.assetId)?.name ||
                          names[layer.type]
                        : names[layer.type]}
                </span>
                <small>{layer.visible ? 'Z ' + layer.zIndex : 'Oculta'}</small>
              </button>
            </li>
          ))}
      </ol>
      <div className="edit-actions">
        <button
          type="button"
          className="edit-button"
          ref={addButton}
          onClick={() => add(titleLayer(scene, canvas))}
        >
          Añadir título
        </button>
        {index >= 0 && (
          <>
            <button
              type="button"
              className="edit-button"
              disabled={index === ordered.length - 1}
              onClick={() => move(1)}
            >
              Subir capa
            </button>
            <button
              type="button"
              className="edit-button"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              Bajar capa
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => {
                addButton.current?.focus();
                onCommand({ type: 'remove-layer', sceneId: scene.id, layerId: ordered[index]!.id });
              }}
            >
              Quitar capa
            </button>
          </>
        )}
      </div>
      <details className="edit-section">
        <summary>Añadir multimedia</summary>
        <label className="edit-button edit-upload">
          Subir archivo
          <input
            type="file"
            accept="image/*,video/*,audio/*"
            disabled={busy}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void addFile(file);
            }}
          />
        </label>
        {assets.length > 0 && (
          <SelectField
            label="Usar recurso del proyecto"
            value=""
            onChange={(e) => {
              const asset = assets.find((a) => a.id === e.target.value);
              if (asset) {
                try {
                  add(mediaLayer(scene, canvas, asset));
                  setStatus('Recurso añadido.');
                } catch (cause) {
                  setStatus(cause instanceof Error ? cause.message : 'No se pudo añadir la capa.');
                }
              }
            }}
          >
            <option value="">Seleccionar recurso…</option>
            {assets
              .filter((asset) => /^(audio|video|image)\//.test(asset.mediaType))
              .map((asset) => (
                <option key={asset.id} value={asset.id}>
                  {asset.name}
                </option>
              ))}
          </SelectField>
        )}
        <small role="status">{status}</small>
      </details>
    </section>
  );
}
