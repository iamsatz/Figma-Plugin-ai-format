import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { inferAutoLayout } from '../src/core/infer-autolayout';
import type { FrameSnapshot } from '../src/core/snapshot';

function frame(overrides: Partial<FrameSnapshot>): FrameSnapshot {
  return {
    id: 'f',
    name: 'frame',
    type: 'FRAME',
    locked: false,
    x: 0,
    y: 0,
    width: 400,
    height: 400,
    layoutMode: 'NONE',
    itemSpacing: 0,
    paddingTop: 0,
    paddingRight: 0,
    paddingBottom: 0,
    paddingLeft: 0,
    children: [],
    ...overrides,
  };
}

describe('inferAutoLayout', () => {
  it('returns null when layoutMode is already set', () => {
    const result = inferAutoLayout(
      frame({
        layoutMode: 'VERTICAL',
        children: [
          { id: 'a', name: 'a', x: 0, y: 0, width: 100, height: 50 },
          { id: 'b', name: 'b', x: 0, y: 60, width: 100, height: 50 },
        ],
      }),
      { gridPx: 8 },
    );
    assert.equal(result, null);
  });

  it('detects a clean vertical stack with high confidence', () => {
    const result = inferAutoLayout(
      frame({
        x: 0,
        y: 0,
        width: 200,
        height: 200,
        children: [
          { id: 'a', name: 'a', x: 16, y: 16, width: 100, height: 40 },
          { id: 'b', name: 'b', x: 16, y: 72, width: 100, height: 40 },
          { id: 'c', name: 'c', x: 16, y: 128, width: 100, height: 40 },
        ],
      }),
      { gridPx: 8 },
    );
    assert.ok(result);
    assert.equal(result.direction, 'VERTICAL');
    assert.equal(result.confidence, 'high');
    assert.equal(result.itemSpacing, 16);
    // Children span x=[16,116], y=[16,168]; frame is 200x200.
    // Padding = [top=16, right=200-116=84→88, bottom=200-168=32, left=16]
    assert.deepEqual(result.padding, [16, 88, 32, 16]);
  });

  it('detects a clean horizontal row with high confidence', () => {
    const result = inferAutoLayout(
      frame({
        width: 400,
        height: 80,
        children: [
          { id: 'a', name: 'a', x: 16, y: 16, width: 80, height: 40 },
          { id: 'b', name: 'b', x: 112, y: 16, width: 80, height: 40 },
          { id: 'c', name: 'c', x: 208, y: 16, width: 80, height: 40 },
        ],
      }),
      { gridPx: 8 },
    );
    assert.ok(result);
    assert.equal(result.direction, 'HORIZONTAL');
    assert.equal(result.confidence, 'high');
    assert.equal(result.itemSpacing, 16);
  });

  it('flags a grid-like 2x2 arrangement as review', () => {
    const result = inferAutoLayout(
      frame({
        width: 200,
        height: 200,
        children: [
          { id: 'a', name: 'a', x: 0, y: 0, width: 80, height: 80 },
          { id: 'b', name: 'b', x: 120, y: 0, width: 80, height: 80 },
          { id: 'c', name: 'c', x: 0, y: 120, width: 80, height: 80 },
          { id: 'd', name: 'd', x: 120, y: 120, width: 80, height: 80 },
        ],
      }),
      { gridPx: 8 },
    );
    assert.ok(result);
    assert.equal(result.confidence, 'review');
  });

  it('returns null with fewer than 2 children', () => {
    const result = inferAutoLayout(
      frame({
        children: [{ id: 'a', name: 'a', x: 0, y: 0, width: 10, height: 10 }],
      }),
      { gridPx: 8 },
    );
    assert.equal(result, null);
  });

  it('snaps spacing and padding to token values when provided', () => {
    const result = inferAutoLayout(
      frame({
        width: 200,
        height: 200,
        // Thin children so the stack is clearly vertical (ratio > 1.5).
        children: [
          { id: 'a', name: 'a', x: 13, y: 13, width: 40, height: 40 },
          { id: 'b', name: 'b', x: 13, y: 66, width: 40, height: 40 },
        ],
      }),
      { gridPx: 8, tokens: { xs: 4, sm: 8, md: 16, lg: 24 } },
    );
    assert.ok(result);
    assert.equal(result.direction, 'VERTICAL');
    // Gap between children is 13 → nearest token is md=16.
    assert.equal(result.itemSpacing, 16);
    // paddingTop = 13 → md=16.
    assert.equal(result.padding[0], 16);
  });
});
