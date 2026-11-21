import { SelectField } from './select-field';
import { NumberField } from './number-field';
import type { Canvas, CommandHandler } from '../lib/editor-commands';

const formats = [
  { name: 'Vertical · 9:16', width: 1080, height: 1920 },
  { name: 'Horizontal · 16:9', width: 1920, height: 1080 },
  { name: 'Cuadrado · 1:1', width: 1080, height: 1080 },
  { name: 'Retrato · 4:5', width: 1080, height: 1350 },
];
export function CanvasControls({
  canvas,
  onCommand,
}: {
  canvas: Canvas;
  onCommand: CommandHandler;
}) {
  function resize(change: Partial<Canvas>) {
    onCommand({ type: 'set-canvas', canvas: { ...canvas, ...change } });
  }
  const format = formats.find((f) => f.width === canvas.width && f.height === canvas.height);
  return (
    <details className="edit-section">
      <summary>
        Lienzo · {canvas.width} × {canvas.height}
      </summary>
      <SelectField
        label="Formato"
        value={format?.name ?? ''}
        onChange={(e) => {
          const next = formats.find((f) => f.name === e.target.value);
          if (next) resize({ width: next.width, height: next.height });
        }}
      >
        {!format && <option value="">Personalizado</option>}
        {formats.map((f) => (
          <option key={f.name}>{f.name}</option>
        ))}
      </SelectField>
      <div className="edit-grid">
        <NumberField
          label="Ancho del lienzo (px)"
          min={1}
          value={canvas.width}
          onCommit={(width) => resize({ width })}
        />
        <NumberField
          label="Alto del lienzo (px)"
          min={1}
          value={canvas.height}
          onCommit={(height) => resize({ height })}
        />
        <NumberField
          label="Frecuencia (fps)"
          step="any"
          value={canvas.fps}
          onCommit={(fps) => {
            if (fps <= 0) return 'La frecuencia debe ser positiva.';
            resize({ fps });
          }}
        />
      </div>
    </details>
  );
}
