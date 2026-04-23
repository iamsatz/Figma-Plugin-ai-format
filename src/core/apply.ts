import type { AutoLayoutFix, Fix, ReorderFix, SpacingFix } from './types';

export type ApplyResult = { applied: number; failed: number };

export async function applyFixes(fixes: Fix[]): Promise<ApplyResult> {
  let applied = 0;
  let failed = 0;

  // Apply in a stable order so AL conversion happens before spacing/reorder
  // on the same node, and reorder happens after children have their final parent.
  const ordered = [...fixes].sort((a, b) => rank(a.type) - rank(b.type));

  for (const fix of ordered) {
    try {
      switch (fix.type) {
        case 'autolayout':
          await applyAutoLayout(fix);
          break;
        case 'spacing':
          await applySpacing(fix);
          break;
        case 'reorder':
          await applyReorder(fix);
          break;
        case 'rename':
          await applyRename(fix.nodeId, fix.newName);
          break;
      }
      applied++;
    } catch (err) {
      failed++;
      console.warn('[layercraft] failed to apply fix', fix.id, err);
    }
  }

  return { applied, failed };
}

function rank(type: Fix['type']): number {
  switch (type) {
    case 'autolayout':
      return 0;
    case 'spacing':
      return 1;
    case 'reorder':
      return 2;
    case 'rename':
      return 3;
  }
}

async function applyAutoLayout(fix: AutoLayoutFix): Promise<void> {
  const node = await figma.getNodeByIdAsync(fix.nodeId);
  if (!node || !isContainer(node)) throw new Error('node-missing');
  const frame = await ensureFrame(node);
  if (!frame) throw new Error('not-framable');
  frame.layoutMode = fix.direction;
  frame.itemSpacing = fix.itemSpacing;
  frame.paddingTop = fix.padding[0];
  frame.paddingRight = fix.padding[1];
  frame.paddingBottom = fix.padding[2];
  frame.paddingLeft = fix.padding[3];
  frame.primaryAxisSizingMode = 'AUTO';
  frame.counterAxisSizingMode = 'AUTO';
}

async function applySpacing(fix: SpacingFix): Promise<void> {
  const node = await figma.getNodeByIdAsync(fix.nodeId);
  if (!node || !isFrameWithAutoLayout(node)) throw new Error('node-missing');
  (node as unknown as Record<string, number>)[fix.field] = fix.newValue;
}

async function applyReorder(fix: ReorderFix): Promise<void> {
  const node = await figma.getNodeByIdAsync(fix.nodeId);
  if (!node || !('children' in node) || !('insertChild' in node)) {
    throw new Error('node-missing');
  }
  const parent = node as ChildrenMixin & { insertChild: (i: number, c: SceneNode) => void };
  const byId = new Map<string, SceneNode>();
  for (const child of parent.children) byId.set(child.id, child);

  fix.newChildOrder.forEach((id, index) => {
    const child = byId.get(id);
    if (child) parent.insertChild(index, child);
  });
}

async function applyRename(nodeId: string, newName: string): Promise<void> {
  const node = await figma.getNodeByIdAsync(nodeId);
  if (!node) throw new Error('node-missing');
  node.name = newName;
}

function isContainer(node: BaseNode): node is SceneNode & ChildrenMixin {
  return 'children' in node;
}

function isFrameWithAutoLayout(node: BaseNode): boolean {
  return (
    'layoutMode' in node &&
    (node as FrameNode).layoutMode !== 'NONE' &&
    'itemSpacing' in node
  );
}

async function ensureFrame(node: SceneNode & ChildrenMixin): Promise<FrameNode | null> {
  if (node.type === 'FRAME' || node.type === 'COMPONENT' || node.type === 'INSTANCE') {
    return node as FrameNode;
  }
  if (node.type === 'GROUP') {
    // Group → Frame conversion so AL properties are settable.
    const group = node as GroupNode;
    const parent = group.parent;
    if (!parent || !('appendChild' in parent)) return null;
    const frame = figma.createFrame();
    frame.name = group.name;
    frame.x = group.x;
    frame.y = group.y;
    frame.resize(group.width, group.height);
    frame.fills = [];
    frame.clipsContent = false;
    const insertionIndex = (parent as ChildrenMixin).children.indexOf(group);
    (parent as BaseNode & ChildrenMixin & { insertChild: (i: number, c: SceneNode) => void }).insertChild(
      insertionIndex,
      frame,
    );
    const kids = [...group.children];
    for (const child of kids) frame.appendChild(child);
    group.remove();
    return frame;
  }
  return null;
}
