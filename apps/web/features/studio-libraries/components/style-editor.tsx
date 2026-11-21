'use client';
import { useState } from 'react';
import {
  styleFamily,
  StudioBrandRoleSchema,
  StyleFamilySchema,
  type EntryOf,
  type StyleFamily,
} from '@workspace/video-project';
import { fieldText, FontFields, object, useIdentity, type Publish } from './edition-fields';

const familyNames = {
  'noticias-elfrontend-web': 'ElFrontend Web',
  'noticias-liquid-glass': 'Liquid Glass',
  'noticias-modern-editorial': 'Modern Editorial',
};
const colorNames = {
  background: 'Fondo',
  foreground: 'Texto',
  accent: 'Acento',
  surface: 'Superficie',
};
export function StyleEditor({
  entry,
  nextVersion,
  publish,
}: {
  entry?: EntryOf<'style'>;
  nextVersion: number;
  publish: Publish;
}) {
  const identity = useIdentity(entry, nextVersion),
    tokens = entry?.tokens ?? {},
    palette = object(tokens.colors),
    display = object(object(tokens.typography).display);
  const [family, setFamily] = useState<StyleFamily['id']>(
      (entry && styleFamily(entry)?.id) ??
        StyleFamilySchema.shape.id.safeParse(entry?.id).data ??
        'noticias-modern-editorial'
    ),
    [fonts, setFonts] = useState(entry?.fonts ?? []);
  const [roles, setRoles] = useState(
    entry?.exposedRoles ?? ['colors.accent', 'typography.display.fontFamily']
  );
  const [colors, setColors] = useState({
    background: fieldText(palette.background, '#111411'),
    foreground: fieldText(palette.foreground, '#F2F5EC'),
    accent: fieldText(palette.accent, '#D6FF62'),
    surface: fieldText(palette.surface, '#1C221C'),
  });
  const [font, setFont] = useState(fieldText(display.fontFamily, 'sans-serif')),
    [weight, setWeight] = useState(Number(display.weight ?? 700)),
    [size, setSize] = useState(Number(display.cqw ?? 6)),
    [line, setLine] = useState(Number(display.lineHeight ?? 1.15)),
    [archive, setArchive] = useState(entry?.frameMarkdown ?? '');
  return (
    <form
      className="library-fields"
      onSubmit={(e) => {
        e.preventDefault();
        void publish('/api/studio/library-editions', {
          ...identity.data(),
          kind: 'style',
          family: { id: family, version: 1 },
          tokens: {
            colors,
            typography: { display: { fontFamily: font, weight, cqw: size, lineHeight: line } },
          },
          fonts,
          exposedRoles: roles,
          frameMarkdown: archive,
        });
      }}
    >
      {identity.fields}
      <label>
        Familia visual
        <select value={family} onChange={(e) => setFamily(e.target.value as typeof family)}>
          {StyleFamilySchema.shape.id.options.map((id) => (
            <option value={id} key={id}>
              {familyNames[id]}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="library-colors">
        <legend>Paleta</legend>
        {(Object.keys(colors) as (keyof typeof colors)[]).map((role) => (
          <label key={role}>
            {colorNames[role]}
            <input
              type="color"
              value={colors[role]}
              onChange={(e) => setColors({ ...colors, [role]: e.target.value })}
            />
          </label>
        ))}
      </fieldset>
      <details>
        <summary>Valores que puede aplicar una marca</summary>
        {StudioBrandRoleSchema.options.map((role) => (
          <label key={role} className="library-check">
            <input
              type="checkbox"
              checked={roles.includes(role)}
              onChange={(e) =>
                setRoles(e.target.checked ? [...roles, role] : roles.filter((r) => r !== role))
              }
            />
            {role === 'typography.display.fontFamily'
              ? 'Fuente del título'
              : colorNames[role.substring(7) as keyof typeof colorNames]}
          </label>
        ))}
      </details>
      <FontFields
        fonts={fonts}
        onChange={(next) => {
          setFonts(next);
          if (!next.some((f) => f.family === font)) setFont('sans-serif');
        }}
      />
      <label>
        Tipografía del título
        <select value={font} onChange={(e) => setFont(e.target.value)}>
          {[...new Set(['sans-serif', ...fonts.map((f) => f.family)])].map((f) => (
            <option key={f}>{f}</option>
          ))}
        </select>
      </label>
      <div className="library-pair">
        <label>
          Peso
          <input
            type="number"
            min="1"
            max="1000"
            required
            value={weight}
            onChange={(e) => setWeight(Number(e.target.value))}
          />
        </label>
        <label>
          Tamaño (% del ancho)
          <input
            type="number"
            min=".1"
            max="100"
            step=".1"
            required
            value={size}
            onChange={(e) => setSize(Number(e.target.value))}
          />
        </label>
      </div>
      <label>
        Interlineado
        <input
          type="number"
          min=".5"
          max="4"
          step=".01"
          required
          value={line}
          onChange={(e) => setLine(Number(e.target.value))}
        />
      </label>
      <details>
        <summary>Referencia de diseño archivada</summary>
        <label>
          Documento de referencia
          <textarea rows={6} value={archive} onChange={(e) => setArchive(e.target.value)} />
        </label>
      </details>
      <button className="studio-primary">Publicar estilo</button>
    </form>
  );
}
