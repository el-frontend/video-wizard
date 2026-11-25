'use client';
import { useState } from 'react';
import type { EntryOf, LibraryEntry, JsonValue } from '@workspace/video-project';
import { useAssetPage } from '../hooks/use-library';
export type FontBinding = NonNullable<EntryOf<'brand'>['fonts']>[number];
export type Publish = (url: string, data: unknown) => Promise<void>;
export function object(value: JsonValue | undefined): Record<string, JsonValue> {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}
export function fieldText(value: JsonValue | undefined, fallback: string) {
  return typeof value === 'string' ? value : fallback;
}
export function useIdentity(entry: LibraryEntry | undefined, nextVersion: number) {
  const [name, setName] = useState(entry?.name ?? ''),
    [copy, setCopy] = useState(!entry);
  return {
    data: () => ({
      name: name.trim(),
      id: copy || !entry ? crypto.randomUUID() : entry.id,
      version: copy || !entry ? 1 : nextVersion,
    }),
    fields: (
      <>
        <label>
          Nombre
          <input required value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        {entry && (
          <label>
            Publicar como
            <select
              value={copy ? 'copy' : 'version'}
              onChange={(e) => setCopy(e.target.value === 'copy')}
            >
              <option value="version">Nueva versión · v{nextVersion}</option>
              <option value="copy">Entrada independiente · v1</option>
            </select>
          </label>
        )}
      </>
    ),
  };
}
export function AssetField({
  media,
  label,
  value,
  onChange,
  name,
  required,
}: {
  media: 'image' | 'font' | 'audio' | 'video';
  name?: string;
  required?: boolean;
  label: string;
  value: string;
  onChange: (id: string, name: string) => void;
}) {
  const page = useAssetPage(media);
  return (
    <div>
      <label>
        {label}
        <select
          name={name}
          required={required}
          value={value}
          onChange={(e) =>
            onChange(e.target.value, page.items.find((x) => x.id === e.target.value)?.name ?? '')
          }
        >
          <option value="">Seleccionar recurso</option>
          {value && !page.items.some((x) => x.id === value) && (
            <option value={value}>{value}</option>
          )}
          {page.items.map((x) => (
            <option value={x.id} key={x.id}>
              {x.name}
            </option>
          ))}
        </select>
      </label>
      {page.cursor && (
        <button type="button" className="edit-button" disabled={page.busy} onClick={page.more}>
          Mostrar más recursos
        </button>
      )}
      {page.error && <small role="alert">{page.error}</small>}
    </div>
  );
}
export function FontFields({
  fonts,
  onChange,
}: {
  fonts: FontBinding[];
  onChange: (fonts: FontBinding[]) => void;
}) {
  const [id, setId] = useState(''),
    [family, setFamily] = useState(''),
    [min, setMin] = useState(400),
    [max, setMax] = useState(400);
  return (
    <details>
      <summary>Fuentes vinculadas ({fonts.length})</summary>
      <ul>
        {fonts.map((f, i) => (
          <li key={i}>
            {f.family} · {f.weight.min}–{f.weight.max}{' '}
            <button
              type="button"
              aria-label={'Quitar ' + f.family}
              onClick={() => onChange(fonts.filter((_, j) => j !== i))}
            >
              Quitar
            </button>
          </li>
        ))}
      </ul>
      <AssetField
        media="font"
        label="Archivo de fuente"
        value={id}
        onChange={(v, name) => {
          setId(v);
          setFamily(name.replace(/\.[^.]+$/, ''));
        }}
      />
      <label>
        Nombre de familia
        <input value={family} onChange={(e) => setFamily(e.target.value)} />
      </label>
      <div className="library-pair">
        <label>
          Peso mínimo
          <input
            type="number"
            min={1}
            max={1000}
            value={min}
            onChange={(e) => setMin(Number(e.target.value))}
          />
        </label>
        <label>
          Peso máximo
          <input
            type="number"
            min={min}
            max={1000}
            value={max}
            onChange={(e) => setMax(Number(e.target.value))}
          />
        </label>
      </div>
      <button
        className="edit-button"
        type="button"
        disabled={!id || !family.trim() || min < 1 || max < min || max > 1000}
        onClick={() => {
          onChange([...fonts, { assetId: id, family: family.trim(), weight: { min, max } }]);
          setId('');
          setFamily('');
        }}
      >
        Vincular fuente
      </button>
    </details>
  );
}
