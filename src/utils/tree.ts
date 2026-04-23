import type { TreeNode } from '../core/types';

// Keep tree under a sane size — 2MB of JSON is fine for Gemini Flash,
// but very deep trees produce noise without adding context.
const MAX_DEPTH = 6;
const MAX_TEXT_LEN = 80;

type TreeNodeInput = {
  id: string;
  type: string;
  name: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  characters?: string;
  children?: readonly TreeNodeInput[];
};

export function buildTree(node: TreeNodeInput, depth = 0): TreeNode {
  const out: TreeNode = {
    id: node.id,
    type: node.type,
    name: node.name,
    bbox: [
      Math.round(node.x ?? 0),
      Math.round(node.y ?? 0),
      Math.round(node.width ?? 0),
      Math.round(node.height ?? 0),
    ],
  };

  if (node.type === 'TEXT' && typeof node.characters === 'string') {
    const trimmed = node.characters.trim();
    if (trimmed) out.text = trimmed.slice(0, MAX_TEXT_LEN);
  }

  if (depth < MAX_DEPTH && node.children && node.children.length > 0) {
    out.children = node.children.map((c) => buildTree(c, depth + 1));
  }

  return out;
}
