'use client';
import { useState } from 'react';
import { Trash2 } from 'lucide-react';
import type { EngineId } from '@workspace/video-project';
import { keyOf, pin, useLibrary } from '@/features/studio-libraries/hooks/use-library';
import {
  ASPECT_RATIO_OPTIONS,
  getDimensions,
  type AspectRatio,
} from '@/features/video/lib/aspect-ratios';
import { fitsShort } from '../lib/template';
import type { useShorts } from '../hooks/use-shorts';
type RangeRow = { id: string; start: string; end: string };
function row(start: number, end: number): RangeRow {
  return { id: crypto.randomUUID(), start: String(start), end: String(end) };
}
export function RangeEditor({
  duration,
  position,
  create,
  busy,
}: {
  duration: number;
  position: () => number;
  create: ReturnType<typeof useShorts>['create'];
  busy: boolean;
}) {
  const [rows, setRows] = useState<RangeRow[]>(() => [row(0, duration)]);
  const [engine, setEngine] = useState<EngineId>('remotion'),
    [ratio, setRatio] = useState<AspectRatio>('9:16');
  const [fit, setFit] = useState<'cover' | 'contain'>('cover'),
    [template, setTemplate] = useState('');
  const canvas = { ...getDimensions(ratio), fps: 30 },
    library = useLibrary('template', engine);
  const available = library.entries.filter(
    (e) =>
      e.kind === 'template' &&
      e.structure &&
      !Object.values(e.manifest.props).some((p) => p.required) &&
      fitsShort(
        e.structure,
        canvas,
        rows.map((r) => Number(r.end) - Number(r.start))
      )
  );
  const selected = available.find((t) => keyOf(t) === template);
  function update(id: string, field: 'start' | 'end', v: string) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, [field]: v } : r)));
    setTemplate('');
  }
  return (
    <form
      className="shorts-ranges"
      onSubmit={(event) => {
        event.preventDefault();
        void create(
          rows.map((r) => ({
            startMs: Number(r.start),
            endMs: Number(r.end),
            crop: { fit, focalPoint: { x: 0.5, y: 0.5 } },
          })),
          engine,
          canvas,
          selected ? pin(selected) : undefined
        );
      }}
    >
      <h2>Fragmentos</h2>
      <fieldset disabled={busy} className="shorts-controls">
        <legend className="sr-only">Selección y diseño</legend>
        {rows.map((r, i) => (
          <fieldset className="shorts-range" key={r.id}>
            <legend>Fragmento {i + 1}</legend>
            <div className="shorts-times">
              {(['start', 'end'] as const).map((field) => (
                <div key={field}>
                  <label>
                    {field === 'start' ? 'Entrada (ms)' : 'Salida (ms)'}
                    <input
                      type="number"
                      required
                      step="1"
                      min={field === 'start' ? 0 : Number(r.start) + 1}
                      max={field === 'start' ? duration - 1 : duration}
                      value={r[field]}
                      onChange={(e) => update(r.id, field, e.target.value)}
                    />
                  </label>
                  <button
                    className="shorts-mark"
                    type="button"
                    onClick={() => update(r.id, field, String(position()))}
                  >
                    Marcar {field === 'start' ? 'entrada' : 'salida'}
                  </button>
                </div>
              ))}
              {rows.length > 1 && (
                <button
                  type="button"
                  className="edit-button"
                  aria-label={'Eliminar fragmento ' + (i + 1)}
                  onClick={() => {
                    setRows((prev) => prev.filter((x) => x.id !== r.id));
                    setTemplate('');
                  }}
                >
                  <Trash2 size={16} />
                </button>
              )}
            </div>
          </fieldset>
        ))}
        <button
          className="edit-button"
          type="button"
          onClick={() => {
            const previous = Number(rows.at(-1)?.end ?? 0);
            setRows((prev) => [...prev, row(previous < duration ? previous : 0, duration)]);
            setTemplate('');
          }}
        >
          Añadir fragmento
        </button>
        <fieldset className="shorts-settings">
          <legend>Diseño de los proyectos</legend>
          <div className="shorts-times">
            <label>
              Motor
              <select
                value={engine}
                onChange={(e) => {
                  setEngine(e.target.value as EngineId);
                  setTemplate('');
                }}
              >
                <option value="remotion">Remotion</option>
                <option value="hyperframes">HyperFrames</option>
              </select>
            </label>
            <label>
              Formato
              <select
                value={ratio}
                onChange={(e) => {
                  setRatio(e.target.value as AspectRatio);
                  setTemplate('');
                }}
              >
                {ASPECT_RATIO_OPTIONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </label>
          </div>
          <label>
            Encuadre
            <select
              value={fit}
              onChange={(e) => setFit(e.target.value === 'cover' ? 'cover' : 'contain')}
            >
              <option value="cover">Cubrir el lienzo</option>
              <option value="contain">Mostrar video completo</option>
            </select>
          </label>
          <label>
            Plantilla
            <select value={selected ? template : ''} onChange={(e) => setTemplate(e.target.value)}>
              <option value="">Sin plantilla</option>
              {available.map((t) => (
                <option key={keyOf(t)} value={keyOf(t)}>
                  {t.name} · v{t.version}
                </option>
              ))}
            </select>
          </label>
          {library.error && <p role="alert">{library.error}</p>}
        </fieldset>
        <button className="studio-primary" type="submit">
          Crear {rows.length === 1 ? 'proyecto' : rows.length + ' proyectos'}
        </button>
      </fieldset>
    </form>
  );
}
