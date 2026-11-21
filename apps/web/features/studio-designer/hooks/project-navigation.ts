interface HistoryTraversal extends Event {
  navigationType: string;
  signal: AbortSignal;
  canIntercept: boolean;
  intercept(options: { precommitHandler: () => Promise<void> }): void;
  destination: { sameDocument: boolean; key: string };
}
interface StudioNavigation {
  currentEntry: NavigationHistoryEntry | null;
  traverseTo(key: string): {
    committed: Promise<NavigationHistoryEntry>;
    finished: Promise<NavigationHistoryEntry>;
  };
  addEventListener(type: 'navigate', handler: (event: HistoryTraversal) => void): void;
  removeEventListener(type: 'navigate', handler: (event: HistoryTraversal) => void): void;
}

export function studioNavigation(): StudioNavigation | undefined {
  if (!('NavigationPrecommitController' in window)) return undefined;
  return (window as Window & { navigation?: StudioNavigation }).navigation;
}

export function guardProjectHistory(
  navigation: StudioNavigation,
  needsSave: () => boolean,
  mayLeave: () => Promise<boolean>,
  retainDraft: () => () => void,
  offerRecovery: () => void
) {
  let returningTo: string | null = null;

  async function settleTraversal(editor: string, target: string, release: () => void) {
    if (await mayLeave()) {
      release();
      return;
    }
    if (navigation.currentEntry?.key === target) {
      try {
        returningTo = editor;
        const result = navigation.traverseTo(editor);
        // A traversal may commit and still reject finished when interrupted afterward.
        await Promise.allSettled([result.committed, result.finished]);
      } catch {
        // The target entry may have been disposed before traverseTo was called.
      } finally {
        returningTo = null;
      }
    }
    if (navigation.currentEntry?.key !== editor) offerRecovery();
  }

  function navigate(event: HistoryTraversal) {
    const editor = navigation.currentEntry?.key;
    const target = event.destination.key;
    if (
      !editor ||
      !target ||
      target === editor ||
      target === returningTo ||
      !needsSave() ||
      event.navigationType !== 'traverse' ||
      !event.destination.sameDocument
    )
      return;
    if (event.cancelable && event.canIntercept) {
      event.intercept({
        precommitHandler: async () => {
          if (!(await mayLeave())) throw new DOMException('Salida cancelada', 'AbortError');
        },
      });
      return;
    }
    // Next can unmount the editor on the entry change, before popstate reaches this listener.
    const release = retainDraft();
    const onPop = () => {
      event.signal.removeEventListener('abort', onAbort);
      if (navigation.currentEntry?.key === target) void settleTraversal(editor, target, release);
    };
    const onAbort = () => {
      if (navigation.currentEntry?.key === editor)
        window.removeEventListener('popstate', onPop, true);
    };
    event.signal.addEventListener('abort', onAbort, { once: true });
    window.addEventListener('popstate', onPop, { capture: true, once: true });
  }
  navigation.addEventListener('navigate', navigate);
  return () => {
    navigation.removeEventListener('navigate', navigate);
  };
}
