'use client';
import { useSessionRecovery } from '@/features/auth/lib/use-session-recovery';
import { useEffect, useId, useState } from 'react';
import {
  AssetDescriptorSchema,
  type AssetDescriptor,
  supportsStudioEngine,
  type EntryOf,
  type EngineId,
  type LibraryEntry,
  type LibraryRef,
  type ProjectDraft,
  type Scene,
  type ProjectCommand,
  type Layer,
} from '@workspace/video-project';
import { useLibrary, keyOf, pin } from '@/features/studio-libraries/hooks/use-library';
import { useLibraryDiagnostics } from '../hooks/use-library-diagnostics';
import { projectRequest } from '@/features/studio-projects/project-api';
import { captionLayer, type CommandHandler } from '../lib/editor-commands';

export function appearanceCommand(entry: EntryOf<'style'> | EntryOf<'brand'>): ProjectCommand {
  return entry.kind === 'brand'
    ? { type: 'set-brand', snapshot: { ref: pin(entry), values: entry.values } }
    : { type: 'set-style', ref: pin(entry) };
}
export const compatibleEntries = (entries: LibraryEntry[], engine: EngineId) =>
  entries.filter((e) => supportsStudioEngine(e, engine));
function RefSelect({
  label,
  refValue,
  entries,
  onChange,
  empty,
}: {
  label: string;
  refValue: LibraryRef | null | undefined;
  entries: LibraryEntry[];
  onChange: (row: LibraryEntry | undefined) => void;
  empty: string;
}) {
  const id = useId();
  const value = refValue ? keyOf(refValue) : '';
  return (
    <div>
      <label htmlFor={id}>{label}</label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(entries.find((row) => keyOf(row) === e.target.value))}
      >
        <option value="">{empty}</option>
        {refValue && !entries.some((e) => keyOf(e) === value) && (
          <option value={value}>
            {refValue.id} · v{refValue.version} (fijado)
          </option>
        )}
        {entries.map((e) => (
          <option key={keyOf(e)} value={keyOf(e)}>
            {e.name} · v{e.version}
          </option>
        ))}
      </select>
    </div>
  );
}
export function AppearancePicker({
  document: d,
  catalogGeneration = 0,
  scene,
  layer,
  onCommand,
}: {
  document: ProjectDraft;
  catalogGeneration?: number;
  scene?: Scene;
  layer?: Layer;
  onCommand: CommandHandler;
}) {
  const styles = useLibrary('style', d.engine),
    brands = useLibrary('brand', d.engine),
    components = useLibrary('component', d.engine, { generation: catalogGeneration }),
    templates = useLibrary('template', d.engine);
  const [variant, setVariant] = useState(''),
    [preset, setPreset] = useState('');
  const brand = brands.entries.find(
    (row) => row.kind === 'brand' && d.brandSnapshot && keyOf(row) === keyOf(d.brandSnapshot.ref)
  );
  const logos = brand?.kind === 'brand' ? (brand.logos ?? []) : [],
    logo = logos.find((l) => l.assetId === variant) ?? logos[0];
  const recovery = useSessionRecovery();
  const logoId = logo?.assetId;
  const [image, setImage] = useState<AssetDescriptor | null>(),
    [imageError, setImageError] = useState<string>();
  useEffect(() => {
    if (!logoId) return;
    const controller = new AbortController();
    projectRequest<unknown>('/api/studio/assets/' + encodeURIComponent(logoId) + '/metadata', {
      signal: controller.signal,
    })
      .then((value) => {
        const metadata = AssetDescriptorSchema.parse(value);
        if (
          metadata.id !== logoId ||
          !metadata.mediaType.startsWith('image/') ||
          !metadata.width ||
          !metadata.height
        )
          throw new Error('Imagen de logo inválida.');
        if (!controller.signal.aborted) {
          setImage(metadata);
          setImageError(undefined);
        }
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setImage(null);
          setImageError(logoId);
        }
      });
    return () => controller.abort();
  }, [logoId, recovery]);
  const rows = compatibleEntries(
    [...styles.entries, ...brands.entries, ...components.entries, ...templates.entries],
    d.engine
  );
  const loaded = [styles, brands, components, templates].every(
    (list) => !list.loading && !list.error
  );
  const { issues, error: pinError, library } = useLibraryDiagnostics(d, rows, loaded);
  const visuals = components.entries.filter(
    (e): e is EntryOf<'component'> => e.kind === 'component' && 'schemaVersion' in e.manifest
  );
  const current =
    layer?.type === 'component'
      ? library?.find((e) => keyOf(e) === keyOf(layer.componentRef))
      : undefined;
  if (
    current?.kind === 'component' &&
    'schemaVersion' in current.manifest &&
    !visuals.some((e) => keyOf(e) === keyOf(current))
  )
    visuals.push(current);
  const [visual, setVisual] = useState('');
  const selectedVisual = visuals.find(
    (e) => keyOf(e) === (visual || (current ? keyOf(current) : ''))
  );
  const selectedPreset = components.entries
    .filter((e) => e.kind === 'component' && e.manifest.builtin)
    .find((e) => keyOf(e) === preset);
  function insertLogo() {
    if (!scene || image?.id !== logoId || !image?.width || !image.height) return;
    const scale = Math.min(
      (d.canvas.width * 0.2) / image.width,
      (d.canvas.height * 0.15) / image.height
    );
    onCommand({
      type: 'add-layer',
      sceneId: scene.id,
      layer: {
        id: crypto.randomUUID(),
        type: 'image',
        assetId: image.id,
        visible: true,
        zIndex: Math.max(-1, ...scene.layers.map((l) => l.zIndex)) + 1,
        startMs: 0,
        endMs: scene.durationMs,
        endAnchor: 'scene-end',
        box: {
          x: d.canvas.width * 0.05,
          y: d.canvas.height * 0.05,
          width: image.width * scale,
          height: image.height * scale,
        },
      },
    });
  }
  return (
    <section className="edit-panel library-fields">
      <h2>Apariencia</h2>
      <RefSelect
        label="Estilo del proyecto"
        refValue={d.styleRef}
        entries={styles.entries}
        empty="Sin estilo"
        onChange={(row) =>
          onCommand(
            row?.kind === 'style' ? appearanceCommand(row) : { type: 'set-style', ref: null }
          )
        }
      />
      <RefSelect
        label="Marca del proyecto"
        refValue={d.brandSnapshot?.ref}
        entries={brands.entries}
        empty="Sin marca"
        onChange={(row) =>
          onCommand(
            row?.kind === 'brand' ? appearanceCommand(row) : { type: 'set-brand', snapshot: null }
          )
        }
      />
      {logo && scene && (
        <>
          <label>
            Variante del logo
            <select value={logo.assetId} onChange={(e) => setVariant(e.target.value)}>
              {logos.map((l) => (
                <option key={l.name} value={l.assetId}>
                  {l.name}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            className="edit-button"
            disabled={image?.id !== logoId}
            onClick={insertLogo}
          >
            Insertar logo
          </button>
          {imageError === logoId && (
            <small role="alert">La variante de logo no está disponible.</small>
          )}
        </>
      )}
      {scene && (
        <details>
          <summary>Referencias de la escena</summary>
          <RefSelect
            label="Plantilla de procedencia"
            entries={templates.entries}
            refValue={scene.templateRef}
            empty="Sin referencia"
            onChange={(row) =>
              onCommand({
                type: 'set-scene-template',
                sceneId: scene.id,
                ref: row ? pin(row) : null,
              })
            }
          />
          {visuals.length > 0 && (
            <>
              <label>
                Componente visual
                <select
                  value={selectedVisual ? keyOf(selectedVisual) : ''}
                  onChange={(e) => setVisual(e.target.value)}
                >
                  <option value="">Elige un componente</option>
                  {visuals.map((e) => (
                    <option key={keyOf(e)} value={keyOf(e)}>
                      {e.name} · v{e.version}
                    </option>
                  ))}
                </select>
              </label>
              <button
                type="button"
                className="edit-button"
                disabled={!selectedVisual}
                onClick={() => {
                  if (!selectedVisual || !('schemaVersion' in selectedVisual.manifest)) return;
                  const m = selectedVisual.manifest,
                    props = structuredClone(m.initialProps),
                    componentRef = pin(selectedVisual);
                  if (layer?.type === 'component') {
                    onCommand({
                      type: 'update-layer',
                      sceneId: scene.id,
                      layerId: layer.id,
                      patch: { componentRef, props },
                    });
                    return;
                  }
                  onCommand({
                    type: 'add-layer',
                    sceneId: scene.id,
                    layer: {
                      type: 'component',
                      id: crypto.randomUUID(),
                      startMs: 0,
                      endMs: Math.min(scene.durationMs, m.defaultDurationMs),
                      endAnchor: 'fixed',
                      visible: true,
                      zIndex: Math.max(-1, ...scene.layers.map((l) => l.zIndex)) + 1,
                      box: { x: 0, y: 0, ...m.defaultSize },
                      componentRef,
                      props,
                    },
                  });
                }}
              >
                {layer?.type === 'component'
                  ? 'Cambiar componente visual'
                  : 'Insertar componente visual'}
              </button>
            </>
          )}
          <label>
            Componente de subtítulos
            <select
              value={selectedPreset ? preset : ''}
              onChange={(e) => setPreset(e.target.value)}
            >
              <option value="">Elige un preset</option>
              {components.entries
                .filter((e) => e.kind === 'component' && e.manifest.builtin)
                .map((e) => (
                  <option value={keyOf(e)} key={keyOf(e)}>
                    {e.name} · v{e.version}
                  </option>
                ))}
            </select>
          </label>
          <button
            type="button"
            className="edit-button"
            disabled={!selectedPreset}
            onClick={() => {
              if (!selectedPreset) return;
              if (layer?.type === 'component') {
                onCommand({
                  type: 'update-layer',
                  sceneId: scene.id,
                  layerId: layer.id,
                  patch: { componentRef: pin(selectedPreset), props: {} },
                });
                return;
              }
              if (layer?.type === 'captions') {
                onCommand({
                  type: 'set-caption-preset',
                  sceneId: scene.id,
                  layerId: layer.id,
                  ref: pin(selectedPreset),
                });
                return;
              }
              const next = captionLayer(scene, d.canvas);
              if (next.type === 'captions')
                onCommand({
                  type: 'add-layer',
                  sceneId: scene.id,
                  layer: {
                    ...next,
                    templateRef: pin(selectedPreset),
                    box: { x: 0, y: 0, width: d.canvas.width, height: d.canvas.height },
                    cues: [
                      {
                        id: crypto.randomUUID(),
                        startMs: 0,
                        endMs: scene.durationMs,
                        text: scene.editorial?.headline ?? 'Subtítulo',
                      },
                    ],
                  },
                });
            }}
          >
            {layer?.type === 'captions' || layer?.type === 'component'
              ? 'Aplicar a la capa'
              : 'Insertar capa con preset'}
          </button>
        </details>
      )}
      {[styles, brands, components, templates].some((l) => l.error) && (
        <p role="alert">No se pudieron cargar todas las bibliotecas.</p>
      )}
      {pinError && <p role="alert">{pinError}</p>}
      {!!issues.length && (
        <div role="status" className="studio-warning">
          <strong>Referencias que bloquean la exportación</strong>
          <ul>
            {issues.map((i, n) => (
              <li key={n}>
                {i.message}
                {i.sceneId && ' · Escena ' + (d.scenes.findIndex((s) => s.id === i.sceneId) + 1)}
                {i.layerId && ' · Capa ' + i.layerId}
              </li>
            ))}
          </ul>
          <p>Sustituye o quita las referencias incompatibles con el motor.</p>
        </div>
      )}
    </section>
  );
}
