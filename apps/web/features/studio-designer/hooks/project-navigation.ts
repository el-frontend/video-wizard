interface HistoryTraversal extends Event {
  navigationType: string;
  canIntercept: boolean;
  intercept(options: { precommitHandler: () => Promise<void> }): void;
  destination: { sameDocument: boolean; key: string };
}
interface StudioNavigation {
  currentEntry: NavigationHistoryEntry | null;
  traverseTo(key: string): { finished: Promise<NavigationHistoryEntry> };
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
  mayLeave: () => Promise<boolean>
) {
  const editor = navigation.currentEntry?.key;
  let authorized: string | null = null;
  let attempt = 0;
  const lifetime = new AbortController();
  function restore(key: string) {
    authorized = key;
    return navigation
      .traverseTo(key)
      .finished.catch(() => {})
      .finally(() => {
        if (authorized === key) authorized = null;
      });
  }
  function navigate(event: HistoryTraversal) {
    const target = event.destination.key;
    if (
      !editor ||
      !needsSave() ||
      event.navigationType !== 'traverse' ||
      !event.destination.sameDocument ||
      !target ||
      target === editor ||
      target === authorized
    )
      return;
    const currentAttempt = ++attempt;
    const finish = async () => {
      if (
        (await mayLeave()) &&
        !lifetime.signal.aborted &&
        currentAttempt === attempt &&
        navigation.currentEntry?.key === editor
      )
        await restore(target);
    };
    if (event.cancelable && event.canIntercept) {
      event.intercept({
        precommitHandler: async () => {
          if (!(await mayLeave())) throw new DOMException('Salida cancelada', 'AbortError');
        },
      });
      return;
    }
    // Some browser-initiated traversals cannot be canceled. Keep the editor mounted
    // while returning to its existing entry, then honor the save/discard decision.
    window.addEventListener(
      'popstate',
      (pop) => {
        pop.stopImmediatePropagation();
        void restore(editor).then(finish);
      },
      { capture: true, once: true, signal: lifetime.signal }
    );
  }
  navigation.addEventListener('navigate', navigate);
  return () => {
    lifetime.abort();
    navigation.removeEventListener('navigate', navigate);
  };
}
