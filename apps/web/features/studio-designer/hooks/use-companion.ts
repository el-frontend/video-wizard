'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AssistantProvider,
  CompanionRequest,
  CompanionRequestInput,
} from '@workspace/video-project';
import { projectRequest } from '@/features/studio-projects/project-api';
export type PublicBinding = { bindingId: string; provider: AssistantProvider };
const json = (body: unknown) => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
export function useCompanion(project: string, open: boolean) {
  const [target, setTarget] = useState<{ id: string; unavailable: boolean } | null>(null);
  const [bindings, setBindings] = useState<PublicBinding[]>([]),
    [receipts, setReceipts] = useState<CompanionRequest[]>([]);
  const [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const flight = useRef(false),
    last = useRef<{ body: string; key: string } | null>(null);
  const base = '/api/studio/projects/' + project;
  const refresh = useCallback(
    async (signal?: AbortSignal) => {
      const [b, r] = await Promise.all([
        projectRequest<PublicBinding[]>('/api/studio/companion?projectId=' + project, { signal }),
        projectRequest<CompanionRequest[]>(base + '/requests', { signal }),
      ]);
      if (!signal?.aborted) {
        setBindings(b);
        setTarget((current) => {
          if (!current) return b[0] ? { id: b[0].bindingId, unavailable: false } : null;
          if (!current.unavailable && !b.some((item) => item.bindingId === current.id))
            return { ...current, unavailable: true };
          return current;
        });
        setReceipts(r);
      }
    },
    [base, project]
  );
  useEffect(() => {
    if (!open) return;
    const abort = new AbortController();
    let active = false;
    async function poll() {
      if (active || document.visibilityState === 'hidden') return;
      active = true;
      try {
        await refresh(abort.signal);
      } catch (e) {
        if (!abort.signal.aborted) setError((e as Error).message);
      } finally {
        active = false;
      }
    }
    void poll();
    const timer = setInterval(poll, 3500);
    return () => {
      abort.abort();
      clearInterval(timer);
    };
  }, [open, refresh]);
  async function run(action: () => Promise<void>) {
    if (flight.current) return;
    flight.current = true;
    setBusy(true);
    setError('');
    try {
      await action();
      await refresh();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
      flight.current = false;
    }
  }
  async function send(input: Omit<CompanionRequestInput, 'idempotencyKey'>) {
    const body = JSON.stringify(input);
    if (last.current?.body !== body) last.current = { body, key: crypto.randomUUID() };
    await projectRequest(base + '/requests', json({ ...input, idempotencyKey: last.current.key }));
    last.current = null;
  }
  async function pair() {
    const intent = await projectRequest(base + '/pairing', { method: 'POST' });
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(intent)], { type: 'application/json' })
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = 'studio-pairing.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  }
  function selectBinding(id: string) {
    setTarget({ id, unavailable: false });
  }
  return { bindings, target, selectBinding, receipts, busy, error, run, send, pair };
}
