'use client';
import { useId, useState } from 'react';
import type {
  CompanionRequest,
  EditorSelection,
  ProjectRecord,
  CaptionCue,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
import { useCompanion } from '../hooks/use-companion';
import { RequestReceipt, requestKinds } from './request-receipt';
type Props = {
  project: string;
  selection: EditorSelection;
  savedRevision: () => Promise<ProjectRecord | null>;
  master?: boolean;
  onRefresh?: () => Promise<void>;
  source?: { id: string; durationMs: number; captions?: CaptionCue[] };
  onRanges?: (r: NonNullable<CompanionRequest['ranges']>) => void;
};
export function AssistantPanel({
  project,
  selection,
  savedRevision,
  master,
  onRefresh,
  source,
  onRanges,
}: Props) {
  const [open, setOpen] = useState(false),
    [kind, setKind] = useState<CompanionRequest['kind']>(source ? 'shorts' : 'feedback'),
    [message, setMessage] = useState('');
  const studio = useCompanion(project, open),
    id = useId(),
    chosen =
      !studio.target?.unavailable && studio.bindings.find((b) => b.bindingId === studio.target?.id);
  const receipts = studio.receipts.filter((r) => !source || r.sourceAssetId === source.id);
  return (
    <details className="edit-panel assistant-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>
        {source ? 'Pedir sugerencias de fragmentos' : 'Asistente de la conversación'}
      </summary>
      {open && (
        <>
          <label htmlFor={id + 'binding'}>Conversación vinculada</label>
          <select
            id={id + 'binding'}
            value={chosen ? chosen.bindingId : ''}
            onChange={(e) => studio.selectBinding(e.target.value)}
          >
            {studio.target?.unavailable ? (
              <option value="" disabled>
                Conversación {studio.target.id.slice(0, 8)} no disponible. Selecciona otra
                conversación.
              </option>
            ) : (
              !studio.bindings.length && <option value="">Sin vínculo local</option>
            )}
            {studio.bindings.map((b) => (
              <option key={b.bindingId} value={b.bindingId}>
                {b.provider === 'claude' ? 'Claude' : 'Codex'} · {b.bindingId.slice(0, 8)}
              </option>
            ))}
          </select>
          <details>
            <summary>Vincular una conversación</summary>
            <p>
              Descarga el permiso de cinco minutos y úsalo con el comando local de emparejamiento.
            </p>
            <button
              type="button"
              className="edit-button"
              disabled={studio.busy}
              onClick={() => void studio.run(studio.pair)}
            >
              Descargar permiso
            </button>
          </details>
          {!source && (
            <>
              <label htmlFor={id + 'kind'}>Solicitud</label>
              <select
                id={id + 'kind'}
                value={kind}
                onChange={(e) => setKind(e.target.value as typeof kind)}
              >
                {(['feedback', 'component', 'storyboard', 'voice'] as const).map((k) => (
                  <option key={k} value={k}>
                    {requestKinds[k]}
                  </option>
                ))}
              </select>
            </>
          )}
          <label htmlFor={id + 'message'}>Instrucciones para el chat</label>
          <textarea
            id={id + 'message'}
            maxLength={6000}
            rows={3}
            value={message}
            onChange={(e) => setMessage(e.target.value)}
          />
          <small>
            {source
              ? 'Video de ' + source.durationMs + ' ms'
              : [
                  selection.sceneId ? 'Escena ' + selection.sceneId : null,
                  selection.layerId ? 'Capa ' + selection.layerId : null,
                  (selection.timeMs / 1000).toFixed(2) + ' s',
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </small>
          {master && kind === 'voice' && (
            <>
              <p>
                La narración usa la pista maestra. Activa las tomas por escena para seleccionar la
                que quieras reemplazar.
              </p>
              <button
                className="edit-button"
                type="button"
                disabled={studio.busy}
                onClick={() =>
                  void studio.run(async () => {
                    const base = await savedRevision();
                    if (!base) throw Error('No se pudo guardar la revisión.');
                    await projectRequest('/api/studio/projects/' + project + '/scene-takes', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                      body: JSON.stringify({ baseRevision: base.revision }),
                    });
                    await onRefresh?.();
                  })
                }
              >
                Activar tomas de escena
              </button>
            </>
          )}
          <button
            className="edit-button"
            type="button"
            disabled={studio.busy || !chosen || !message.trim() || (master && kind === 'voice')}
            onClick={() => {
              const frozen = { ...selection };
              void studio.run(async () => {
                const base = await savedRevision();
                if (!base || base.document.id !== project || !chosen)
                  throw Error('La revisión ya no está disponible.');
                await studio.send({
                  baseRevision: base.revision,
                  engine: base.document.engine,
                  bindingId: chosen.bindingId,
                  provider: chosen.provider,
                  selection: frozen,
                  kind,
                  message,
                  ...(source && { sourceAssetId: source.id, sourceCaptions: source.captions }),
                });
                setMessage('');
              });
            }}
          >
            Enviar al chat vinculado
          </button>
          {studio.error && <p role="alert">{studio.error}</p>}
          {!!receipts.length && (
            <ol aria-label="Recibos de solicitudes">
              {receipts.map((r) => (
                <RequestReceipt key={r.id} request={r} onRanges={onRanges} />
              ))}
            </ol>
          )}
        </>
      )}
    </details>
  );
}
