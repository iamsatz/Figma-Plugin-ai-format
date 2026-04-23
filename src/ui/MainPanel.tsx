import { useEffect, useMemo, useRef, useState } from 'react';
import { send, subscribe } from './bridge';
import { FixList } from './FixList';
import { renameWithGemini, friendlyGeminiError } from './api/gemini';
import { fallbackNames } from './api/fallback-names';
import type { Fix, RenameCandidate, ScanStats, Scope, Settings } from '../core/types';

type Props = {
  settings: Settings | null;
  onGoToSettings: () => void;
};

type ScanState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; fixes: Fix[]; stats: ScanStats; candidatesSkipped: number }
  | { kind: 'applied'; fixes: Fix[]; appliedIds: Set<string>; failedIds: Set<string> }
  | { kind: 'error'; message: string };

type NamingState =
  | { kind: 'none' }
  | { kind: 'running'; processed: number; total: number }
  | { kind: 'done'; added: number }
  | { kind: 'fallback-no-key'; added: number }
  | { kind: 'fallback-api-error'; added: number; errorMsg: string };

// 'review' items are unchecked by default; all others are pre-checked.
function defaultChecked(fixes: Fix[]): Set<string> {
  return new Set(fixes.filter((f) => f.confidence !== 'review').map((f) => f.id));
}

export function MainPanel({ settings, onGoToSettings }: Props) {
  const [scope, setScopeRaw] = useState<Scope>('selection');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [naming, setNaming] = useState<NamingState>({ kind: 'none' });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  const hasApiKey = Boolean(settings?.aiApiKey);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'scan-result') {
        setState({
          kind: 'done',
          fixes: msg.fixes,
          stats: msg.stats,
          candidatesSkipped: msg.candidatesSkipped,
        });
        setCheckedIds(defaultChecked(msg.fixes));
        kickOffNaming(msg.renameCandidates);
      } else if (msg.type === 'rename-fixes') {
        if (msg.fixes.length === 0) return;
        setState((prev) => {
          if (prev.kind !== 'done') return prev;
          return { ...prev, fixes: [...prev.fixes, ...msg.fixes] };
        });
        setCheckedIds((prev) => {
          const next = new Set(prev);
          for (const f of msg.fixes) if (f.confidence !== 'review') next.add(f.id);
          return next;
        });
      } else if (msg.type === 'apply-result') {
        setApplying(false);
        setState((prev) => {
          if (prev.kind !== 'done') return prev;
          return {
            kind: 'applied',
            fixes: prev.fixes,
            appliedIds: new Set(msg.applied),
            failedIds: new Set(msg.failed),
          };
        });
      } else if (msg.type === 'error') {
        setState({ kind: 'error', message: msg.message });
        setApplying(false);
      }
    });
    // settings change is captured via closure below; subscribe stays stable.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [settings?.aiApiKey]);

  async function kickOffNaming(candidates: RenameCandidate[]) {
    if (candidates.length === 0) {
      setNaming({ kind: 'none' });
      return;
    }

    const apiKey = settings?.aiApiKey?.trim();
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;

    setNaming({ kind: 'running', processed: 0, total: candidates.length });

    const combined: Record<string, string> = {};
    const fallbackIds = new Set<string>();
    let sawApiError = false;
    let lastApiErrorMsg = 'Check your connection';

    for (let i = 0; i < candidates.length; i++) {
      if (controller.signal.aborted) return;
      const candidate = candidates[i];
      let aiOk = false;
      if (apiKey) {
        try {
          const names = await renameWithGemini(apiKey, candidate.pngBase64, candidate.tree, controller.signal);
          Object.assign(combined, names);
          aiOk = true;
        } catch (err) {
          if (controller.signal.aborted) return;
          sawApiError = true;
          lastApiErrorMsg = friendlyGeminiError(err);
        }
      }
      if (!aiOk) {
        const fallback = fallbackNames(candidate.tree);
        for (const [id, name] of Object.entries(fallback)) {
          combined[id] = name;
          fallbackIds.add(id);
        }
      }
      setNaming({ kind: 'running', processed: i + 1, total: candidates.length });
    }

    if (controller.signal.aborted) return;

    const validNames: Record<string, string> = {};
    for (const [id, name] of Object.entries(combined)) {
      if (typeof name === 'string' && name.trim()) validNames[id] = name.trim();
    }

    send({
      type: 'rename-results',
      names: validNames,
      fallbackIds: [...fallbackIds],
    });

    const count = Object.keys(validNames).length;
    if (!apiKey) {
      setNaming({ kind: 'fallback-no-key', added: count });
    } else if (sawApiError) {
      setNaming({ kind: 'fallback-api-error', added: count, errorMsg: lastApiErrorMsg });
    } else {
      setNaming({ kind: 'done', added: count });
    }
  }

  function setScope(next: Scope) {
    if (next === scope) return;
    setScopeRaw(next);
    if (state.kind !== 'idle' && state.kind !== 'running') {
      setState({ kind: 'idle' });
      setCheckedIds(new Set());
      setNaming({ kind: 'none' });
    }
  }

  function runScan() {
    abortRef.current?.abort();
    setState({ kind: 'running' });
    setCheckedIds(new Set());
    setNaming({ kind: 'none' });
    send({ type: 'scan', scope });
  }

  function discard() {
    abortRef.current?.abort();
    setState({ kind: 'idle' });
    setCheckedIds(new Set());
    setNaming({ kind: 'none' });
  }

  function toggleFix(id: string) {
    setCheckedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function applySelected() {
    if (state.kind !== 'done' || checkedIds.size === 0) return;
    setApplying(true);
    send({ type: 'apply', fixIds: [...checkedIds] });
  }

  function applyAllHighConfidence() {
    if (state.kind !== 'done') return;
    const highIds = state.fixes.filter((f) => f.confidence === 'high').map((f) => f.id);
    if (highIds.length === 0) return;
    setApplying(true);
    send({ type: 'apply', fixIds: highIds });
  }

  const fixes = state.kind === 'done' ? state.fixes : [];
  const highCount = useMemo(() => fixes.filter((f) => f.confidence === 'high').length, [fixes]);
  const scanned = state.kind === 'done';
  const namingInProgress = naming.kind === 'running';

  return (
    <div className="main-panel">
      {!hasApiKey && (
        <div className="banner">
          AI naming needs a Gemini API key. Structural fixes work without it.
          <button className="link" onClick={onGoToSettings}>Add key</button>
        </div>
      )}

      <div className="scope-bar">
        <fieldset className="scope-fieldset">
          <legend className="visually-hidden">Scope</legend>
          {(['selection', 'page', 'file'] as Scope[]).map((s) => (
            <label key={s} className={`scope-option${scope === s ? ' active' : ''}`}>
              <input
                type="radio"
                name="scope"
                value={s}
                checked={scope === s}
                onChange={() => setScope(s)}
              />
              {scopeLabel(s)}
            </label>
          ))}
        </fieldset>

        <button
          className={scanned ? 'secondary' : 'primary'}
          onClick={runScan}
          disabled={state.kind === 'running' || applying}
        >
          {state.kind === 'running' ? 'Scanning…' : scanned ? 'Rescan' : 'Scan'}
        </button>
      </div>

      {state.kind === 'running' && (
        <div className="scan-skeleton" aria-label="Scanning…">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="skeleton-row">
              <div className="skeleton-check" />
              <div className="skeleton-label" style={{ width: `${55 + (i * 13) % 30}%` }} />
              <div className="skeleton-badge" />
            </div>
          ))}
        </div>
      )}

      {state.kind === 'done' && (
        <>
          <div className="scan-meta">
            <span className="scan-meta-count">{fixes.length} fixes</span>
            <span className="hint">
              {state.stats.framesScanned} frames · {state.stats.nodesWalked} nodes · {state.stats.durationMs}ms
            </span>
          </div>

          {naming.kind === 'running' && (
            <div className="naming-bar" role="status">
              Naming layers… {naming.processed}/{naming.total}
            </div>
          )}
          {naming.kind === 'fallback-no-key' && (
            <div className="naming-bar warning" role="status">
              No Gemini key — used content-based names ({naming.added} added).{' '}
              <button className="link" onClick={onGoToSettings}>Add key</button>
            </div>
          )}
          {naming.kind === 'fallback-api-error' && (
            <div className="naming-bar warning" role="status">
              {naming.errorMsg} — used content-based names instead ({naming.added} added).
            </div>
          )}
          {state.candidatesSkipped > 0 && (
            <div className="naming-bar warning" role="status">
              Skipped {state.candidatesSkipped} large / over-limit frame{state.candidatesSkipped === 1 ? '' : 's'} during naming.
            </div>
          )}

          <div className="fix-list-container">
            {fixes.length === 0 && !namingInProgress ? (
              <div className="empty">
                <h2>Looks clean!</h2>
                <p>No cleanup needed — layer names, spacing, and order all look good.</p>
              </div>
            ) : (
              <FixList
                fixes={fixes}
                checkedIds={checkedIds}
                onToggle={toggleFix}
                namingInProgress={namingInProgress}
              />
            )}
          </div>

          <footer className="action-footer">
            <button
              className="primary"
              disabled={applying || checkedIds.size === 0}
              onClick={applySelected}
            >
              {applying ? 'Applying…' : `Apply Selected (${checkedIds.size})`}
            </button>
            <button
              className="secondary"
              disabled={applying || highCount === 0}
              onClick={applyAllHighConfidence}
              title="Applies all High-confidence fixes regardless of your checkbox selection"
            >
              Apply High ({highCount})
            </button>
            {(fixes.length > 0 || namingInProgress) && (
              <button className="link discard-link" onClick={discard} disabled={applying}>
                Discard
              </button>
            )}
          </footer>
          <p className="footer-hint">⌘Z reverts all changes in one step.</p>
        </>
      )}

      {state.kind === 'applied' && (
        <>
          <div className="scan-meta">
            <span className="scan-meta-count applied-count">
              {state.appliedIds.size} applied
              {state.failedIds.size > 0 && (
                <span className="failed-count"> · {state.failedIds.size} failed</span>
              )}
            </span>
            <span className="hint">{state.fixes.length} total</span>
          </div>

          <div className="fix-list-container">
            <FixList
              fixes={state.fixes}
              checkedIds={new Set()}
              onToggle={() => {}}
              appliedIds={state.appliedIds}
              failedIds={state.failedIds}
            />
          </div>

          <footer className="action-footer">
            <button className="primary" onClick={runScan}>Scan again</button>
          </footer>
          <p className="footer-hint">⌘Z reverts all changes in one step.</p>
        </>
      )}

      {state.kind === 'error' && (
        <div className="error-box">
          <strong>Scan failed.</strong>
          <p>{state.message}</p>
          <button className="secondary" style={{ marginTop: 8 }} onClick={runScan}>
            Try again
          </button>
        </div>
      )}
    </div>
  );
}

function scopeLabel(scope: Scope): string {
  switch (scope) {
    case 'selection': return 'Selection';
    case 'page': return 'Page';
    case 'file': return 'File';
  }
}
