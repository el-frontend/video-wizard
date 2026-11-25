'use client';
import { useState } from 'react';
import type { EntryOf } from '@workspace/video-project';
import {
  AssetField,
  FontFields,
  object,
  fieldText,
  useIdentity,
  type Publish,
} from './edition-fields';
export function BrandEditor({
  entry,
  nextVersion,
  publish,
}: {
  entry?: EntryOf<'brand'>;
  nextVersion: number;
  publish: Publish;
}) {
  const identity = useIdentity(entry, nextVersion);
  const [logos, setLogos] = useState(entry?.logos ?? []),
    [logoId, setLogoId] = useState(''),
    [variant, setVariant] = useState(''),
    [fonts, setFonts] = useState(entry?.fonts ?? []),
    [tone, setTone] = useState(entry?.tone ?? '');
  const values = entry?.values ?? {},
    palette = object(values.colors),
    display = object(object(values.typography).display);
  const [color, setColor] = useState(fieldText(palette.accent, '#FF6A3D')),
    [useColor, setUseColor] = useState(!!palette.accent || !entry),
    [font, setFont] = useState(fieldText(display.fontFamily, ''));
  const extraColors = { background: 'Fondo', foreground: 'Texto', surface: 'Superficie' };
  const [extra, setExtra] = useState<Record<string, string>>(
    Object.fromEntries(
      Object.keys(extraColors).flatMap((k) =>
        typeof palette[k] === 'string' ? [[k, palette[k]]] : []
      )
    )
  );
  return (
    <form
      className="library-fields"
      onSubmit={(e) => {
        e.preventDefault();
        const colors = { ...palette };
        for (const k of Object.keys(extraColors)) {
          if (extra[k]) colors[k] = extra[k]!;
          else delete colors[k];
        }
        if (useColor) colors.accent = color;
        else delete colors.accent;
        const typography = { ...object(values.typography), display: { ...display } };
        if (font) typography.display.fontFamily = font;
        else delete typography.display.fontFamily;
        void publish('/api/studio/libraries/brand', {
          ...identity.data(),
          kind: 'brand',
          values: { ...values, colors, typography },
          logos,
          fonts,
          tone,
          assetIds: [
            ...new Set([
              ...fonts.map((f) => f.assetId),
              ...logos.map((l) => l.assetId),
              ...(entry?.assetIds ?? []).filter(
                (id) =>
                  !entry?.fonts?.some((f) => f.assetId === id) &&
                  !entry?.logos?.some((l) => l.assetId === id)
              ),
            ]),
          ],
        });
      }}
    >
      {identity.fields}
      <label className="library-check">
        <input type="checkbox" checked={useColor} onChange={(e) => setUseColor(e.target.checked)} />
        Aplicar acento de marca
      </label>
      {useColor && (
        <label>
          Color de acento
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
      )}
      <details>
        <summary>Colores adicionales</summary>
        <p>Se aplican cuando el estilo admite el color de marca.</p>
        {Object.entries(extraColors).map(([k, label]) => (
          <div key={k}>
            <label className="library-check">
              <input
                type="checkbox"
                checked={!!extra[k]}
                onChange={(e) =>
                  setExtra({
                    ...extra,
                    [k]: e.target.checked ? (k === 'foreground' ? '#111111' : '#FFFFFF') : '',
                  })
                }
              />
              Usar {label.toLowerCase()}
            </label>
            {extra[k] && (
              <label>
                {label}
                <input
                  type="color"
                  value={extra[k]}
                  onChange={(e) => setExtra({ ...extra, [k]: e.target.value })}
                />
              </label>
            )}
          </div>
        ))}
      </details>
      <FontFields
        fonts={fonts}
        onChange={(next) => {
          setFonts(next);
          if (!next.some((f) => f.family === font)) setFont('');
        }}
      />
      <label>
        Fuente de marca
        <select value={font} onChange={(e) => setFont(e.target.value)}>
          <option value="">Heredar del estilo</option>
          {[...new Set(fonts.map((f) => f.family))].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <fieldset>
        <legend>Logos y variantes</legend>
        <ul>
          {logos.map((l, i) => (
            <li key={i}>
              {l.name}{' '}
              <button type="button" onClick={() => setLogos(logos.filter((_, j) => i !== j))}>
                Quitar
              </button>
            </li>
          ))}
        </ul>
        <AssetField label="Imagen del logo" media="image" value={logoId} onChange={setLogoId} />
        <label>
          Nombre de la variante
          <input value={variant} onChange={(e) => setVariant(e.target.value)} />
        </label>
        <button
          type="button"
          className="edit-button"
          disabled={!variant.trim() || !logoId || logos.some((l) => l.name === variant.trim())}
          onClick={() => {
            setLogos([...logos, { name: variant.trim(), assetId: logoId }]);
            setVariant('');
            setLogoId('');
          }}
        >
          Añadir variante
        </button>
      </fieldset>
      <label>
        Nota de tono
        <textarea
          rows={3}
          maxLength={4000}
          value={tone}
          onChange={(e) => setTone(e.target.value)}
        />
      </label>
      <button className="studio-primary">Publicar marca</button>
    </form>
  );
}
