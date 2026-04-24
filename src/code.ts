import type { Fix, PluginToUiMessage, RenameFix, UiToPluginMessage } from './core/types';
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
        console.log('[restructure] scan', result.stats, result.fixes.length, 'fixes,', result.renameCandidates.length, 'rename candidates');
        send({
          type: 'scan-result',
          fixes: result.fixes,
          stats: result.stats,
          renameCandidates: result.renameCandidates,
          candidatesSkipped: result.candidatesSkipped,
        });
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
        figma.notify(`${result.applied.length} fixes applied. Cmd+Z to undo.`);
        send({ type: 'apply-result', applied: result.applied, failed: result.failed });
        return;
      }
      case 'jump-to-node': {
        const node = await figma.getNodeByIdAsync(msg.nodeId);
        if (node && 'type' in node && node.type !== 'DOCUMENT' && node.type !== 'PAGE') {
          const scene = node as SceneNode;
          figma.currentPage.selection = [scene];
          figma.viewport.scrollAndZoomIntoView([scene]);
        }
        return;
      }
      case 'rename-results': {
        const fixes = await renameResultsToFixes(msg.names, new Set(msg.fallbackIds));
        for (const f of fixes) lastFixesById.set(f.id, f);
        send({ type: 'rename-fixes', fixes });
        return;
      }
      case 'insert-svg': {
        try {
          const node = figma.createNodeFromSvg(msg.svg);
          node.name = msg.name;
          const center = figma.viewport.center;
          node.x = Math.round(center.x - node.width / 2);
          node.y = Math.round(center.y - node.height / 2);
          figma.currentPage.appendChild(node);
          figma.currentPage.selection = [node];
          figma.viewport.scrollAndZoomIntoView([node]);
          figma.notify(`Inserted ${msg.name}`);
          send({ type: 'insert-svg-result', nodeId: node.id });
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err);
          send({ type: 'insert-svg-result', nodeId: null, error: message });
        }
        return;
      }
    }
  } catch (err) {
    send({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  }
};

async function renameResultsToFixes(
  names: Record<string, string>,
  fallbackIds: Set<string>,
): Promise<RenameFix[]> {
  const out: RenameFix[] = [];
  for (const [nodeId, rawName] of Object.entries(names)) {
    const newName = rawName.trim();
    if (!newName) continue;
    const node = await figma.getNodeByIdAsync(nodeId);
    if (!node || node.type === 'DOCUMENT' || node.type === 'PAGE') continue;
    if ('locked' in node && node.locked) continue;
    if (node.name === newName) continue;
    out.push({
      id: `rename:${nodeId}`,
      nodeId,
      nodeName: node.name,
      type: 'rename',
      oldName: node.name,
      newName,
      // Fallback names are deterministic but shallow — keep them unchecked-by-
      // default in the 'Apply High' bulk path so users review before applying.
      confidence: fallbackIds.has(nodeId) ? 'medium' : 'high',
    });
  }
  return out;
}
