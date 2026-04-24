import { DEFAULT_SETTINGS, type Settings } from '../core/types';

const KEY = 'restructure.settings.v1';
const LEGACY_KEY = 'layercraft.settings.v1';

export async function getSettings(): Promise<Settings> {
  let stored = (await figma.clientStorage.getAsync(KEY)) as
    | (Partial<Settings> & { aiApiKey?: string })
    | undefined;
  // 'layercraft' → 'restructure' rename: fall back to the old key on first
  // load so any previously-saved API keys and settings survive. The first
  // saveSettings() call after this persists under the new key.
  if (!stored) {
    stored = (await figma.clientStorage.getAsync(LEGACY_KEY)) as
      | (Partial<Settings> & { aiApiKey?: string })
      | undefined;
  }
  const migrated: Partial<Settings> = { ...(stored ?? {}) };
  // v1 → v2: the single aiApiKey field moved to geminiApiKey when Claude
  // support landed. Copy once so an existing user's key is preserved.
  if (stored?.aiApiKey && !migrated.geminiApiKey) {
    migrated.geminiApiKey = stored.aiApiKey;
  }
  return { ...DEFAULT_SETTINGS, ...migrated };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await figma.clientStorage.setAsync(KEY, settings);
}
