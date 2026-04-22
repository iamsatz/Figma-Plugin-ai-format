import { DEFAULT_SETTINGS, type Settings } from '../core/types';

const KEY = 'layercraft.settings.v1';

export async function getSettings(): Promise<Settings> {
  const stored = (await figma.clientStorage.getAsync(KEY)) as Partial<Settings> | undefined;
  return { ...DEFAULT_SETTINGS, ...(stored ?? {}) };
}

export async function saveSettings(settings: Settings): Promise<void> {
  await figma.clientStorage.setAsync(KEY, settings);
}
