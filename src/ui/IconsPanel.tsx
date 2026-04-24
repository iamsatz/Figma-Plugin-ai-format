import { useEffect, useRef, useState } from 'react';
import { send } from './bridge';
import { suggestIconsWithGemini, friendlyGeminiError } from './api/gemini';
import { suggestIconsWithClaude, friendlyClaudeError } from './api/claude';
import { PHOSPHOR_ICONS } from './icons/catalog';
import { LUCIDE_ICONS, HEROICONS, MATERIAL_ICONS } from './icons/catalogs';
import { fetchIconSvg } from './icons/fetchers';
import { suggestionId, type IconLibrary, type IconSuggestion } from './icons/types';
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
};

const CATALOGS: Record<IconLibrary, readonly string[]> = {
  phosphor: PHOSPHOR_ICONS,
  lucide: LUCIDE_ICONS,
  heroicons: HEROICONS,
  material: MATERIAL_ICONS,
};

export function IconsPanel({ settings }: Props) {
  const [, forceRender] = useState({});
  const store = getIconsStore();
  const { query, panelState: state, seen } = store;
  const abortRef = useRef<AbortController | null>(null);

  const provider = settings?.aiProvider ?? 'gemini';
  const apiKey = provider === 'claude' ? settings?.claudeApiKey?.trim() : settings?.geminiApiKey?.trim();
  const hasApiKey = Boolean(apiKey);

  useEffect(() => {
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
        ? await suggestIconsWithClaude(apiKey, query.trim(), CATALOGS, exclude, controller.signal)
        : await suggestIconsWithGemini(apiKey, query.trim(), CATALOGS, exclude, controller.signal);
      if (controller.signal.aborted) return;
      recordTokens('icons', result.usage.inputTokens, result.usage.outputTokens);

      addSeen(result.suggestions.map(suggestionId));

      if (result.suggestions.length === 0) {
        const current = getIconsStore().panelState;
        const previous = current.kind === 'results' ? current.data : undefined;
        setPanelState({ kind: 'error', message: 'No more matches — try a different search.', previous });
        return;
      }

      const svgs: Record<string, string> = {};
      await Promise.all(
        result.suggestions.map(async (s) => {
          const id = suggestionId(s);
          if (s.kind === 'custom') {
            svgs[id] = s.svg;
            return;
          }
          try {
            svgs[id] = await fetchIconSvg(s.library, s.name, controller.signal);
          } catch {
            // Skip icons that failed to fetch — still show others.
          }
        }),
      );
      if (controller.signal.aborted) return;

      const fetched = result.suggestions.filter((s) => svgs[suggestionId(s)]);
      setPanelState({ kind: 'results', data: { suggestions: fetched, svgs }, loadingMore: false });
    } catch (err) {
      if (controller.signal.aborted) return;
      const msg = provider === 'claude' ? friendlyClaudeError(err) : friendlyGeminiError(err);
      const current = getIconsStore().panelState;
      const previous = current.kind === 'results' ? current.data : undefined;
      setPanelState({ kind: 'error', message: msg, previous });
    }
  }

  function insert(s: IconSuggestion, svg: string) {
    send({ type: 'insert-svg', svg, name: `Icon_${toPascal(s.name)}` });
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
      <form className="icons-search" onSubmit={handleSubmit}>
        <input
          type="text"
          value={query}
          onChange={(e) => storeSetQuery(e.target.value)}
          placeholder="Describe an icon — e.g. 'shopping cart', 'settings gear'"
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

      <div className="icons-body">
        {state.kind === 'idle' && (
          <div className="empty">
            <h2>Find an icon</h2>
            <p>Describe what you need. AI picks 4 matches from Phosphor, Lucide, Heroicons, and Material — or designs one if nothing fits.</p>
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
          <div className="icons-grid" aria-busy={isSearching}>
            {currentResults.suggestions.map((s) => {
              const id = suggestionId(s);
              const svg = currentResults.svgs[id];
              const sourceLabel = s.kind === 'library' ? libraryLabel(s.library) : 'AI';
              return (
                <button
                  key={id}
                  type="button"
                  className="icon-card"
                  onClick={() => insert(s, svg)}
                  aria-label={`Insert ${s.name}`}
                  title={`Insert ${s.name} (${sourceLabel})`}
                >
                  <span className="icon-preview" aria-hidden dangerouslySetInnerHTML={{ __html: svg }} />
                  <span className="icon-name">{s.name}</span>
                  <span className="icon-source">{sourceLabel}</span>
                </button>
              );
            })}
          </div>
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

function libraryLabel(library: IconLibrary): string {
  switch (library) {
    case 'phosphor': return 'Phosphor';
    case 'lucide': return 'Lucide';
    case 'heroicons': return 'Heroicons';
    case 'material': return 'Material';
  }
}

function toPascal(kebab: string): string {
  return kebab
    .split(/[-_]/)
    .map((seg) => seg.charAt(0).toUpperCase() + seg.slice(1))
    .join('');
}
