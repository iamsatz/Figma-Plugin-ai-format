import type { TreeNode } from '../../core/types';

// Matches Figma's default placeholder names — "Frame 47", "Group 12",
// "Rectangle", "Ellipse 3", etc. These should be renamed by AI or fallback.
const PLACEHOLDER_RE =
  /^(Frame|Group|Rectangle|Ellipse|Vector|Line|Polygon|Star|Component|Instance|Text)(\s+\d+)?$/;

function isPlaceholderName(name: string): boolean {
  return PLACEHOLDER_RE.test(name.trim());
}

function sanitizeWord(word: string): string {
  const cleaned = word.replace(/[^A-Za-z0-9]/g, '');
  if (!cleaned) return '';
  return cleaned[0].toUpperCase() + cleaned.slice(1).toLowerCase();
}

function textToContext(text: string | undefined): string | null {
  if (!text) return null;
  const words = text.trim().split(/\s+/).slice(0, 2).map(sanitizeWord).filter(Boolean);
  if (words.length === 0) return null;
  return words.join('');
}

function baseTypeFor(node: TreeNode): string {
  switch (node.type) {
    case 'TEXT':
      return 'Label';
    case 'FRAME':
      return 'Container';
    case 'GROUP':
      return 'Stack';
    case 'COMPONENT':
    case 'COMPONENT_SET':
      return 'Component';
    case 'INSTANCE':
      return 'Instance';
    case 'RECTANGLE':
    case 'ELLIPSE':
    case 'VECTOR':
    case 'POLYGON':
    case 'STAR':
      return 'Shape';
    case 'LINE':
      return 'Divider';
    case 'SECTION':
      return 'Section';
    default:
      return 'Layer';
  }
}

// Pick context from visible text in this subtree (for containers) or own text.
function findContext(node: TreeNode): string | null {
  const own = textToContext(node.text);
  if (own) return own;
  if (node.children) {
    for (const child of node.children) {
      const c = findContext(child);
      if (c) return c;
    }
  }
  return null;
}

function proposeName(node: TreeNode): string | null {
  if (!isPlaceholderName(node.name)) return null;
  const type = baseTypeFor(node);
  const context = findContext(node);
  return context ? `${type}_${context}` : type;
}

export function fallbackNames(tree: TreeNode): Record<string, string> {
  const out: Record<string, string> = {};
  const walk = (node: TreeNode) => {
    const proposed = proposeName(node);
    if (proposed && proposed !== node.name) out[node.id] = proposed;
    if (node.children) node.children.forEach(walk);
  };
  walk(tree);
  return out;
}
