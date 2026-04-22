import type { PluginToUiMessage, UiToPluginMessage } from '../core/types';

type Listener = (msg: PluginToUiMessage) => void;
const listeners = new Set<Listener>();

window.addEventListener('message', (event) => {
  const msg = event.data?.pluginMessage as PluginToUiMessage | undefined;
  if (!msg) return;
  listeners.forEach((fn) => fn(msg));
});

export function send(msg: UiToPluginMessage): void {
  parent.postMessage({ pluginMessage: msg }, '*');
}

export function subscribe(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function once<T extends PluginToUiMessage['type']>(
  type: T,
  timeoutMs = 5000,
): Promise<Extract<PluginToUiMessage, { type: T }>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      unsubscribe();
      reject(new Error(`Timed out waiting for ${type}`));
    }, timeoutMs);
    const unsubscribe = subscribe((msg) => {
      if (msg.type === type) {
        clearTimeout(timer);
        unsubscribe();
        resolve(msg as Extract<PluginToUiMessage, { type: T }>);
      }
    });
  });
}
