import type { ChildSnapshot, FrameSnapshot } from './snapshot';
import { snapValue, type SnapConfig } from './snap-spacing';

export type AutoLayoutInference = {
  direction: 'VERTICAL' | 'HORIZONTAL';
  itemSpacing: number;
  padding: [number, number, number, number]; // [top, right, bottom, left]
  confidence: 'high' | 'medium' | 'review';
};

const VERTICAL_RATIO = 1.5;
const HORIZONTAL_RATIO = 1 / VERTICAL_RATIO;

export function inferAutoLayout(
  frame: FrameSnapshot,
  snap: SnapConfig,
): AutoLayoutInference | null {
  if (frame.children.length < 2) return null;
  if (frame.layoutMode !== 'NONE') return null;

  const kids = frame.children;
  const minY = Math.min(...kids.map((c) => c.y));
  const minX = Math.min(...kids.map((c) => c.x));
  const maxY = Math.max(...kids.map((c) => c.y + c.height));
  const maxX = Math.max(...kids.map((c) => c.x + c.width));

  const verticalSpread = maxY - minY;
  const horizontalSpread = maxX - minX;
  const ratio = horizontalSpread === 0 ? Infinity : verticalSpread / horizontalSpread;

  let direction: 'VERTICAL' | 'HORIZONTAL';
  let confidence: 'high' | 'medium' | 'review';
  if (ratio > VERTICAL_RATIO) {
    direction = 'VERTICAL';
    confidence = 'high';
  } else if (ratio < HORIZONTAL_RATIO) {
    direction = 'HORIZONTAL';
    confidence = 'high';
  } else {
    direction = verticalSpread >= horizontalSpread ? 'VERTICAL' : 'HORIZONTAL';
    confidence = 'review';
  }

  const sorted = [...kids].sort((a, b) =>
    direction === 'VERTICAL' ? a.y - b.y : a.x - b.x,
  );

  const itemSpacing = snapValue(medianGap(sorted, direction), snap);

  const padding: [number, number, number, number] = [
    snapValue(Math.max(0, minY - frame.y), snap),
    snapValue(Math.max(0, frame.x + frame.width - maxX), snap),
    snapValue(Math.max(0, frame.y + frame.height - maxY), snap),
    snapValue(Math.max(0, minX - frame.x), snap),
  ];

  if (hasMultiRowGrid(sorted, direction)) {
    confidence = 'review';
  }

  return { direction, itemSpacing, padding, confidence };
}

function medianGap(sortedKids: ChildSnapshot[], direction: 'VERTICAL' | 'HORIZONTAL'): number {
  if (sortedKids.length < 2) return 0;
  const gaps: number[] = [];
  for (let i = 1; i < sortedKids.length; i++) {
    const prev = sortedKids[i - 1];
    const cur = sortedKids[i];
    const gap =
      direction === 'VERTICAL'
        ? cur.y - (prev.y + prev.height)
        : cur.x - (prev.x + prev.width);
    gaps.push(Math.max(0, gap));
  }
  gaps.sort((a, b) => a - b);
  const mid = Math.floor(gaps.length / 2);
  return gaps.length % 2 === 0 ? (gaps[mid - 1] + gaps[mid]) / 2 : gaps[mid];
}

function hasMultiRowGrid(
  sortedKids: ChildSnapshot[],
  direction: 'VERTICAL' | 'HORIZONTAL',
): boolean {
  // If we picked VERTICAL but multiple kids share a row (overlapping Y ranges),
  // or vice versa, the arrangement is grid-like and AL single-axis is lossy.
  const crossAxisRanges = sortedKids.map((c) =>
    direction === 'VERTICAL'
      ? { lo: c.x, hi: c.x + c.width }
      : { lo: c.y, hi: c.y + c.height },
  );
  const primaryStarts = sortedKids.map((c) => (direction === 'VERTICAL' ? c.y : c.x));
  let overlapCount = 0;
  for (let i = 1; i < sortedKids.length; i++) {
    const primaryDelta = Math.abs(primaryStarts[i] - primaryStarts[i - 1]);
    const cross = crossAxisRanges[i];
    const prevCross = crossAxisRanges[i - 1];
    const overlaps = cross.lo < prevCross.hi && prevCross.lo < cross.hi;
    if (primaryDelta < 1 && overlaps) overlapCount++;
  }
  return overlapCount >= 1;
}
