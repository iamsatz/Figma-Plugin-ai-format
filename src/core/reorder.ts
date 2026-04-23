import type { ChildSnapshot, LayoutMode } from './snapshot';

export function desiredChildOrder(
  children: ChildSnapshot[],
  layoutMode: LayoutMode,
): string[] {
  const sorted = [...children];
  if (layoutMode === 'VERTICAL') {
    sorted.sort((a, b) => a.y - b.y || a.x - b.x);
  } else if (layoutMode === 'HORIZONTAL') {
    sorted.sort((a, b) => a.x - b.x || a.y - b.y);
  } else {
    sorted.sort((a, b) => {
      const rowDelta = rowOf(a) - rowOf(b);
      if (rowDelta !== 0) return rowDelta;
      return a.x - b.x;
    });
  }
  return sorted.map((c) => c.id);
}

export function isAlreadyOrdered(
  current: ChildSnapshot[],
  desired: string[],
): boolean {
  if (current.length !== desired.length) return false;
  for (let i = 0; i < current.length; i++) {
    if (current[i].id !== desired[i]) return false;
  }
  return true;
}

// Snap Y to a rough row bucket so children on the same visual row sort left→right.
function rowOf(c: ChildSnapshot): number {
  const bucket = 8;
  return Math.round(c.y / bucket) * bucket;
}
