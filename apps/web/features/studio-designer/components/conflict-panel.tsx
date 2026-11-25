import type { ProjectDraft, ProjectRecord } from '@workspace/video-project';

function changed<T extends { id: string }>(a: T[], b: T[]) {
  const left = new Map(a.map((x) => [x.id, JSON.stringify(x)])),
    right = new Map(b.map((x) => [x.id, JSON.stringify(x)]));
  return [...new Set([...left.keys(), ...right.keys()])].filter(
    (id) => left.get(id) !== right.get(id)
  ).length;
}
export function ConflictPanel({
  local,
  remote,
  busy,
  onCopy,
  onReload,
}: {
  local: ProjectDraft;
  remote: ProjectRecord;
  busy: boolean;
  onCopy: () => void;
  onReload: () => void;
}) {
  const theirs = remote.document,
    layers = (d: ProjectDraft) => [...d.globalAudio, ...d.scenes.flatMap((s) => s.layers)];
  const cues = (d: ProjectDraft) => layers(d).flatMap((l) => (l.type === 'captions' ? l.cues : []));
  return (
    <section aria-label="Comparar revisiones" className="studio-warning space-y-2">
      <strong>Hay otra revisión guardada.</strong>
      <dl className="grid gap-x-4 sm:grid-cols-2">
        <div>
          <dt>Borrador local</dt>
          <dd>{local.title}</dd>
        </div>
        <div>
          <dt>Revisión guardada</dt>
          <dd>{theirs.title}</dd>
        </div>
      </dl>
      <p>
        Diferencias entre versiones · Escenas {changed(local.scenes, theirs.scenes)} · Capas{' '}
        {changed(layers(local), layers(theirs))} · Subtítulos {changed(cues(local), cues(theirs))}
      </p>
      <div className="flex flex-wrap gap-2">
        <button className="studio-primary" disabled={busy} onClick={onCopy}>
          Guardar borrador como copia
        </button>
        <button className="studio-secondary" disabled={busy} onClick={onReload}>
          Descartar mi borrador y recargar
        </button>
      </div>
    </section>
  );
}
