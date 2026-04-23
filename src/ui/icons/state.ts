export type ResultsData = { names: string[]; svgs: Record<string, string> };

export type IconsPanelState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; data: ResultsData; loadingMore: boolean }
  | { kind: 'error'; message: string; previous?: ResultsData };

export type IconsStore = {
  query: string;
  panelState: IconsPanelState;
  seen: Set<string>;
};

let store: IconsStore = {
  query: '',
  panelState: { kind: 'idle' },
  seen: new Set(),
};

const subscribers = new Set<() => void>();

function notify(): void {
  subscribers.forEach((fn) => {
    try {
      fn();
    } catch {
      // Swallow subscriber errors so one bad handler can't block others.
    }
  });
}

export function getIconsStore(): IconsStore {
  return store;
}

export function setQuery(q: string): void {
  if (store.query === q) return;
  store = { ...store, query: q };
  notify();
}

export function setPanelState(next: IconsPanelState): void {
  store = { ...store, panelState: next };
  notify();
}

export function addSeen(names: readonly string[]): void {
  for (const n of names) store.seen.add(n);
}

export function resetSeen(): void {
  store.seen.clear();
}

export function subscribeIconsStore(fn: () => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
