import { useRef } from 'react';
import { ListVideo } from 'lucide-react';
import type { Scene } from '@workspace/video-project';
import { timeLabel } from '@/features/studio-projects/project-labels';
import { moveBeforeId, type CommandHandler } from '../lib/editor-commands';

export function SceneSequence({
  scenes,
  selectedId,
  onSelect,
  onCommand,
}: {
  scenes: Scene[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onCommand: CommandHandler;
}) {
  const addButton = useRef<HTMLButtonElement>(null);
  const index = scenes.findIndex((scene) => scene.id === selectedId);
  function move(direction: -1 | 1) {
    if (selectedId)
      onCommand({
        type: 'reorder-scene',
        sceneId: selectedId,
        beforeId: moveBeforeId(scenes, selectedId, direction),
      });
  }
  return (
    <section className="edit-panel" aria-label="Secuencia de escenas">
      <h2>
        <ListVideo aria-hidden="true" size={19} /> Escenas
      </h2>
      <ol className="edit-list">
        {scenes.map((scene, i) => (
          <li key={scene.id}>
            <button
              type="button"
              aria-pressed={scene.id === selectedId}
              onClick={() => onSelect(scene.id)}
            >
              <span>{scene.editorial?.headline || 'Escena ' + (i + 1)}</span>
              <small>{timeLabel(scene.durationMs)}</small>
            </button>
          </li>
        ))}
      </ol>
      <div className="edit-actions">
        <button
          type="button"
          className="edit-button"
          ref={addButton}
          onClick={() =>
            onCommand({
              type: 'add-scene',
              scene: { id: crypto.randomUUID(), durationMs: 5000, layers: [] },
            })
          }
        >
          Añadir escena
        </button>
        {index >= 0 && (
          <>
            <button
              type="button"
              className="edit-button"
              disabled={index === 0}
              onClick={() => move(-1)}
            >
              Adelantar
            </button>
            <button
              type="button"
              className="edit-button"
              disabled={index === scenes.length - 1}
              onClick={() => move(1)}
            >
              Retrasar
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => {
                addButton.current?.focus();
                onCommand({ type: 'remove-scene', sceneId: scenes[index]!.id });
              }}
            >
              Quitar escena
            </button>
          </>
        )}
      </div>
    </section>
  );
}
