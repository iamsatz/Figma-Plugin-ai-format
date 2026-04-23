import { useEffect, useRef, useState } from 'react';
import { send } from './bridge';
import { suggestIconsWithGemini, friendlyGeminiError } from './api/gemini';
import { suggestIconsWithClaude, friendlyClaudeError } from './api/claude';
import { PHOSPHOR_ICONS } from './icons/catalog';
import { fetchPhosphorSvg } from './icons/phosphor';
import {
  getIconsStore,
  setQuery as storeSetQuery,
  setPanelState,
  addSeen,
  resetSeen,
  subscribeIconsStore,
} from './icons/state';
import { recordTokens } from './token-usage';
import type { Settings } from '../core/types';

type Props = {
  settings: Settings | null;
  onGoToSettings: () => void;
};

export function IconsPanel({ settings, onGoToSettings }: Props) {
  const [, forceRender] = useState({});
  const store = getIconsStore();
  const { query, panelState: state, seen } = store;
  const abortRef = useRef<AbortController | null>(null);

  const provider = settings?.aiProvider ?? 'gemini';
  const providerLabel = provider === 'claude' ? 'Claude Haiku 4.5' : 'Gemini 2.5 Flash';
  const apiKey = provider === 'claude' ? settings?.claudeApiKey?.trim() : settings?.geminiApiKey?.trim();
  const hasApiKey = Boolean(apiKey);

  useEffect(() => {
    // subscribeIconsStore calls notify on store changes; force-render on each.
    return subscribeIconsStore(() => forceRender({}));
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  async function search(reset: boolean) {
    if (!apiKey || !query.trim()) return;
    if (state.kind === 'loading') return;
    if (state.kind === 'results' && state.loadingMore) return;

    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    if (reset) resetSeen();

    if (reset || state.kind !== 'results') {
      setPanelState({ kind: 'loading' });
    } else {
      setPanelState({ ...state, loadingMore: true });
    }

    try {
      const exclude = [...seen];
      const result = provider === 'claude'
        ? await suggestIconsWithClaude(apiKey, query.trim(), PHOSPHOR_ICONS, exclude, controller.signal)
        : await suggestIconsWithGemini(apiKey, query.trim(), PHOSPHOR_ICONS, exclude, controller.signal);
      if (controller.signal.aborted) return;
      recordTokens('icons', result.usage.inputTokens, result.usage.outputTokens);

      addSeen(result.names);

      if (result.names.length === 0) {
        const current = getIconsStore().panelState;
        const previous = current.kind === 'results' ? current.data : undefined;
        setPanelState({ kind: 'error', message: 'No more matches — try a different search.', previous });
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

      const fetched = result.names.filter((n) => svgs[n]);
      setPanelState({ kind: 'results', data: { names: fetched, svgs }, loadingMore: false });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = provider === 'claude' ? friendlyClaudeError(err) : friendlyGeminiError(err);
      const current = getIconsStore().panelState;
      const previous = current.kind === 'results' ? current.data : undefined;
      setPanelState({ kind: 'error', message: msg, previous });
    }
  }

  function insert(name: string, svg: string) {
    send({ type: 'insert-svg', svg, name: `Icon_${toPascal(name)}` });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    search(true);
  }

  const currentResults = state.kind === 'results'
    ? state.data
    : state.kind === 'error'
    ? state.previous
    : undefined;
  const isSearching =
    state.kind === 'loading' || (state.kind === 'results' && state.loadingMore);

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
          onChange={(e) => storeSetQuery(e.target.value)}
          placeholder="Describe an icon — e.g. 'user profile', 'cart', 'settings'"
          disabled={!hasApiKey || isSearching}
          aria-label="Icon search"
        />
        <button
          type="submit"
          className="primary"
          disabled={!hasApiKey || !query.trim() || isSearching}
        >
          {isSearching ? 'Searching…' : 'Search'}
        </button>
      </form>

      {hasApiKey && (
        <div className="icons-provider-note">via {providerLabel}</div>
      )}

      <div className="icons-body">
        {state.kind === 'idle' && (
          <div className="empty">
            <h2>Find an icon</h2>
            <p>Describe what you need. Click a result to place it on the canvas.</p>
          </div>
        )}

        {state.kind === 'loading' && (
          <div className="icons-grid">
            {[...Array(4)].map((_, i) => (
              <div key={i} className="icon-card skeleton" />
            ))}
          </div>
        )}

        {currentResults && (
          <>
            <div className="icons-grid" aria-busy={isSearching}>
              {currentResults.names.map((name) => (
                <button
                  key={name}
                  type="button"
                  className="icon-card"
                  onClick={() => insert(name, currentResults.svgs[name])}
                  aria-label={`Insert ${name}`}
                  title={`Insert ${name}`}
                >
                  <span className="icon-preview" aria-hidden dangerouslySetInnerHTML={{ __html: currentResults.svgs[name] }} />
                  <span className="icon-name">{name}</span>
                </button>
              ))}
            </div>
            {state.kind === 'results' && (
              <button
                type="button"
                className="secondary icons-more"
                onClick={() => search(false)}
                disabled={isSearching}
              >
                {isSearching ? 'Loading…' : 'Show 4 more'}
              </button>
            )}
          </>
        )}

        {state.kind === 'error' && (
          <div className="error-box" style={currentResults ? { marginTop: 12 } : undefined}>
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
