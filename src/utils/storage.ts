import { DEFAULT_SETTINGS, type Settings } from '../core/types';

const KEY = 'layercraft.settings.v1';

export async function getSettings(): Promise<Settings> {
  const stored = (await figma.clientStorage.getAsync(KEY)) as
    | (Partial<Settings> & { aiApiKey?: string })
    | undefined;
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
