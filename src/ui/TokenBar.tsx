import { useEffect, useState } from 'react';
import {
  getUsage,
  resetUsage,
  subscribeUsage,
  type TokenUsage,
} from './token-usage';

function formatNumber(n: number): string {
  if (n >= 10000) {
    const k = n / 1000;
    return `${k.toFixed(1)}k`;
  }
  return new Intl.NumberFormat('en-US').format(n);
}

function totalOf(u: TokenUsage): number {
  return (
    u.naming.inputTokens +
    u.naming.outputTokens +
    u.icons.inputTokens +
    u.icons.outputTokens
  );
}

function buildTooltip(u: TokenUsage): string {
  const naming = `Naming: ${u.naming.inputTokens}in + ${u.naming.outputTokens}out (${u.naming.calls} calls)`;
  const icons = `Icons: ${u.icons.inputTokens}in + ${u.icons.outputTokens}out (${u.icons.calls} calls)`;
  return `${naming}\n${icons}`;
}

export function TokenBar(): JSX.Element | null {
  const [usage, setUsage] = useState<TokenUsage>(() => getUsage());

  useEffect(() => {
    const unsubscribe = subscribeUsage((u) => setUsage(u));
    return unsubscribe;
  }, []);

  const total = totalOf(usage);
  if (total === 0) return null;

  const tooltip = buildTooltip(usage);

  return (
    <div className="token-bar" title={tooltip}>
      <span className="token-bar-dot" aria-hidden />
      <span className="token-bar-label">Tokens this session</span>
      <span className="token-bar-value">{formatNumber(total)}</span>
      <button
        className="token-bar-reset"
        onClick={resetUsage}
        aria-label="Reset token counter"
      >
        Reset
      </button>
    </div>
  );
}
