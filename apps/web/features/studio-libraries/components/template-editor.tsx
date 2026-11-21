'use client';
import { useState } from 'react';
import type {
  EntryOf,
  EngineId,
  TemplateSlot,
  TemplateStructure,
  LibraryManifest,
  ProjectRecord,
  JsonValue,
} from '@workspace/video-project';
import { TemplateStructureSchema } from '@workspace/video-project';
import { post, pin, useLibrary, keyOf } from '../hooks/use-library';
import { AssetField, useIdentity, type Publish } from './edition-fields';
import Link from 'next/link';

type Field = LibraryManifest['props'][string];
type Binding = { name: string; field: Field; target: TemplateSlot };
const basic: TemplateStructure = {
  version: 1,
  canvas: { width: 1080, height: 1920, fps: 30 },
  globalAudio: [],
  styleRef: null,
  slots: {},
  scenes: [
    {
      id: 'portada',
      durationMs: 3000,
      layers: [
        {
          type: 'text',
          id: 'titulo',
          text: 'Titular',
          startMs: 0,
          endMs: 3000,
          endAnchor: 'scene-end',
          visible: true,
          zIndex: 0,
          box: { x: 84, y: 400, width: 912, height: 680 },
        },
      ],
    },
  ],
};
function targets(s: TemplateStructure, components: EntryOf<'component'>[]) {
  const options: { label: string; target: TemplateSlot; type: Field['type'] }[] = [];
  for (const [i, scene] of s.scenes.entries()) {
    const sceneId = scene.id;
    const add = (label: string, target: TemplateSlot, type: Field['type'] = 'string') =>
      options.push({ label: 'Escena ' + (i + 1) + ' · ' + label, target, type });
    add('Titular', { field: 'headline', sceneId });
    add('Narración', { field: 'narration', sceneId });
    for (const [j, l] of scene.layers.entries()) {
      const layerId = l.id,
        location = { sceneId, layerId },
        prefix = 'Capa ' + (j + 1) + ' · ';
      if (l.type === 'text') add(prefix + 'Texto', { ...location, field: 'text' });
      if (l.type === 'captions')
        for (const [k, c] of l.cues.entries())
          add(prefix + 'Subtítulo ' + (k + 1), { ...location, cueId: c.id, field: 'caption' });
      if ('assetId' in l) add(prefix + 'Recurso', { ...location, field: 'asset' });
      if (l.type === 'component') {
        const e = components.find((row) => keyOf(row) === keyOf(l.componentRef));
        for (const [key, def] of Object.entries(e?.manifest.props ?? {}))
          add(prefix + key, { ...location, field: 'prop', key }, def.type);
      }
    }
  }
  for (const [i, l] of s.globalAudio.entries())
    options.push({
      label: 'Audio global ' + (i + 1),
      target: { field: 'asset', sceneId: null, layerId: l.id },
      type: 'string',
    });
  return options;
}
function sameTarget(a: TemplateSlot, b: TemplateSlot) {
  return Object.entries(a).every(([k, v]) =>
    Object.entries(b).some(([key, value]) => key === k && value === v)
  );
}
export function TemplateEditor({
  engine = 'remotion',
  entry,
  nextVersion,
  publish,
}: {
  engine?: EngineId;
  entry?: EntryOf<'template'>;
  nextVersion: number;
  publish: Publish;
}) {
  const identity = useIdentity(entry, nextVersion),
    starting = entry?.structure ?? basic;
  const [structure, setStructure] = useState(starting),
    [raw, setRaw] = useState<string | null>(null),
    [error, setError] = useState('');
  const [bindings, setBindings] = useState<Binding[]>(
    Object.entries(starting.slots).map(([name, target]) => ({
      name,
      target,
      field: entry!.manifest.props[name]!,
    }))
  );
  const components = useLibrary('component', engine);
  const options = targets(
    structure,
    components.entries.filter((e) => e.kind === 'component')
  );
  function update(i: number, patch: Partial<Binding>) {
    setBindings(bindings.map((b, j) => (i === j ? { ...b, ...patch } : b)));
  }
  return (
    <form
      className="library-fields"
      onSubmit={(e) => {
        e.preventDefault();
        if (raw !== null) {
          setError('Aplica los cambios de estructura antes de publicar.');
          return;
        }
        if (new Set(bindings.map((b) => b.name.trim())).size !== bindings.length) {
          setError('Cada campo necesita un nombre distinto.');
          return;
        }
        setError('');
        void publish('/api/studio/libraries/template', {
          ...identity.data(),
          kind: 'template',
          engine,
          assetIds: [
            ...new Set([
              ...(entry?.assetIds ?? []),
              ...[...structure.globalAudio, ...structure.scenes.flatMap((s) => s.layers)].flatMap(
                (l) => ('assetId' in l ? [l.assetId] : [])
              ),
            ]),
          ],
          manifest: {
            version: 1,
            props: Object.fromEntries(bindings.map((b) => [b.name.trim(), b.field])),
          },
          structure: {
            ...structure,
            slots: Object.fromEntries(bindings.map((b) => [b.name.trim(), b.target])),
          },
        });
      }}
    >
      {identity.fields}
      <p>Motor · {entry?.engine === 'hyperframes' ? 'HyperFrames' : 'Remotion'}</p>
      <fieldset>
        <legend>Secuencia</legend>
        {structure.scenes.map((s, i) => (
          <div key={s.id} className="library-sequence">
            <strong>Escena {i + 1}</strong>
            <small>
              {s.durationMs} ms · {s.layers.length} capas
            </small>
            {i > 0 && (
              <button
                type="button"
                disabled={raw !== null}
                className="edit-button"
                onClick={() => {
                  const scenes = structure.scenes.slice();
                  scenes.splice(i - 1, 0, ...scenes.splice(i, 1));
                  setStructure({ ...structure, scenes });
                }}
              >
                Subir escena
              </button>
            )}
          </div>
        ))}
        <details>
          <summary>Editar estructura de escenas y capas</summary>
          <label>
            Secuencia, lienzo y audio (JSON)
            <textarea
              rows={9}
              value={
                raw ??
                JSON.stringify(
                  {
                    canvas: structure.canvas,
                    scenes: structure.scenes,
                    globalAudio: structure.globalAudio,
                    styleRef: structure.styleRef,
                  },
                  null,
                  2
                )
              }
              onChange={(e) => setRaw(e.target.value)}
            />
          </label>
          <button
            type="button"
            className="edit-button"
            disabled={raw === null}
            onClick={() => {
              try {
                const parsed = TemplateStructureSchema.parse({
                  ...JSON.parse(raw!),
                  version: 1,
                  slots: {},
                });
                setStructure(parsed);
                setRaw(null);
                setError('');
              } catch {
                setError('Revisa los identificadores, dimensiones e intervalos de la estructura.');
              }
            }}
          >
            Aplicar estructura
          </button>
        </details>
      </fieldset>
      <fieldset>
        <legend>Campos de contenido</legend>
        {bindings.map((b, i) => {
          const selected = options.findIndex((o) => sameTarget(o.target, b.target));
          return (
            <div key={i} className="library-slot">
              <label>
                Nombre del campo
                <input
                  required
                  value={b.name}
                  onChange={(e) => update(i, { name: e.target.value })}
                />
              </label>
              <label>
                Destino
                <select
                  required
                  value={selected < 0 ? '' : selected}
                  onChange={(e) => {
                    const option = options[Number(e.target.value)]!;
                    update(i, { target: option.target, field: { ...b.field, type: option.type } });
                  }}
                >
                  <option disabled value="">
                    Selecciona un destino
                  </option>
                  {options.map((o, j) => (
                    <option key={j} value={j}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="library-check">
                <input
                  type="checkbox"
                  checked={!!b.field.required}
                  onChange={(e) => update(i, { field: { ...b.field, required: e.target.checked } })}
                />
                Obligatorio
              </label>
              <button
                type="button"
                className="edit-button"
                onClick={() => setBindings(bindings.filter((_, j) => i !== j))}
              >
                Quitar campo
              </button>
            </div>
          );
        })}
        <button
          type="button"
          className="edit-button"
          disabled={!options.length}
          onClick={() => {
            const available = options.find(
              (o) => !bindings.some((b) => sameTarget(o.target, b.target))
            );
            if (available)
              setBindings([
                ...bindings,
                { name: '', field: { type: available.type }, target: available.target },
              ]);
          }}
        >
          Añadir campo
        </button>
      </fieldset>
      {error && <p role="alert">{error}</p>}
      <button className="studio-primary">Publicar plantilla</button>
    </form>
  );
}
export function InstantiateForm({ entry }: { entry: EntryOf<'template'> }) {
  const [assetValues, setAssetValues] = useState<Record<string, string>>({});
  const [result, setResult] = useState<ProjectRecord>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const [style, setStyle] = useState(''),
    [brand, setBrand] = useState(''),
    styles = useLibrary('style', entry.engine),
    brands = useLibrary('brand', entry.engine);
  return (
    <form
      className="library-fields"
      onSubmit={async (e) => {
        e.preventDefault();
        if (busy) return;
        const form = new FormData(e.currentTarget);
        setBusy(true);
        setError('');
        setResult(undefined);
        try {
          const values = Object.entries(entry.manifest.props).flatMap(
            ([key, spec]): [string, JsonValue][] => {
              const value = form.get('slot-' + key);
              if (typeof value !== 'string' || value === '') return [];
              return [[key, spec.type === 'string' ? value : JSON.parse(value)]];
            }
          );
          const styleRow = styles.entries.find((row) => keyOf(row) === style),
            brandRow = brands.entries.find((row) => keyOf(row) === brand);
          const record = await post<ProjectRecord>(
            '/api/studio/templates/' + encodeURIComponent(entry.id) + '/instantiate',
            {
              templateRef: pin(entry),
              engine: entry.engine,
              content: Object.fromEntries(values),
              ...(styleRow ? { styleRef: pin(styleRow) } : {}),
              ...(brandRow ? { brandRef: pin(brandRow) } : {}),
            }
          );
          setResult(record);
        } catch (cause) {
          setError(
            cause instanceof SyntaxError
              ? 'El campo necesita un valor JSON válido.'
              : cause instanceof Error
                ? cause.message
                : 'No se pudo crear el proyecto.'
          );
        } finally {
          setBusy(false);
        }
      }}
    >
      <p>Motor · Remotion</p>
      {Object.entries(entry.manifest.props).map(([key, def]) => {
        const slot = entry.structure?.slots[key];
        const s = entry.structure;
        if (s && slot?.field === 'asset') {
          const layer = (
            slot.sceneId === null
              ? s.globalAudio
              : s.scenes.find((scene) => scene.id === slot.sceneId)?.layers
          )?.find((l) => l.id === slot.layerId);
          if (layer && 'assetId' in layer)
            return (
              <AssetField
                key={key}
                label={key}
                name={'slot-' + key}
                required={def.required}
                media={layer.type}
                value={assetValues[key] ?? ''}
                onChange={(id) => setAssetValues({ ...assetValues, [key]: id })}
              />
            );
        }
        return (
          <label key={key}>
            {key}
            {def.required ? ' (obligatorio)' : ''}
            <input
              name={'slot-' + key}
              required={def.required}
              placeholder={
                def.type === 'string' ? 'Usar contenido de la plantilla' : def.type + ' (JSON)'
              }
            />
          </label>
        );
      })}
      <label>
        Estilo inicial
        <select value={style} onChange={(e) => setStyle(e.target.value)}>
          <option value="">Usar el de la plantilla</option>
          {styles.entries.map((e) => (
            <option value={keyOf(e)} key={keyOf(e)}>
              {e.name} · v{e.version}
            </option>
          ))}
        </select>
      </label>
      <label>
        Marca inicial
        <select value={brand} onChange={(e) => setBrand(e.target.value)}>
          <option value="">Sin marca</option>
          {brands.entries.map((e) => (
            <option value={keyOf(e)} key={keyOf(e)}>
              {e.name} · v{e.version}
            </option>
          ))}
        </select>
      </label>
      <button className="studio-primary" disabled={busy}>
        Crear proyecto desde plantilla
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <p role="status">
          Proyecto creado.{' '}
          <Link href={'/designer/' + result.document.id} className="underline">
            Abrir proyecto
          </Link>
        </p>
      )}
    </form>
  );
}
