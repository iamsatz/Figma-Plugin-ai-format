import { useMemo, useState } from 'react';
import type { AiProvider, Settings } from '../core/types';

type Props = {
  settings: Settings;
  onSave: (next: Settings) => void;
};

export function SettingsPanel({ settings, onSave }: Props) {
  const [gridPx, setGridPx] = useState(String(settings.gridPx));
  const [tokensText, setTokensText] = useState(
    settings.tokens ? JSON.stringify(settings.tokens, null, 2) : '',
  );
  const [aiProvider, setAiProvider] = useState<AiProvider>(settings.aiProvider);
  const [geminiApiKey, setGeminiApiKey] = useState(settings.geminiApiKey);
  const [claudeApiKey, setClaudeApiKey] = useState(settings.claudeApiKey);
  const [ignoreText, setIgnoreText] = useState(settings.ignorePatterns.join('\n'));
  const [thresholdText, setThresholdText] = useState(String(settings.confidenceThreshold));

  const gridError = useMemo(() => parseGrid(gridPx).error, [gridPx]);
  const tokensError = useMemo(() => parseTokens(tokensText).error, [tokensText]);
  const thresholdError = useMemo(() => parseThreshold(thresholdText).error, [thresholdText]);

  const canSave = !gridError && !tokensError && !thresholdError;

  function handleSave() {
    if (!canSave) return;
    const grid = parseGrid(gridPx).value!;
    const tokens = parseTokens(tokensText).value;
    const threshold = parseThreshold(thresholdText).value!;
    const ignorePatterns = ignoreText
      .split('\n')
      .map((s) => s.trim())
      .filter(Boolean);

    onSave({
      ...settings,
      gridPx: grid,
      tokens,
      aiProvider,
      geminiApiKey: geminiApiKey.trim(),
      claudeApiKey: claudeApiKey.trim(),
      ignorePatterns,
      confidenceThreshold: threshold,
    });
  }

  return (
    <div>
      <div className="field">
        <label htmlFor="provider">AI provider</label>
        <select
          id="provider"
          value={aiProvider}
          onChange={(e) => setAiProvider(e.target.value as AiProvider)}
        >
          <option value="gemini">Gemini 2.5 Flash</option>
          <option value="claude">Claude Haiku 4.5</option>
        </select>
        <span className="hint">Used for layer naming and icon suggestions.</span>
      </div>

      <div className={`field${aiProvider !== 'gemini' ? ' inactive' : ''}`}>
        <label htmlFor="gemini-key">Gemini API key</label>
        <input
          id="gemini-key"
          type="password"
          placeholder="AIza..."
          value={geminiApiKey}
          onChange={(e) => setGeminiApiKey(e.target.value)}
          autoComplete="off"
        />
        <span className="hint">
          Get one at <em>aistudio.google.com/app/apikey</em>. Stored locally in figma.clientStorage.
        </span>
      </div>

      <div className={`field${aiProvider !== 'claude' ? ' inactive' : ''}`}>
        <label htmlFor="claude-key">Claude API key</label>
        <input
          id="claude-key"
          type="password"
          placeholder="sk-ant-..."
          value={claudeApiKey}
          onChange={(e) => setClaudeApiKey(e.target.value)}
          autoComplete="off"
        />
        <span className="hint">
          Get one at <em>console.anthropic.com</em>.
        </span>
      </div>

      <div className="field">
        <label htmlFor="grid">Grid (px)</label>
        <input
          id="grid"
          type="number"
          min={1}
          value={gridPx}
          onChange={(e) => setGridPx(e.target.value)}
        />
        <span className="hint">Spacing will snap to multiples of this value when no tokens are set.</span>
        {gridError && <span className="error">{gridError}</span>}
      </div>

      <div className="field">
        <label htmlFor="tokens">Spacing tokens (JSON, optional)</label>
        <textarea
          id="tokens"
          placeholder='{ "xs": 4, "sm": 8, "md": 16 }'
          value={tokensText}
          onChange={(e) => setTokensText(e.target.value)}
        />
        <span className="hint">If set, spacing snaps to the nearest token value instead of grid multiples.</span>
        {tokensError && <span className="error">{tokensError}</span>}
      </div>

      <div className="field">
        <label htmlFor="ignore">Ignore patterns (one regex per line)</label>
        <textarea
          id="ignore"
          value={ignoreText}
          onChange={(e) => setIgnoreText(e.target.value)}
        />
        <span className="hint">Layers whose names match any pattern are skipped. Locked layers are also skipped.</span>
      </div>

      <div className="field">
        <label htmlFor="threshold">Confidence threshold (0–1)</label>
        <input
          id="threshold"
          type="number"
          min={0}
          max={1}
          step={0.05}
          value={thresholdText}
          onChange={(e) => setThresholdText(e.target.value)}
        />
        <span className="hint">Below this score, fixes are flagged as Review and left unchecked.</span>
        {thresholdError && <span className="error">{thresholdError}</span>}
      </div>

      <div className="actions">
        <button className="primary" disabled={!canSave} onClick={handleSave}>
          Save
        </button>
      </div>
    </div>
  );
}

function parseGrid(raw: string): { value?: number; error?: string } {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return { error: 'Must be a positive number' };
  return { value: n };
}

function parseThreshold(raw: string): { value?: number; error?: string } {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > 1) return { error: 'Must be between 0 and 1' };
  return { value: n };
}

function parseTokens(raw: string): { value?: Record<string, number>; error?: string } {
  const trimmed = raw.trim();
  if (!trimmed) return { value: undefined };
  try {
    const parsed = JSON.parse(trimmed);
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return { error: 'Must be a JSON object' };
    }
    const out: Record<string, number> = {};
    for (const [k, v] of Object.entries(parsed)) {
      if (typeof v !== 'number' || !Number.isFinite(v)) {
        return { error: `Token "${k}" must be a number` };
      }
      out[k] = v;
    }
    return { value: out };
  } catch {
    return { error: 'Invalid JSON' };
  }
}
