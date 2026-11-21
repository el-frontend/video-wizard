import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import {
  LibraryEntrySchema,
  type CaptionCue,
  type EngineId,
  type Layer,
  type LibraryRef,
  type Scene,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
import { editCaptions, normalizedCaptionText, type CaptionEdit } from '../lib/caption-editing';
import { readCaptionFile, serializeCaptionFile } from '../lib/caption-files';
import type { CommandHandler } from '../lib/editor-commands';
import { SelectField } from './select-field';

type Captions = Extract<Layer, { type: 'captions' }>;
function CueForm({
  cue,
  adding,
  localMs,
  edit,
  onSaved,
  canMerge,
}: {
  cue: CaptionCue;
  adding: boolean;
  localMs: number;
  edit: (action: CaptionEdit) => boolean;
  onSaved: (value: CaptionCue) => void;
  canMerge: boolean;
}) {
  const id = useId(),
    textarea = useRef<HTMLTextAreaElement>(null);
  const [error, setError] = useState('');
  const aligned =
    cue.words?.length &&
    normalizedCaptionText(cue.words.map((w) => w.text).join(' ')) ===
      normalizedCaptionText(cue.text);
  return (
    <form
      aria-label={adding ? 'Nuevo subtítulo' : 'Editar subtítulo'}
      onSubmit={(e) => {
        e.preventDefault();
        const data = new FormData(e.currentTarget);
        const patch = {
          startMs: Number(data.get('start')),
          endMs: Number(data.get('end')),
          text: String(data.get('text')),
        };
        if (
          edit(
            adding
              ? { type: 'add', cue: { ...cue, ...patch } }
              : { type: 'update', id: cue.id, patch }
          )
        )
          onSaved({ ...cue, ...patch });
      }}
    >
      <div className="edit-grid">
        <div className="edit-field">
          <label htmlFor={id + '-start'}>Desde (ms)</label>
          <input
            name="start"
            id={id + '-start'}
            type="number"
            required
            min="0"
            step="1"
            defaultValue={cue.startMs}
          />
        </div>
        <div className="edit-field">
          <label htmlFor={id + '-end'}>Hasta (ms)</label>
          <input
            name="end"
            id={id + '-end'}
            type="number"
            required
            min="1"
            step="1"
            defaultValue={cue.endMs}
          />
        </div>
      </div>
      <div className="edit-field">
        <label htmlFor={id + '-text'}>Texto del subtítulo</label>
        <textarea
          ref={textarea}
          name="text"
          id={id + '-text'}
          required
          rows={3}
          defaultValue={cue.text}
          onInput={() => setError('')}
        />
      </div>
      {!adding && (
        <p className="edit-note">
          {aligned ? 'Palabras alineadas' : 'Alineación de palabras pendiente'}
        </p>
      )}
      <div className="edit-actions">
        <button className="edit-button" type="submit">
          {adding ? 'Guardar subtítulo' : 'Aplicar cambios'}
        </button>
        {!adding && (
          <>
            <button
              type="button"
              className="edit-button"
              onClick={(e) => {
                const form = e.currentTarget.form;
                if (!form || !textarea.current) return;
                const data = new FormData(form);
                if (
                  data.get('text') !== cue.text ||
                  Number(data.get('start')) !== cue.startMs ||
                  Number(data.get('end')) !== cue.endMs
                ) {
                  setError('Aplica los cambios antes de dividir este subtítulo.');
                  return;
                }
                edit({
                  type: 'split',
                  id: cue.id,
                  newId: crypto.randomUUID(),
                  atMs: localMs,
                  textIndex: textarea.current.selectionStart,
                });
              }}
            >
              Dividir en el cabezal
            </button>
            <button
              type="button"
              className="edit-button"
              disabled={!canMerge}
              onClick={() => edit({ type: 'merge', id: cue.id })}
            >
              Unir al siguiente
            </button>
            <button
              type="button"
              className="edit-button"
              onClick={() => edit({ type: 'delete', id: cue.id })}
            >
              Eliminar subtítulo
            </button>
          </>
        )}
      </div>
      {!adding && (
        <p className="edit-note">
          Para dividir, sitúa el cabezal en el corte y el cursor entre los dos fragmentos de texto.
        </p>
      )}
      {error && <p role="alert">{error}</p>}
    </form>
  );
}

export function CaptionEditor({
  scene,
  layer,
  engine,
  selectedId,
  localMs,
  onSeek,
  onCommand,
}: {
  scene: Scene;
  layer: Captions;
  engine: EngineId;
  selectedId: string | null;
  localMs: number;
  onSeek: (cue: CaptionCue) => void;
  onCommand: CommandHandler;
}) {
  const [message, setMessage] = useState(''),
    [newCue, setNewCue] = useState<CaptionCue | null>(null);
  const [presets, setPresets] = useState<{ ref: LibraryRef; name: string }[]>([]),
    [presetError, setPresetError] = useState('');
  const importToken = useRef(0);
  useLayoutEffect(
    () => () => {
      importToken.current++;
    },
    [layer.cues]
  );
  useEffect(() => {
    const controller = new AbortController();
    projectRequest<unknown>('/api/studio/libraries/component?engine=' + engine + '&verified=1', {
      signal: controller.signal,
    })
      .then((raw) => {
        const entries = LibraryEntrySchema.array().parse(raw);
        if (!controller.signal.aborted)
          setPresets(
            entries.flatMap((e) =>
              e.kind === 'component' && e.engine === engine && e.manifest.builtin
                ? [{ ref: { id: e.id, version: e.version }, name: e.name }]
                : []
            )
          );
      })
      .catch(() => {
        if (!controller.signal.aborted)
          setPresetError('No se pudieron cargar los presets de subtítulos.');
      });
    return () => controller.abort();
  }, [engine]);
  const cues = [...layer.cues].sort((a, b) => a.startMs - b.startMs);
  const selected = cues.find((c) => c.id === selectedId) ?? cues[0];
  const shown = newCue ?? selected;
  const apply = (next: CaptionCue[]) =>
    onCommand({ type: 'set-captions', sceneId: scene.id, layerId: layer.id, cues: next });
  function edit(action: CaptionEdit) {
    try {
      apply(editCaptions(layer.cues, action));
      setMessage('');
      return true;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo editar este subtítulo.');
      return false;
    }
  }
  async function load(file: File) {
    const token = ++importToken.current;
    try {
      const imported = await readCaptionFile(file);
      if (token !== importToken.current) return;
      apply(imported);
      setNewCue(null);
      setMessage('Subtítulos importados.');
    } catch (e) {
      if (token === importToken.current)
        setMessage(e instanceof Error ? e.message : 'No se pudo leer el archivo.');
    }
  }
  function download(format: 'srt' | 'vtt') {
    try {
      const blob = new Blob([serializeCaptionFile(cues, format)], {
        type: format === 'srt' ? 'application/x-subrip' : 'text/vtt',
      });
      const url = URL.createObjectURL(blob),
        link = document.createElement('a');
      link.href = url;
      link.download = 'subtitulos.' + format;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'No se pudo exportar.');
    }
  }
  const id = useId(),
    pin = layer.templateRef ? JSON.stringify(layer.templateRef) : '';
  return (
    <section className="edit-panel" aria-label="Editor de subtítulos">
      <h2>Subtítulos</h2>
      <SelectField
        label="Vincular a la capa de audio"
        value={layer.sourceAudioLayerId ?? ''}
        onChange={(e) =>
          onCommand({
            type: 'set-caption-source',
            sceneId: scene.id,
            layerId: layer.id,
            audioLayerId: e.target.value || null,
          })
        }
      >
        <option value="">Sin vincular</option>
        {scene.layers
          .filter((l) => l.type === 'audio')
          .map((l) => (
            <option key={l.id} value={l.id}>
              {l.take?.spokenText || l.id}
            </option>
          ))}
        {layer.sourceAudioLayerId &&
          !scene.layers.some((l) => l.id === layer.sourceAudioLayerId) && (
            <option value={layer.sourceAudioLayerId}>{layer.sourceAudioLayerId}</option>
          )}
      </SelectField>
      <SelectField
        label="Preset de subtítulos"
        value={pin}
        onChange={(e) => {
          const ref = presets.find((p) => JSON.stringify(p.ref) === e.target.value)?.ref;
          onCommand({
            type: 'set-caption-preset',
            sceneId: scene.id,
            layerId: layer.id,
            ref: ref ?? null,
          });
        }}
      >
        <option value="">Texto del proyecto</option>
        {pin && !presets.some((p) => JSON.stringify(p.ref) === pin) && (
          <option value={pin}>
            {layer.templateRef?.id} · v{layer.templateRef?.version}
          </option>
        )}
        {presets.map((p) => (
          <option key={JSON.stringify(p.ref)} value={JSON.stringify(p.ref)}>
            {p.name} · v{p.ref.version}
          </option>
        ))}
      </SelectField>
      {presetError && <p className="edit-note">{presetError}</p>}
      <p className="edit-note">Tiempos en milisegundos desde el inicio de esta capa.</p>
      <ol className="edit-list cue-list">
        {cues.map((c) => (
          <li key={c.id}>
            <button
              type="button"
              aria-pressed={!newCue && selected?.id === c.id}
              onClick={() => {
                setNewCue(null);
                setMessage('');
                onSeek(c);
              }}
            >
              <span>{c.text}</span>
              <small>
                {c.startMs}–{c.endMs}
              </small>
            </button>
          </li>
        ))}
      </ol>
      <div className="edit-actions">
        <button
          type="button"
          className="edit-button"
          onClick={() => {
            const startMs = Math.max(0, Math.min(localMs, layer.endMs - layer.startMs - 1));
            setMessage('');
            setNewCue({
              id: crypto.randomUUID(),
              text: '',
              startMs,
              endMs: Math.min(startMs + 1000, layer.endMs - layer.startMs),
            });
          }}
        >
          Añadir subtítulo
        </button>
        <label className="edit-button edit-upload" htmlFor={id}>
          Importar SRT/VTT
          <input
            id={id}
            type="file"
            accept=".srt,.vtt"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) void load(file);
            }}
          />
        </label>
        {(['srt', 'vtt'] as const).map((f) => (
          <button
            type="button"
            className="edit-button"
            key={f}
            disabled={!cues.length}
            onClick={() => download(f)}
          >
            Exportar {f.toUpperCase()}
          </button>
        ))}
      </div>
      {shown && (
        <CueForm
          key={JSON.stringify(shown)}
          cue={shown}
          adding={!!newCue}
          localMs={localMs}
          edit={edit}
          canMerge={!!selected && selected !== cues[cues.length - 1]}
          onSaved={(value) => {
            if (newCue) {
              setNewCue(null);
              onSeek(value);
            }
          }}
        />
      )}
      <small role="status">{message}</small>
    </section>
  );
}
