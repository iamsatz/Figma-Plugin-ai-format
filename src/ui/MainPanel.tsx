import { useEffect, useState } from 'react';
import { send, subscribe } from './bridge';
import type { Fix, ScanStats, Scope } from '../core/types';

type Props = {
  hasApiKey: boolean;
  onGoToSettings: () => void;
};

type ScanState =
  | { kind: 'idle' }
  | { kind: 'running' }
  | { kind: 'done'; fixes: Fix[]; stats: ScanStats }
  | { kind: 'error'; message: string };

export function MainPanel({ hasApiKey, onGoToSettings }: Props) {
  const [scope, setScope] = useState<Scope>('selection');
  const [state, setState] = useState<ScanState>({ kind: 'idle' });
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    return subscribe((msg) => {
      if (msg.type === 'scan-result') {
        setState({ kind: 'done', fixes: msg.fixes, stats: msg.stats });
        console.log('[layercraft] scan result', msg.stats, msg.fixes);
      } else if (msg.type === 'apply-result') {
        setApplying(false);
        console.log('[layercraft] applied', msg);
      } else if (msg.type === 'error') {
        setState({ kind: 'error', message: msg.message });
        setApplying(false);
      }
    });
  }, []);

  function runScan() {
    setState({ kind: 'running' });
    send({ type: 'scan', scope });
  }

  function applyAllHighConfidence() {
    if (state.kind !== 'done') return;
    const high = state.fixes.filter((f) => f.confidence === 'high').map((f) => f.id);
    if (high.length === 0) return;
    setApplying(true);
    send({ type: 'apply', fixIds: high });
  }

  return (
    <div>
      {!hasApiKey && (
        <div className="banner">
          AI naming needs a Gemini API key (Phase 4). You can still run structural fixes without it.
          <button className="link" onClick={onGoToSettings}>Add key</button>
        </div>
      )}

      <div className="field">
        <label>Scope</label>
        <div className="scope">
          <label>
            <input
              type="radio"
              name="scope"
              checked={scope === 'selection'}
              onChange={() => setScope('selection')}
            />
            Selected frames
          </label>
          <label>
            <input
              type="radio"
              name="scope"
              checked={scope === 'page'}
              onChange={() => setScope('page')}
            />
            Current page
          </label>
          <label>
            <input
              type="radio"
              name="scope"
              checked={scope === 'file'}
              onChange={() => setScope('file')}
            />
            Entire file
          </label>
        </div>
      </div>

      <div className="actions-inline">
        <button
          className="primary"
          onClick={runScan}
          disabled={state.kind === 'running'}
        >
          {state.kind === 'running' ? 'Scanning...' : 'Scan'}
        </button>
      </div>

      {state.kind === 'done' && (
        <div className="scan-summary">
          <h3>{state.fixes.length} fixes found</h3>
          <p className="hint">
            {state.stats.framesScanned} frames / {state.stats.nodesWalked} nodes /{' '}
            {state.stats.durationMs}ms
          </p>
          <ul className="count-list">
            <li>Auto Layout: {count(state.fixes, 'autolayout')}</li>
            <li>Spacing: {count(state.fixes, 'spacing')}</li>
            <li>Reorder: {count(state.fixes, 'reorder')}</li>
          </ul>
          <p className="hint">
            Open the UI devtools console to inspect the raw fix list. Full preview UI lands in Phase 3.
          </p>
          <button
            className="primary"
            disabled={applying || countConfidence(state.fixes, 'high') === 0}
            onClick={applyAllHighConfidence}
          >
            {applying
              ? 'Applying...'
              : `Apply ${countConfidence(state.fixes, 'high')} High-confidence fixes`}
          </button>
        </div>
      )}

      {state.kind === 'error' && (
        <div className="error-box">
          <strong>Scan failed.</strong>
          <p>{state.message}</p>
        </div>
      )}
    </div>
  );
}

function count(fixes: Fix[], type: Fix['type']): number {
  return fixes.filter((f) => f.type === type).length;
}

function countConfidence(fixes: Fix[], confidence: Fix['confidence']): number {
  return fixes.filter((f) => f.confidence === confidence).length;
}
