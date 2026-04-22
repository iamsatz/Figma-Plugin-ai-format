import { send } from './bridge';

type Props = {
  hasApiKey: boolean;
  onGoToSettings: () => void;
};

export function MainPanel({ hasApiKey, onGoToSettings }: Props) {
  return (
    <div className="empty">
      <h2>Ready when you are</h2>
      <p>
        Scan selected frames, preview structural fixes, then apply. Phase 1 scaffolding is live — the
        scan pipeline arrives in Phase 2.
      </p>
      {!hasApiKey && (
        <p>
          <button className="secondary" onClick={onGoToSettings}>
            Add Gemini API key
          </button>
        </p>
      )}
      <p>
        <button
          className="primary"
          onClick={() => {
            console.log('[layercraft] sending ping');
            send({ type: 'ping' });
          }}
        >
          Test bridge (ping)
        </button>
      </p>
    </div>
  );
}
