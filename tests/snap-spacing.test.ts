import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { snapValue } from '../src/core/snap-spacing';

describe('snapValue', () => {
  it('snaps to nearest grid multiple', () => {
    assert.equal(snapValue(13, { gridPx: 8 }), 16);
    assert.equal(snapValue(19, { gridPx: 8 }), 16);
    assert.equal(snapValue(27, { gridPx: 8 }), 24);
    assert.equal(snapValue(0, { gridPx: 8 }), 0);
    assert.equal(snapValue(100, { gridPx: 8 }), 104);
  });

  it('snaps to nearest token value when tokens are provided', () => {
    const tokens = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32, '2xl': 48 };
    assert.equal(snapValue(13, { gridPx: 8, tokens }), 16);
    assert.equal(snapValue(28, { gridPx: 8, tokens }), 24);
    assert.equal(snapValue(40, { gridPx: 8, tokens }), 32);
    assert.equal(snapValue(100, { gridPx: 8, tokens }), 48);
  });

  it('ignores tokens when map is empty', () => {
    assert.equal(snapValue(13, { gridPx: 8, tokens: {} }), 16);
  });

  it('clamps negative / non-finite to 0', () => {
    assert.equal(snapValue(-5, { gridPx: 8 }), 0);
    assert.equal(snapValue(NaN, { gridPx: 8 }), 0);
  });

  it('handles gridPx <= 0 without NaN', () => {
    const result = snapValue(7, { gridPx: 0 });
    assert.ok(Number.isFinite(result));
  });
});
