'use client';
import { useId, useState } from 'react';

interface Props {
  label: string;
  value: number;
  min?: number;
  max?: number;
  step?: number | 'any';
  disabled?: boolean;
  onCommit: (value: number) => string | null | void;
}

export function NumberField({ label, value, min, max, step = 1, disabled, onCommit }: Props) {
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState('');
  const id = useId();
  return (
    <div className="edit-field">
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        type="number"
        min={min}
        max={max}
        step={step}
        disabled={disabled}
        value={editing ?? value}
        aria-invalid={!!error}
        aria-describedby={error ? id + '-error' : undefined}
        onChange={(event) => {
          setEditing(event.target.value);
          setError('');
        }}
        onKeyDown={(event) => {
          if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 's') {
            event.currentTarget.blur();
          }
          if (event.key === 'Enter') {
            event.preventDefault();
            event.currentTarget.blur();
          }
          if (event.key === 'Escape') {
            setEditing(null);
            setError('');
          }
        }}
        onBlur={(event) => {
          if (editing === null) return;
          const input = event.currentTarget;
          const next = input.valueAsNumber;
          const issue =
            !Number.isFinite(next) || !input.validity.valid
              ? 'Introduce un número válido dentro del intervalo.'
              : next === value
                ? null
                : onCommit(next);
          setError(issue ?? '');
          if (!issue) setEditing(null);
        }}
      />
      {error && (
        <small role="alert" id={id + '-error'}>
          {error}
        </small>
      )}
    </div>
  );
}
