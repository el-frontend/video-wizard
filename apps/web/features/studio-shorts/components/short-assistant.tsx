'use client';
import { useEffect, useState } from 'react';
import type {
  ProjectPage,
  ProjectRecord,
  CompanionRequest,
  CaptionCue,
} from '@workspace/video-project';
import { AssistantPanel } from '@/features/studio-designer/components/assistant-panel';
import { projectRequest } from '@/features/studio-projects/project-api';
export function ShortAssistant({
  source,
  onRanges,
}: {
  source: { id: string; durationMs: number; captions?: CaptionCue[] };
  onRanges: (r: NonNullable<CompanionRequest['ranges']>) => void;
}) {
  const [open, setOpen] = useState(false),
    [list, setList] = useState<ProjectPage['items']>([]),
    [id, setId] = useState(''),
    [error, setError] = useState('');
  useEffect(() => {
    if (!open) return;
    const c = new AbortController();
    (async () => {
      const items: ProjectPage['items'] = [];
      let cursor: string | null = null;
      do {
        const page: ProjectPage = await projectRequest(
          '/api/studio/projects' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''),
          { signal: c.signal }
        );
        items.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor && !c.signal.aborted);
      if (!c.signal.aborted) setList(items);
    })().catch((e) => {
      if (!c.signal.aborted) setError(e.message);
    });
    return () => c.abort();
  }, [open]);
  return (
    <details className="edit-panel" onToggle={(e) => setOpen(e.currentTarget.open)}>
      <summary>Asistente para Shorts</summary>
      {open && (
        <>
          <label>
            Proyecto con la conversación vinculada
            <select value={id} onChange={(e) => setId(e.target.value)}>
              <option value="">Elige un proyecto</option>
              {list.map((p) => (
                <option value={p.id} key={p.id}>
                  {p.title}
                </option>
              ))}
            </select>
          </label>
          {error && <p role="alert">{error}</p>}
          {id && (
            <AssistantPanel
              key={id}
              project={id}
              source={source}
              selection={{ sceneId: null, layerId: null, captionId: null, timeMs: 0 }}
              savedRevision={() => projectRequest<ProjectRecord>('/api/studio/projects/' + id)}
              onRanges={onRanges}
            />
          )}
        </>
      )}
    </details>
  );
}
