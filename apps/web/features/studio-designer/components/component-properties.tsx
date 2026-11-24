'use client';
import { useState } from 'react';
import {
  manifestFields,
  validComponentProps,
  JsonObjectSchema,
  type JsonValue,
  type LibraryManifest,
} from '@workspace/video-project';

type Props = Record<string, JsonValue>;

export function ComponentProperties({
  manifest,
  props,
  onApply,
}: {
  manifest: LibraryManifest;
  props: Props;
  onApply: (props: Props) => void;
}) {
  const fields = Object.entries(manifestFields(manifest));
  const [error, setError] = useState('');
  const [edited, setEdited] = useState<Record<string, string>>(() =>
    Object.fromEntries(
      fields.map(([name, field]) => {
        const value = Object.hasOwn(props, name) ? props[name] : undefined;
        return [
          name,
          value === undefined
            ? ''
            : field.type === 'string' && typeof value === 'string'
              ? value
              : JSON.stringify(value),
        ];
      })
    )
  );
  const [included, setIncluded] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      fields.map(([name, field]) => [name, !!field.required || Object.hasOwn(props, name)])
    )
  );
  return (
    <form
      className="edit-section"
      onSubmit={(event) => {
        event.preventDefault();
        const values = new Map(Object.entries(props));
        try {
          for (const [name, field] of fields) {
            if (!included[name]) {
              values.delete(name);
              continue;
            }
            const raw = edited[name] ?? '';
            const value = field.type === 'string' ? raw : JSON.parse(raw);
            values.set(name, value);
          }
          const next = JsonObjectSchema.parse(Object.fromEntries(values));
          if (!validComponentProps(next, manifest)) throw new Error();
          onApply(next);
          setError('');
        } catch {
          setError(
            'Las propiedades guardadas y los valores introducidos deben coincidir con el manifiesto.'
          );
        }
      }}
    >
      <h3>Propiedades del componente</h3>
      {fields.map(([name, field]) => (
        <div key={name}>
          {!field.required && (
            <label className="edit-check">
              <input
                type="checkbox"
                checked={included[name]}
                onChange={(e) => setIncluded({ ...included, [name]: e.target.checked })}
              />{' '}
              Incluir {name}
            </label>
          )}
          <label>
            {name}
            <input
              disabled={!included[name]}
              value={edited[name] ?? ''}
              onChange={(e) => setEdited({ ...edited, [name]: e.target.value })}
            />
          </label>
          {field.type !== 'string' && (
            <small className="edit-note">
              {
                {
                  number: 'Número',
                  boolean: 'true o false',
                  array: 'Lista JSON',
                  object: 'Objeto JSON',
                  null: 'null',
                }[field.type]
              }
            </small>
          )}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="edit-button">
        Aplicar propiedades
      </button>
    </form>
  );
}
