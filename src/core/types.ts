export type AiProvider = 'gemini' | 'claude';

export type Settings = {
  gridPx: number;
  tokens?: Record<string, number>;
  aiProvider: AiProvider;
  geminiApiKey: string;
  claudeApiKey: string;
  ignorePatterns: string[];
  confidenceThreshold: number;
};

export const DEFAULT_SETTINGS: Settings = {
  gridPx: 8,
  tokens: undefined,
  aiProvider: 'gemini',
  geminiApiKey: '',
  claudeApiKey: '',
  ignorePatterns: ['^_'],
  confidenceThreshold: 0.7,
};

export type Confidence = 'high' | 'medium' | 'review';

export type RenameFix = {
  id: string;
  nodeId: string;
  nodeName: string;
  type: 'rename';
  oldName: string;
  newName: string;
  confidence: Confidence;
};

export type AutoLayoutFix = {
  id: string;
  nodeId: string;
  nodeName: string;
  type: 'autolayout';
  direction: 'VERTICAL' | 'HORIZONTAL';
  itemSpacing: number;
  padding: [number, number, number, number];
  confidence: Confidence;
};

export type SpacingFix = {
  id: string;
  nodeId: string;
  nodeName: string;
  type: 'spacing';
  field: 'itemSpacing' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';
  oldValue: number;
  newValue: number;
  confidence: 'high';
};

export type ReorderFix = {
  id: string;
  nodeId: string;
  nodeName: string;
  type: 'reorder';
  newChildOrder: string[];
  confidence: 'high' | 'medium';
};

export type Fix = RenameFix | AutoLayoutFix | SpacingFix | ReorderFix;

export type Scope = 'selection' | 'page' | 'file';

export type LayoutHint = 'auto' | 'vertical' | 'horizontal' | 'grid' | 'card' | 'form';

export type ScanStats = {
  framesScanned: number;
  nodesWalked: number;
  durationMs: number;
};

export type TreeNode = {
  id: string;
  type: string;
  name: string;
  text?: string;
  bbox: [number, number, number, number]; // [x, y, width, height]
  children?: TreeNode[];
};

export type RenameCandidate = {
  rootId: string;
  rootName: string;
  pngBase64: string;
  tree: TreeNode;
};

export type UiToPluginMessage =
  | { type: 'ping' }
  | { type: 'get-settings' }
  | { type: 'save-settings'; payload: Settings }
  | { type: 'scan'; scope: Scope; layoutHint: LayoutHint }
  | { type: 'apply'; fixIds: string[] }
  | { type: 'jump-to-node'; nodeId: string }
  | {
      type: 'rename-results';
      names: Record<string, string>;
      fallbackIds: string[];
    }
  | { type: 'insert-svg'; svg: string; name: string };

export type PluginToUiMessage =
  | { type: 'pong' }
  | { type: 'settings'; payload: Settings }
  | { type: 'settings-saved' }
  | { type: 'scan-progress'; phase: 'walking' | 'analyzing' | 'done'; message?: string }
  | {
      type: 'scan-result';
      fixes: Fix[];
      stats: ScanStats;
      renameCandidates: RenameCandidate[];
      candidatesSkipped: number;
    }
  | { type: 'rename-fixes'; fixes: RenameFix[] }
  | { type: 'apply-result'; applied: string[]; failed: string[] }
  | { type: 'insert-svg-result'; nodeId: string | null; error?: string }
  | { type: 'error'; message: string };
