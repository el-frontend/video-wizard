// @vitest-environment jsdom
import { expect, it, vi } from 'vitest';
import { guardProjectHistory } from './project-navigation';

type Navigation = Parameters<typeof guardProjectHistory>[0];
type Navigate = Parameters<Navigation['addEventListener']>[1];

it.each([false, true])(
  'keeps the rendered view aligned when a return rejects (committed=%s)',
  async (committed) => {
    const entry = (key: string) => ({ key }) as NavigationHistoryEntry;
    const editor = entry('editor'),
      library = entry('library');
    let browserEntry = editor;
    let rendered = 'editor';
    let draft: string | null = 'Edición local';
    let retained: string | null = null;
    let navigate!: Navigate;
    const showRecovery = vi.fn();
    const nextPop = () => {
      rendered = browserEntry.key;
      draft = rendered === 'editor' ? retained : null;
    };
    const pop = () => window.dispatchEvent(new PopStateEvent('popstate'));
    const navigation = {
      get currentEntry() {
        return browserEntry;
      },
      addEventListener: (_type: 'navigate', fn: Navigate) => {
        navigate = fn;
      },
      removeEventListener: vi.fn(),
      traverseTo: vi.fn(() => {
        const failure = new DOMException('Interrupted traversal', 'AbortError');
        if (committed) {
          browserEntry = editor;
          pop();
        }
        return {
          committed: committed ? Promise.resolve(editor) : Promise.reject(failure),
          finished: Promise.reject(failure),
        };
      }),
    };
    const retain = () => {
      retained = draft;
      return () => {
        retained = null;
      };
    };
    const leave = vi.fn(async () => false);
    window.addEventListener('popstate', nextPop);
    const stop = guardProjectHistory(navigation, () => true, leave, retain, showRecovery);
    try {
      navigate(
        Object.assign(new Event('navigate'), {
          navigationType: 'traverse',
          signal: new AbortController().signal,
          canIntercept: true,
          destination: { sameDocument: true, key: 'library' },
          intercept: vi.fn(),
        })
      );
      expect(retained).toBe('Edición local');
      stop(); // React may unmount on the entry change before popstate.
      browserEntry = library;
      pop();
      await vi.waitFor(() => expect(navigation.traverseTo).toHaveBeenCalledWith('editor'));
      await Promise.resolve();
      expect(rendered).toBe(browserEntry.key);
      expect(retained).toBe('Edición local');
      if (committed) {
        expect(draft).toBe('Edición local');
        expect(showRecovery).not.toHaveBeenCalled();
      } else {
        expect(rendered).toBe('library');
        expect(showRecovery).toHaveBeenCalledOnce();
      }
    } finally {
      stop();
      window.removeEventListener('popstate', nextPop);
    }
  }
);
