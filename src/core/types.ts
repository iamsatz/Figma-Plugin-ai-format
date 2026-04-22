export type AiProvider = 'gemini-2.5-flash';

export type Settings = {
  gridPx: number;
  tokens?: Record<string, number>;
  aiProvider: AiProvider;
  aiApiKey: string;
  ignorePatterns: string[];
  confidenceThreshold: number;
};

export const DEFAULT_SETTINGS: Settings = {
  gridPx: 8,
  tokens: undefined,
  aiProvider: 'gemini-2.5-flash',
  aiApiKey: '',
  ignorePatterns: ['^_'],
  confidenceThreshold: 0.7,
};

export type Confidence = 'high' | 'medium' | 'review';

export type RenameFix = {
  id: string;
  nodeId: string;
  type: 'rename';
  oldName: string;
  newName: string;
  confidence: Confidence;
};

export type AutoLayoutFix = {
  id: string;
  nodeId: string;
  type: 'autolayout';
  direction: 'VERTICAL' | 'HORIZONTAL';
  itemSpacing: number;
  padding: [number, number, number, number];
  confidence: Confidence;
};

export type SpacingFix = {
  id: string;
  nodeId: string;
  type: 'spacing';
  field: 'itemSpacing' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft';
  oldValue: number;
  newValue: number;
  confidence: 'high';
};

export type ReorderFix = {
  id: string;
  nodeId: string;
  type: 'reorder';
  newChildOrder: string[];
  confidence: 'high';
};

export type Fix = RenameFix | AutoLayoutFix | SpacingFix | ReorderFix;

export type Scope = 'selection' | 'page' | 'file';

export type UiToPluginMessage =
  | { type: 'ping' }
  | { type: 'get-settings' }
  | { type: 'save-settings'; payload: Settings };

export type PluginToUiMessage =
  | { type: 'pong' }
  | { type: 'settings'; payload: Settings }
  | { type: 'settings-saved' }
  | { type: 'error'; message: string };
