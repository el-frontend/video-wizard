import { useId } from 'react';
import type { Scene } from '@workspace/video-project';
import type { CommandHandler } from '../lib/editor-commands';

export function NarrationEditor({ scene, onCommand }: { scene: Scene; onCommand: CommandHandler }) {
  const id = useId();
  return (
    <details className="edit-section">
      <summary>Guion de la escena</summary>
      <div className="edit-field">
        <label htmlFor={id + '-headline'}>Titular</label>
        <textarea
          id={id + '-headline'}
          rows={2}
          value={scene.editorial?.headline ?? ''}
          onChange={(e) =>
            onCommand({ type: 'set-headline', sceneId: scene.id, text: e.target.value })
          }
        />
      </div>
      <div className="edit-field">
        <label htmlFor={id + '-text'}>Narración</label>
        <textarea
          id={id + '-text'}
          rows={4}
          value={scene.editorial?.narration ?? ''}
          onChange={(e) =>
            onCommand({ type: 'set-narration', sceneId: scene.id, text: e.target.value })
          }
        />
      </div>
      {scene.layers.some((l) => l.type === 'audio' && l.take?.stale) && (
        <p role="status" className="edit-note">
          Toma pendiente de actualizar.
        </p>
      )}
      <button type="button" className="edit-button" disabled aria-describedby={id + '-voice'}>
        Solicitar voz
      </button>
      <p className="edit-note" id={id + '-voice'}>
        La solicitud estará disponible con la conexión al asistente.
      </p>
    </details>
  );
}
