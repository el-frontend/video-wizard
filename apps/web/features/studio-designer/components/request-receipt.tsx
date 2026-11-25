import type { CompanionRequest } from '@workspace/video-project';
export const requestKinds = {
  feedback: 'Cambio de texto',
  component: 'Componente',
  storyboard: 'Storyboard',
  voice: 'Toma de voz',
  shorts: 'Fragmentos',
};
const statuses = {
  created: 'Pendiente de despacho',
  sending: 'Despachando',
  sent: 'En cola en el chat',
  waiting: 'Esperando en el chat',
  running: 'En proceso',
  completed: 'Resultado recibido',
  failed: 'Falló',
  cancelled: 'Cancelada',
  'delivery-unknown': 'Entrega sin confirmar',
};
export function RequestReceipt({
  request: r,
  onRanges,
}: {
  request: CompanionRequest;
  onRanges?: (r: NonNullable<CompanionRequest['ranges']>) => void;
}) {
  return (
    <li className="studio-receipt">
      <strong>
        {requestKinds[r.kind]} · {statuses[r.status]}
      </strong>
      <p>{r.message}</p>
      <small>
        {r.provider} · {r.engine} · {(r.selection.timeMs / 1000).toFixed(2)} s · revisión{' '}
        {r.baseRevision.slice(0, 8)}
      </small>
      {r.note && <p>{r.note}</p>}
      {r.proposalId && (
        <p>Propuesta {r.proposalId.slice(0, 8)} disponible en «Revisar propuestas».</p>
      )}
      {r.resultRevision && <p>Revisión guardada {r.resultRevision.slice(0, 8)}</p>}
      {r.assetId && <p>Audio importado {r.assetId.slice(0, 8)}</p>}
      {r.voice && (
        <p>
          {r.voice.provider} · {r.voice.durationMs} ms ·{' '}
          {r.voice.captionSource === 'transcription'
            ? 'Subtítulos transcritos'
            : 'Alineación del proveedor'}
        </p>
      )}
      {r.ranges && onRanges && (
        <button type="button" className="edit-button" onClick={() => onRanges(r.ranges!)}>
          Revisar {r.ranges.length} fragmentos
        </button>
      )}
    </li>
  );
}
