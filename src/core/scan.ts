import type { Fix, Scope, ScanStats, Settings } from './types';
import type { FrameSnapshot, LayoutMode } from './snapshot';
import { inferAutoLayout } from './infer-autolayout';
import { snapValue, type SnapConfig } from './snap-spacing';
import { desiredChildOrder, isAlreadyOrdered } from './reorder';

export type ScanResult = { fixes: Fix[]; stats: ScanStats };

const CONTAINER_TYPES = new Set<NodeType>([
  'FRAME',
  'GROUP',
  'COMPONENT',
  'COMPONENT_SET',
  'INSTANCE',
  'SECTION',
]);

export async function scan(scope: Scope, settings: Settings): Promise<ScanResult> {
  const started = Date.now();
  const roots = collectRoots(scope);
  const snap: SnapConfig = { gridPx: settings.gridPx, tokens: settings.tokens };
  const ignore = compileIgnore(settings.ignorePatterns);

  const fixes: Fix[] = [];
  let framesScanned = 0;
  let nodesWalked = 0;

  for (const root of roots) {
    walk(root, (node) => {
      nodesWalked++;
      if (!CONTAINER_TYPES.has(node.type)) return;
      if (isSkipped(node, ignore)) return;
      framesScanned++;
      collectFixesForContainer(node, snap, fixes);
    });
  }

  return {
    fixes,
    stats: { framesScanned, nodesWalked, durationMs: Date.now() - started },
  };
}

function collectRoots(scope: Scope): readonly SceneNode[] {
  if (scope === 'selection') {
    return figma.currentPage.selection;
  }
  if (scope === 'page') {
    return figma.currentPage.children;
  }
  const out: SceneNode[] = [];
  for (const page of figma.root.children) {
    for (const child of page.children) out.push(child);
  }
  return out;
}

function walk(node: SceneNode, visit: (n: SceneNode) => void) {
  visit(node);
  if ('children' in node) {
    for (const child of node.children) walk(child, visit);
  }
}

function isSkipped(node: SceneNode, ignore: RegExp[]): boolean {
  if ('locked' in node && node.locked) return true;
  for (const re of ignore) if (re.test(node.name)) return true;
  return false;
}

function compileIgnore(patterns: string[]): RegExp[] {
  const out: RegExp[] = [];
  for (const raw of patterns) {
    try {
      out.push(new RegExp(raw));
    } catch {
      // swallow invalid regex silently — bad pattern drops rather than crashes
    }
  }
  return out;
}

function collectFixesForContainer(
  node: SceneNode,
  snap: SnapConfig,
  fixes: Fix[],
): void {
  const snapshot = toSnapshot(node);
  if (!snapshot) return;

  const mode: LayoutMode =
    snapshot.layoutMode === 'HORIZONTAL' || snapshot.layoutMode === 'VERTICAL'
      ? snapshot.layoutMode
      : 'NONE';

  if (mode === 'NONE') {
    const inferred = inferAutoLayout(snapshot, snap);
    if (inferred) {
      fixes.push({
        id: `al:${snapshot.id}`,
        nodeId: snapshot.id,
        nodeName: snapshot.name,
        type: 'autolayout',
        direction: inferred.direction,
        itemSpacing: inferred.itemSpacing,
        padding: inferred.padding,
        confidence: inferred.confidence,
      });
    }
  } else {
    pushSpacingFixIfNeeded(snapshot.id, snapshot.name, 'itemSpacing', snapshot.itemSpacing, snapValue(snapshot.itemSpacing, snap), fixes);
    pushSpacingFixIfNeeded(snapshot.id, snapshot.name, 'paddingTop', snapshot.paddingTop, snapValue(snapshot.paddingTop, snap), fixes);
    pushSpacingFixIfNeeded(snapshot.id, snapshot.name, 'paddingRight', snapshot.paddingRight, snapValue(snapshot.paddingRight, snap), fixes);
    pushSpacingFixIfNeeded(snapshot.id, snapshot.name, 'paddingBottom', snapshot.paddingBottom, snapValue(snapshot.paddingBottom, snap), fixes);
    pushSpacingFixIfNeeded(snapshot.id, snapshot.name, 'paddingLeft', snapshot.paddingLeft, snapValue(snapshot.paddingLeft, snap), fixes);
  }

  if (snapshot.children.length >= 2) {
    const desired = desiredChildOrder(snapshot.children, mode);
    if (!isAlreadyOrdered(snapshot.children, desired)) {
      // In AL frames child order == layout order (safe to sort).
      // In NONE-mode frames child order == z-order; sorting could restack
      // overlapping elements visually, so demote to 'medium'.
      fixes.push({
        id: `order:${snapshot.id}`,
        nodeId: snapshot.id,
        nodeName: snapshot.name,
        type: 'reorder',
        newChildOrder: desired,
        confidence: mode === 'NONE' ? 'medium' : 'high',
      });
    }
  }
}

function pushSpacingFixIfNeeded(
  nodeId: string,
  nodeName: string,
  field: 'itemSpacing' | 'paddingTop' | 'paddingRight' | 'paddingBottom' | 'paddingLeft',
  current: number,
  next: number,
  fixes: Fix[],
): void {
  if (Math.abs(current - next) < 0.5) return;
  fixes.push({
    id: `spacing:${nodeId}:${field}`,
    nodeId,
    nodeName,
    type: 'spacing',
    field,
    oldValue: current,
    newValue: next,
    confidence: 'high',
  });
}

function toSnapshot(node: SceneNode): FrameSnapshot | null {
  if (!('children' in node)) return null;
  const children = node.children.map((c) => ({
    id: c.id,
    name: c.name,
    x: c.x,
    y: c.y,
    width: c.width,
    height: c.height,
  }));

  const layoutMode: LayoutMode = 'layoutMode' in node ? (node.layoutMode as LayoutMode) : 'NONE';
  const hasAlProps = 'itemSpacing' in node;
  const type: FrameSnapshot['type'] =
    node.type === 'FRAME' || node.type === 'GROUP' || node.type === 'COMPONENT' || node.type === 'INSTANCE'
      ? node.type
      : 'OTHER';

  return {
    id: node.id,
    name: node.name,
    type,
    locked: 'locked' in node ? node.locked : false,
    x: node.x,
    y: node.y,
    width: 'width' in node ? node.width : 0,
    height: 'height' in node ? node.height : 0,
    layoutMode,
    itemSpacing: hasAlProps ? (node as FrameNode).itemSpacing : 0,
    paddingTop: hasAlProps ? (node as FrameNode).paddingTop : 0,
    paddingRight: hasAlProps ? (node as FrameNode).paddingRight : 0,
    paddingBottom: hasAlProps ? (node as FrameNode).paddingBottom : 0,
    paddingLeft: hasAlProps ? (node as FrameNode).paddingLeft : 0,
    children,
  };
}
