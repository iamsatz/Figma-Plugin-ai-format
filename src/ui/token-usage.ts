export type TokenFeature = 'naming' | 'icons';

export type TokenBucket = {
  inputTokens: number;
  outputTokens: number;
  calls: number;
};

export type TokenUsage = Record<TokenFeature, TokenBucket>;

type Subscriber = (u: TokenUsage) => void;

function emptyBucket(): TokenBucket {
  return { inputTokens: 0, outputTokens: 0, calls: 0 };
}

function emptyUsage(): TokenUsage {
  return {
    naming: emptyBucket(),
    icons: emptyBucket(),
  };
}

function coerce(n: number): number {
  if (typeof n !== 'number' || Number.isNaN(n)) return 0;
  if (n < 0) return 0;
  return n;
}

let usage: TokenUsage = emptyUsage();
const subscribers = new Set<Subscriber>();

function notify(): void {
  const snapshot = getUsage();
  subscribers.forEach((fn) => {
    try {
      fn(snapshot);
    } catch {
      // swallow subscriber errors so one bad handler can't block others
    }
  });
}

export function recordTokens(
  feature: TokenFeature,
  inputTokens: number,
  outputTokens: number
): void {
  const bucket = usage[feature];
  if (!bucket) return;
  bucket.inputTokens += coerce(inputTokens);
  bucket.outputTokens += coerce(outputTokens);
  bucket.calls += 1;
  notify();
}

export function getUsage(): TokenUsage {
  return {
    naming: { ...usage.naming },
    icons: { ...usage.icons },
  };
}

export function resetUsage(): void {
  usage = emptyUsage();
  notify();
}

export function subscribeUsage(fn: (u: TokenUsage) => void): () => void {
  subscribers.add(fn);
  return () => {
    subscribers.delete(fn);
  };
}
