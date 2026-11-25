import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { AssetDescriptor, ImportSlot, ProjectRecord } from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
import { useLibrary, keyOf, pin } from '@/features/studio-libraries/hooks/use-library';
export function ImportResources({
  record,
  busy,
  repair,
}: {
  record: ProjectRecord;
  busy: boolean;
  repair: (slotId: string, value: object) => void;
}) {
  const context = record.importContext!,
    styles = useLibrary('style', record.document.engine);
  const [assets, setAssets] = useState<AssetDescriptor[]>([]),
    [error, setError] = useState('');
  useEffect(() => {
    if (!context.slots.some((s) => s.kind === 'audio' && s.resolution === 'pending')) return;
    const request = new AbortController();
    void (async () => {
      let cursor: string | null = null;
      const items: AssetDescriptor[] = [];
      do {
        const result: { items: AssetDescriptor[]; nextCursor: string | null } =
          await projectRequest(
            '/api/studio/assets?media=audio' +
              (cursor ? '&cursor=' + encodeURIComponent(cursor) : ''),
            { signal: request.signal }
          );
        if (request.signal.aborted) return;
        items.push(...result.items);
        cursor = result.nextCursor;
      } while (cursor);
      setAssets(items);
    })().catch(() => {
      if (!request.signal.aborted) setError('No se pudieron cargar los archivos de audio.');
    });
    return () => request.abort();
  }, [context]);
  function choose(slot: ImportSlot, key: string) {
    if (!key) return;
    if (slot.kind === 'style') {
      const entry = styles.entries.find((s) => keyOf(s) === key);
      if (entry) repair(slot.id, { action: 'select-style', ref: pin(entry) });
    } else repair(slot.id, { action: 'replace', assetId: key });
  }
  return (
    <section className="studio-catalog p-3 space-y-2" aria-label="Origen y recursos">
      <h2>Origen y recursos</h2>
      <p>
        {context.kind === 'motion-studio' ? 'Motion Studio' : 'Trabajo de Video Wizard'} ·{' '}
        {context.sourceId}
      </p>
      {context.diagnostics.map((d, i) => (
        <p key={i}>{d.message}</p>
      ))}
      {context.slots.map((slot) => (
        <div key={slot.id} className="flex flex-wrap items-center gap-2">
          <span>{slot.label}</span>
          {slot.resolution === 'pending' ? (
            <>
              {(slot.kind === 'audio' || slot.kind === 'style') && (
                <select
                  disabled={busy}
                  aria-label={'Reemplazar · ' + slot.label}
                  value=""
                  onChange={(e) => choose(slot, e.target.value)}
                >
                  <option value="">Seleccionar {slot.kind === 'audio' ? 'audio' : 'estilo'}</option>
                  {slot.kind === 'audio'
                    ? assets.map((a) => (
                        <option key={a.id} value={a.id}>
                          {a.name}
                        </option>
                      ))
                    : styles.entries.map((s) => (
                        <option key={keyOf(s)} value={keyOf(s)}>
                          {s.name} · v{s.version}
                        </option>
                      ))}
                </select>
              )}
              {slot.kind === 'video' && slot.assetId ? (
                <>
                  <Link className="edit-button" href="/assets">
                    Abrir Recursos
                  </Link>
                  <button
                    className="studio-secondary"
                    disabled={busy}
                    onClick={() => repair(slot.id, { action: 'recheck' })}
                  >
                    Comprobar archivo repuesto
                  </button>
                </>
              ) : (
                <button
                  className="studio-secondary"
                  disabled={busy}
                  onClick={() => repair(slot.id, { action: 'omit' })}
                >
                  Omitir este recurso
                </button>
              )}
            </>
          ) : (
            <small>
              {slot.resolution === 'omitted' ? 'Omitido por decisión del usuario' : 'Reemplazado'}
            </small>
          )}
        </div>
      ))}
      {error && <p role="status">{error}</p>}
    </section>
  );
}
