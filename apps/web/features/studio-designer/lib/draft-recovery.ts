import {
  ProjectDraftSchema,
  ProjectRecordSchema,
  type ProjectDraft,
  type ProjectRecord,
} from '@workspace/video-project';
import { z } from 'zod';

const schema = z.strictObject({
  version: z.literal(1),
  writer: z.string(),
  stamp: z.string(),
  updatedAt: z.number(),
  base: ProjectRecordSchema,
  draft: ProjectDraftSchema,
});
export type LocalDraft = z.infer<typeof schema>;
export class DraftRecovery {
  readonly prefix: string;
  constructor(
    private readonly storage: Storage,
    readonly owner: string,
    readonly project: string,
    readonly writer: string
  ) {
    this.prefix =
      'studio:draft:v1:' + encodeURIComponent(owner) + ':' + encodeURIComponent(project) + ':';
  }
  private key(entry: LocalDraft) {
    return (
      this.prefix + encodeURIComponent(entry.base.revision) + ':' + encodeURIComponent(entry.writer)
    );
  }
  private valid(entry: LocalDraft) {
    return (
      entry.base.ownerId === this.owner &&
      entry.base.document.id === this.project &&
      entry.draft.id === this.project &&
      entry.draft.engine === entry.base.document.engine
    );
  }
  list(onCorrupt?: () => void) {
    const entries: LocalDraft[] = [];
    for (let i = 0; i < this.storage.length; i++) {
      const key = this.storage.key(i);
      if (!key?.startsWith(this.prefix)) continue;
      try {
        const entry = schema.parse(JSON.parse(this.storage.getItem(key) ?? 'null'));
        if (!this.valid(entry) || key !== this.key(entry))
          throw new Error('Identidades incompatibles.');
        entries.push(entry);
      } catch {
        onCorrupt?.();
      }
    }
    return entries.sort((a, b) => b.updatedAt - a.updatedAt);
  }
  keep(base: ProjectRecord, draft: ProjectDraft) {
    const entry = schema.parse({
      version: 1,
      writer: this.writer,
      stamp: crypto.randomUUID(),
      updatedAt: Date.now(),
      base,
      draft,
    });
    if (!this.valid(entry)) throw new Error('El borrador corresponde a otro proyecto.');
    this.storage.setItem(this.key(entry), JSON.stringify(entry));
    return entry;
  }
  remove(entry: LocalDraft) {
    if (entry.writer !== this.writer || !this.valid(entry)) return;
    const key = this.key(entry),
      raw = this.storage.getItem(key);
    if (raw && schema.parse(JSON.parse(raw)).stamp === entry.stamp) this.storage.removeItem(key);
  }
}

// sessionStorage can be cloned when a tab is duplicated. The exclusive lease distinguishes
// the original tab from a live clone. Without Web Locks every document gets a private writer.
let lease: Promise<string> | undefined;
export function tabDraftWriter(): Promise<string> {
  if (lease) return lease;
  if (!navigator.locks) return Promise.resolve(crypto.randomUUID());
  lease = new Promise<string>((resolve) => {
    let token: string;
    const key = 'studio:draft-writer';
    try {
      token = sessionStorage.getItem(key) || crypto.randomUUID();
    } catch {
      resolve(crypto.randomUUID());
      return;
    }
    const reserve = async (id: string) => {
      await navigator.locks.request(key + ':' + id, { ifAvailable: true }, async (lock) => {
        if (!lock) {
          void reserve(crypto.randomUUID()).catch(() => resolve(crypto.randomUUID()));
          return;
        }
        try {
          sessionStorage.setItem(key, id);
        } catch {}
        resolve(id);
        await new Promise<void>((release) =>
          window.addEventListener(
            'pagehide',
            () => {
              lease = undefined;
              release();
            },
            { once: true }
          )
        );
      });
    };
    void reserve(token).catch(() => resolve(crypto.randomUUID()));
  });
  return lease;
}
