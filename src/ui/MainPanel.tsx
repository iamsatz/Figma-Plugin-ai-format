import { useEffect, useMemo, useState } from 'react';
import { send, subscribe } from './bridge';
import { FixList } from './FixList';
import type { Fix, ScanStats, Scope } from '../core/types';

type Props = {
  hasApiKey: boolean;
  onGoToSettings: () => void;
};

type ScanState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; fixes: Fix[]; stats: ScanStats }
  | { kind: 'applied'; applied: number; failed: number; totalFixes: number }
  | { kind: 'error'; message: string };

// 'review' items are unchecked by default; all others are pre-checked.
function defaultChecked(fixes: Fix[]): Set<string> {
  return new Set(fixes.filter((f) => f.confidence !== 'review').map((f) => f.id));
}

export function MainPanel({ hasApiKey, onGoToSettings }: Props) {
  const [scope, setScopeRaw] = useState<Scope>('selection');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'scan-result') {
        setState({ kind: 'done', fixes: msg.fixes, stats: msg.stats });
        setCheckedIds(defaultChecked(msg.fixes));
      } else if (msg.type === 'apply-result') {
        setApplying(false);
        setState((prev) => ({
          kind: 'applied',
          applied: msg.applied,
          failed: msg.failed,
          totalFixes: prev.kind === 'done' ? prev.fixes.length : 0,
        }));
      } else if (msg.type === 'error') {
        setState({ kind: 'error', message: msg.message });
        setApplying(false);
      }
    });
  }, []);

  function setScope(next: Scope) {
    if (next === scope) return;
    setScopeRaw(next);
    if (state.kind !== 'idle' && state.kind !== 'running') {
      setState({ kind: 'idle' });
      setCheckedIds(new Set());
    }
  }

  function runScan() {
    setState({ kind: 'running' });
    setCheckedIds(new Set());
    send({ type: 'scan', scope });
  }

  function discard() {
    setState({ kind: 'idle' });
    setCheckedIds(new Set());
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

  return (
    <div className="main-panel">
      {!hasApiKey && (
        <div className="banner">
          AI naming needs a Gemini API key (Phase 4). Structural fixes work without it.
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
          disabled={state.kind === 'running'}
        >
          {state.kind === 'running' ? 'Scanning…' : scanned ? 'Rescan' : 'Scan'}
        </button>
      </div>

      {state.kind === 'done' && (
        <>
          <div className="scan-meta">
            <span className="scan-meta-count">{fixes.length} fixes</span>
            <span className="hint">
              {state.stats.framesScanned} frames · {state.stats.nodesWalked} nodes · {state.stats.durationMs}ms
            </span>
          </div>

          <div className="fix-list-container">
            <FixList fixes={fixes} checkedIds={checkedIds} onToggle={toggleFix} />
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
            <button className="link discard-link" onClick={discard} disabled={applying}>
              Discard
            </button>
          </footer>
          <p className="footer-hint">⌘Z reverts all changes in one step.</p>
        </>
      )}

      {state.kind === 'applied' && (
        <div className="scan-summary applied">
          <h3>
            {state.applied} applied
            {state.failed > 0 ? ` · ${state.failed} failed` : ''}
            {` of ${state.totalFixes} found`}
          </h3>
          <p className="hint">⌘Z reverts all changes in one step.</p>
          <button className="secondary" style={{ marginTop: 8 }} onClick={runScan}>
            Scan again
          </button>
        </div>
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
