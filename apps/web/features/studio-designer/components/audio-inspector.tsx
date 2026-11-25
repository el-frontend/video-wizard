import { useId, useLayoutEffect, useRef, useState } from 'react';
import type { AudioLayer, Scene } from '@workspace/video-project';
import { uploadEditorAsset } from '../hooks/use-editor-dependencies';
import type { AudioReplacement } from '../hooks/use-project-session';
import { readCaptionFile } from '../lib/caption-files';
import type { CommandHandler } from '../lib/editor-commands';
import { NumberField } from './number-field';

export function AudioInspector({
  scene,
  layer,
  onCommand,
  onReplace,
}: {
  scene: Scene;
  layer: AudioLayer;
  onCommand: CommandHandler;
  onReplace: (input: AudioReplacement) => Promise<void>;
}) {
  const id = useId(),
    upload = useRef<AbortController | null>(null);
  const [busy, setBusy] = useState(false),
    [status, setStatus] = useState('');
  const [filenames, setFilenames] = useState({ audio: '', captions: '' });
  useLayoutEffect(() => () => upload.current?.abort(), []);
  async function submit(form: HTMLFormElement) {
    if (upload.current) return;
    const data = new FormData(form);
    const file = data.get('audio'),
      subtitles = data.get('captions');
    if (!(file instanceof File) || !file.size) {
      setStatus('Selecciona una toma de audio.');
      return;
    }
    const controller = new AbortController();
    upload.current = controller;
    setBusy(true);
    setStatus('Midiendo la toma…');
    try {
      const captions =
        subtitles instanceof File && subtitles.size ? await readCaptionFile(subtitles) : undefined;
      const asset = await uploadEditorAsset(file, controller.signal);
      if (controller.signal.aborted) return;
      await onReplace({ sceneId: scene.id, audioLayerId: layer.id, assetId: asset.id, captions });
      if (!controller.signal.aborted) {
        form.reset();
        setFilenames({ audio: '', captions: '' });
        setStatus('Toma reemplazada.');
      }
    } catch (error) {
      if (!controller.signal.aborted)
        setStatus(error instanceof Error ? error.message : 'No se pudo reemplazar la toma.');
    } finally {
      if (!controller.signal.aborted) setBusy(false);
      upload.current = null;
    }
  }
  return (
    <section className="edit-panel audio-inspector" aria-label="Toma de voz">
      <h2>Toma de voz</h2>
      <audio
        controls
        preload="metadata"
        aria-label="Escuchar el archivo de audio"
        src={'/api/studio/assets/' + encodeURIComponent(layer.assetId)}
      />
      {layer.take && (
        <p className="edit-note">
          {layer.take.durationMs} ms ·{' '}
          {layer.take.stale ? 'Pendiente de actualizar' : 'Asociada a la narración'}
        </p>
      )}
      <NumberField
        label="Inicio del audio y subtítulos vinculados (ms)"
        value={layer.startMs}
        min={0}
        onCommit={(startMs) => {
          const delta = startMs - layer.startMs;
          if (
            scene.layers.some(
              (l) =>
                l.type === 'captions' && l.sourceAudioLayerId === layer.id && l.startMs + delta < 0
            )
          )
            return 'Una capa vinculada empezaría antes de la escena.';
          onCommand({ type: 'move-linked-audio', sceneId: scene.id, layerId: layer.id, startMs });
        }}
      />
      <form
        aria-label="Reemplazar toma"
        onSubmit={(e) => {
          e.preventDefault();
          void submit(e.currentTarget);
        }}
      >
        <fieldset className="edit-section" disabled={busy}>
          <legend>Reemplazar toma</legend>
          {(['audio', 'captions'] as const).map((name) => (
            <div key={name} className="edit-field">
              <label htmlFor={id + name}>
                {name === 'audio'
                  ? 'Archivo de audio o video con voz'
                  : 'Subtítulos de la toma (SRT o VTT, opcional)'}
              </label>
              <span className="edit-button edit-upload">
                {filenames[name] || 'Elegir archivo'}
                <input
                  name={name}
                  id={id + name}
                  type="file"
                  required={name === 'audio'}
                  accept={name === 'audio' ? 'audio/*,video/*' : '.srt,.vtt'}
                  onChange={(e) => {
                    const filename = e.target.files?.[0]?.name ?? '';
                    setFilenames((previous) => ({ ...previous, [name]: filename }));
                  }}
                />
              </span>
            </div>
          ))}
          <p className="edit-note">
            Al reemplazar, asocias el archivo con la narración escrita. Si adjuntas subtítulos, sus
            tiempos se cuentan desde el inicio del archivo.
          </p>
          <button className="edit-button" type="submit">
            Reemplazar toma
          </button>
        </fieldset>
      </form>
      <small role="status">{status}</small>
    </section>
  );
}
