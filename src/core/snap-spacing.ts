export type SnapConfig = {
  gridPx: number;
  tokens?: Record<string, number>;
};

export function snapValue(value: number, { gridPx, tokens }: SnapConfig): number {
  if (!Number.isFinite(value) || value < 0) return 0;
  if (tokens && Object.keys(tokens).length > 0) {
    const candidates = Object.values(tokens);
    return nearest(value, candidates);
  }
  const safeGrid = gridPx > 0 ? gridPx : 1;
  return Math.round(value / safeGrid) * safeGrid;
}

function nearest(value: number, candidates: number[]): number {
  let best = candidates[0];
  let bestDist = Math.abs(value - best);
  for (let i = 1; i < candidates.length; i++) {
    const d = Math.abs(value - candidates[i]);
    if (d < bestDist || (d === bestDist && candidates[i] < best)) {
      best = candidates[i];
      bestDist = d;
    }
  }
  return best;
}
