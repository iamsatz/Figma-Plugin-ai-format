import { useEffect, useRef, useState } from 'react';
import { send } from './bridge';
import { suggestIconsWithGemini, friendlyGeminiError } from './api/gemini';
import { suggestIconsWithClaude, friendlyClaudeError } from './api/claude';
import { PHOSPHOR_ICONS } from './icons/catalog';
import { fetchPhosphorSvg } from './icons/phosphor';
import { recordTokens } from './token-usage';
import type { Settings } from '../core/types';

type Props = {
  settings: Settings | null;
  onGoToSettings: () => void;
};

type IconState =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'results'; names: string[]; svgs: Record<string, string> }
  | { kind: 'error'; message: string };

export function IconsPanel({ settings, onGoToSettings }: Props) {
  const [query, setQuery] = useState('');
  const [state, setState] = useState<IconState>({ kind: 'idle' });
  const seenRef = useRef<Set<string>>(new Set());
  const abortRef = useRef<AbortController | null>(null);

  const provider = settings?.aiProvider ?? 'gemini';
  const apiKey = provider === 'claude' ? settings?.claudeApiKey?.trim() : settings?.geminiApiKey?.trim();
  const hasApiKey = Boolean(apiKey);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function search(reset: boolean) {
    if (!apiKey || !query.trim()) return;
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (reset) seenRef.current.clear();

    setState({ kind: 'loading' });

    try {
      const exclude = [...seenRef.current];
      const result = provider === 'claude'
        ? await suggestIconsWithClaude(apiKey, query.trim(), PHOSPHOR_ICONS, exclude, controller.signal)
        : await suggestIconsWithGemini(apiKey, query.trim(), PHOSPHOR_ICONS, exclude, controller.signal);
      if (controller.signal.aborted) return;
      recordTokens('icons', result.usage.inputTokens, result.usage.outputTokens);

      for (const n of result.names) seenRef.current.add(n);

      if (result.names.length === 0) {
        setState({ kind: 'error', message: 'No matches found — try a different search.' });
        return;
      }

      const svgs: Record<string, string> = {};
      await Promise.all(
        result.names.map(async (name) => {
          try {
            svgs[name] = await fetchPhosphorSvg(name, 'regular', controller.signal);
          } catch {
            // Skip icons that failed to fetch — still show others.
          }
        }),
      );
      if (controller.signal.aborted) return;

      setState({ kind: 'results', names: result.names.filter((n) => svgs[n]), svgs });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = provider === 'claude' ? friendlyClaudeError(err) : friendlyGeminiError(err);
      setState({ kind: 'error', message: msg });
    }
  }

  function insert(name: string, svg: string) {
    send({ type: 'insert-svg', svg, name: `Icon_${toPascal(name)}` });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    search(true);
  }

  return (
    <div className="icons-panel">
      {!hasApiKey && (
        <div className="banner">
          Icon suggestions need a {provider === 'claude' ? 'Claude' : 'Gemini'} API key.
          <button className="link" onClick={onGoToSettings}>Add key</button>
        </div>
      )}

      <form className="icons-search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Describe an icon — e.g. 'user profile', 'cart', 'settings'"
          disabled={!hasApiKey}
          aria-label="Icon search"
        />
        <button
          type="submit"
          className="primary"
          disabled={!hasApiKey || !query.trim() || state.kind === 'loading'}
        >
          {state.kind === 'loading' ? 'Searching…' : 'Search'}
        </button>
      </form>

      <div className="icons-body">
        {state.kind === 'idle' && (
          <div className="empty">
            <h2>Find an icon</h2>
            <p>Search by description. AI picks 4 matches from 700+ Phosphor icons. Click to insert.</p>
          </div>
        )}

        {state.kind === 'loading' && (
          <div className="icons-grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="icon-card skeleton" />
            ))}
          </div>
        )}

        {state.kind === 'results' && (
          <>
            <div className="icons-grid">
              {state.names.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="icon-card"
                  onClick={() => insert(name, state.svgs[name])}
                  title={`Insert ${name}`}
                >
                  <span className="icon-preview" dangerouslySetInnerHTML={{ __html: state.svgs[name] }} />
                  <span className="icon-name">{name}</span>
                </button>
              ))}
            </div>
            <button
              type="button"
              className="secondary icons-more"
              onClick={() => search(false)}
              disabled={state.kind !== 'results'}
            >
              Show 4 more
            </button>
          </>
        )}

        {state.kind === 'error' && (
          <div className="error-box">
            <strong>{state.message}</strong>
            <button className="secondary" style={{ marginTop: 8 }} onClick={() => search(true)}>
              Try again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function toPascal(kebab: string): string {
  return kebab
    .split('-')
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
}
