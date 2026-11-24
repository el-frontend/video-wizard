// @vitest-environment jsdom
import { expect, it } from 'vitest';
import { exampleProject } from '@workspace/video-project/fixtures';
import { DraftRecovery } from './draft-recovery';
const base = {
  ownerId: 'one',
  revision: 'first',
  updatedAt: '2026-01-01T00:00:00Z',
  document: exampleProject(),
};
it('isolates writers and removes only the submitted version, even after a later edit', () => {
  localStorage.clear();
  const a = new DraftRecovery(localStorage, 'one', 'project', 'tab-a'),
    b = new DraftRecovery(localStorage, 'one', 'project', 'tab-b');
  const first = a.keep(base, { ...base.document, title: 'A' }),
    second = a.keep(base, { ...base.document, title: 'B' });
  const other = b.keep(base, { ...base.document, title: 'Otro' });
  a.remove(first);
  expect(
    a
      .list()
      .map((x) => x.draft.title)
      .sort()
  ).toEqual(['B', 'Otro']);
  a.remove(other);
  expect(b.list()).toHaveLength(2);
  a.remove(second);
  expect(b.list().map((x) => x.draft.title)).toEqual(['Otro']);
  expect(new DraftRecovery(localStorage, 'another', 'project', 'tab-a').list()).toEqual([]);
});
it('keeps the earlier valid entry when storage runs out and reports corrupted rows without deleting them', () => {
  localStorage.clear();
  const store = new DraftRecovery(localStorage, 'one', 'project', 'writer');
  const good = store.keep(base, { ...base.document, title: 'Conservado' });
  const badKey = store.prefix + 'bad';
  localStorage.setItem(badKey, '{');
  let damaged = 0;
  expect(store.list(() => damaged++)).toEqual([good]);
  expect(damaged).toBe(1);
  expect(localStorage.getItem(badKey)).toBe('{');
  const failing = {
    length: localStorage.length,
    key: (i: number) => localStorage.key(i),
    getItem: (k: string) => localStorage.getItem(k),
    removeItem: () => {},
    clear: () => {},
    setItem: () => {
      throw new DOMException('Full', 'QuotaExceededError');
    },
  };
  expect(() =>
    new DraftRecovery(failing, 'one', 'project', 'writer').keep(base, {
      ...base.document,
      title: 'Nuevo',
    })
  ).toThrow();
  expect(store.list()).toEqual([good]);
});
it('keeps the offered version when a reloaded tab edits and saves the same base', () => {
  localStorage.clear();
  const old = new DraftRecovery(localStorage, 'one', 'project', 'writer');
  const offered = old.keep(base, { ...base.document, title: 'A' });
  const reloaded = new DraftRecovery(localStorage, 'one', 'project', 'writer');
  const submitted = reloaded.keep(base, { ...base.document, title: 'B' });
  reloaded.remove(submitted);
  expect(reloaded.list()).toEqual([offered]);
});
it('can recover and remove an earlier v1 key after upgrading', () => {
  localStorage.clear();
  const store = new DraftRecovery(localStorage, 'one', 'project', 'writer');
  const offered = store.keep(base, { ...base.document, title: 'Antes' });
  localStorage.clear();
  localStorage.setItem(store.prefix + 'first:writer', JSON.stringify(offered));
  expect(store.list()).toEqual([offered]);
  store.remove(offered);
  expect(store.list()).toEqual([]);
});
