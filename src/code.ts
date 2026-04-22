import type { PluginToUiMessage, UiToPluginMessage } from './core/types';
import { getSettings, saveSettings } from './utils/storage';

figma.showUI(__html__, { width: 400, height: 640, themeColors: true });

function send(msg: PluginToUiMessage): void {
  figma.ui.postMessage(msg);
}

figma.ui.onmessage = async (msg: UiToPluginMessage) => {
  try {
    switch (msg.type) {
      case 'ping':
        send({ type: 'pong' });
        return;
      case 'get-settings':
        send({ type: 'settings', payload: await getSettings() });
        return;
      case 'save-settings':
        await saveSettings(msg.payload);
        send({ type: 'settings-saved' });
        return;
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
