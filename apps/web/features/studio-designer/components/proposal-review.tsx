'use client';
import { useEffect, useId, useState } from 'react';
import type {
  Diagnostic,
  ProposalInput,
  ProjectRecord,
  PreviewHandle,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
import { StudioProjectPreview } from './studio-project-preview';
type Summary = { id: string; status: 'invalid' | 'ready' | 'applied'; baseRevision: string };
type Detail = Summary & {
  input: ProposalInput;
  moduleHash: string | null;
  samples?: { frame: number; sha256: string }[];
  diagnostics: Diagnostic[];
};
export function ProposalReview({
  record,
  disabled,
  onApply,
  onListed,
}: {
  record: ProjectRecord;
  disabled: boolean;
  onListed: () => void;
  onApply: (proposalId: string, baseRevision: string) => Promise<unknown>;
}) {
  const selectId = useId();
  const path = '/api/studio/projects/' + encodeURIComponent(record.document.id) + '/proposals';
  const [open, setOpen] = useState(false),
    [list, setList] = useState<Summary[]>([]),
    [selected, setSelected] = useState(''),
    [detail, setDetail] = useState<Detail>(),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [preview, setPreview] = useState(false),
    [transport, setTransport] = useState<PreviewHandle | null>(null);
  useEffect(() => {
    if (!open) return;
    const controller = new AbortController();
    setDetail(undefined);
    setPreview(false);
    setNotice('');
    setError('');
    const options = { signal: controller.signal };
    (async () => {
      const summaries = await projectRequest<Summary[]>(path, options);
      if (controller.signal.aborted) return;
      setList(summaries);
      if (selected) {
        const row = await projectRequest<Detail>(path + '/' + selected, options);
        if (!controller.signal.aborted) setDetail(row);
      }
    })().catch((e) => {
      if (!controller.signal.aborted) setError(e.message);
    });
    return () => controller.abort();
  }, [open, path, selected, record.revision]);
  async function decide(action: 'apply' | 'library') {
    if (!detail || busy) return;
    setBusy(true);
    setError('');
    try {
      if (action === 'apply') {
        setPreview(false);
        await onApply(detail.id, detail.baseRevision);
      } else {
        await projectRequest(path + '/' + detail.id + '/library', { method: 'POST' });
        setNotice('Versión guardada en biblioteca.');
        onListed();
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo completar la operación.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <details className="edit-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Revisar propuestas</summary>
      {open && (
        <>
          <label htmlFor={selectId}>Propuesta</label>
          <select id={selectId} value={selected} onChange={(e) => setSelected(e.target.value)}>
            <option value="">Selecciona una propuesta</option>
            {list.map((r, i) => (
              <option key={r.id} value={r.id}>
                {list.length - i} ·{' '}
                {
                  {
                    invalid: 'Requiere corrección',
                    ready: 'Lista para revisar',
                    applied: 'Aplicada',
                  }[r.status]
                }
              </option>
            ))}
          </select>
          {detail && (
            <>
              <p>
                {detail.input.kind === 'component'
                  ? (detail.input.name ?? 'Componente generado')
                  : 'Storyboard'}{' '}
                · {detail.input.commands.length} cambios
              </p>
              {detail.diagnostics.map((d, i) => (
                <p key={i} role="status">
                  {d.message}
                </p>
              ))}
              {!!detail.samples?.length && (
                <details>
                  <summary>Fotogramas revisados</summary>
                  <ul>
                    {detail.samples.map((s) => (
                      <li key={s.frame}>
                        <a
                          href={path + '/' + detail.id + '/samples/' + s.frame}
                          target="_blank"
                          rel="noreferrer"
                        >
                          Fotograma {s.frame}
                        </a>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              <details>
                <summary>Archivos y cambios</summary>
                <pre>{JSON.stringify(detail.input, null, 2)}</pre>
              </details>
              {detail.status !== 'invalid' && (
                <button type="button" className="edit-button" onClick={() => setPreview((v) => !v)}>
                  {preview ? 'Cerrar vista previa' : 'Previsualizar propuesta'}
                </button>
              )}
              {preview && (
                <>
                  <div style={{ aspectRatio: '16/9' }}>
                    <StudioProjectPreview
                      projectId={record.document.id}
                      revision={detail.baseRevision}
                      proposalId={detail.id}
                      onReady={setTransport}
                    />
                  </div>
                  <button
                    type="button"
                    className="edit-button"
                    disabled={!transport}
                    onClick={() => transport?.play()}
                  >
                    Reproducir propuesta
                  </button>
                  <button
                    type="button"
                    className="edit-button"
                    disabled={!transport}
                    onClick={() => transport?.pause()}
                  >
                    Pausar propuesta
                  </button>
                </>
              )}
              {detail.status === 'ready' && (
                <button
                  type="button"
                  className="edit-button"
                  disabled={disabled || busy || record.revision !== detail.baseRevision}
                  onClick={() => void decide('apply')}
                >
                  Aplicar propuesta
                </button>
              )}
              {detail.status === 'applied' && detail.input.kind === 'component' && (
                <button
                  type="button"
                  className="edit-button"
                  disabled={busy}
                  onClick={() => void decide('library')}
                >
                  Guardar en biblioteca
                </button>
              )}
            </>
          )}
          {error && <p role="alert">{error}</p>}
          {notice && <p role="status">{notice}</p>}
        </>
      )}
    </details>
  );
}
