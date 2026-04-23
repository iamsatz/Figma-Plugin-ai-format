import type { Fix, PluginToUiMessage, UiToPluginMessage } from './core/types';
import { getSettings, saveSettings } from './utils/storage';
import { scan } from './core/scan';
import { applyFixes } from './core/apply';

figma.showUI(__html__, { width: 400, height: 640, themeColors: true });

function send(msg: PluginToUiMessage): void {
  figma.ui.postMessage(msg);
}

let lastFixesById = new Map<string, Fix>();

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
      case 'scan': {
        const settings = await getSettings();
        send({ type: 'scan-progress', phase: 'walking' });
        const result = await scan(msg.scope, settings);
        lastFixesById = new Map(result.fixes.map((f) => [f.id, f]));
        console.log('[layercraft] scan', result.stats, result.fixes);
        send({ type: 'scan-result', fixes: result.fixes, stats: result.stats });
        send({ type: 'scan-progress', phase: 'done' });
        return;
      }
      case 'apply': {
        const toApply: Fix[] = [];
        for (const id of msg.fixIds) {
          const f = lastFixesById.get(id);
          if (f) toApply.push(f);
        }
        const result = await applyFixes(toApply);
        figma.notify(`${result.applied} fixes applied. Cmd+Z to undo.`);
        send({ type: 'apply-result', applied: result.applied, failed: result.failed });
        return;
      }
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};
