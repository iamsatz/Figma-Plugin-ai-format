import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { desiredChildOrder, isAlreadyOrdered } from '../src/core/reorder';

describe('desiredChildOrder', () => {
  const kids = [
    { id: 'b', name: 'b', x: 10, y: 100, width: 10, height: 10 },
    { id: 'a', name: 'a', x: 10, y: 10, width: 10, height: 10 },
    { id: 'c', name: 'c', x: 10, y: 200, width: 10, height: 10 },
  ];

  it('sorts vertical by Y ascending', () => {
    assert.deepEqual(desiredChildOrder(kids, 'VERTICAL'), ['a', 'b', 'c']);
  });

  it('sorts horizontal by X ascending', () => {
    const row = [
      { id: 'b', name: 'b', x: 100, y: 0, width: 10, height: 10 },
      { id: 'a', name: 'a', x: 0, y: 0, width: 10, height: 10 },
      { id: 'c', name: 'c', x: 200, y: 0, width: 10, height: 10 },
    ];
    assert.deepEqual(desiredChildOrder(row, 'HORIZONTAL'), ['a', 'b', 'c']);
  });

  it('uses reading order (row-then-X) when layoutMode is NONE', () => {
    const grid = [
      { id: 'br', name: 'br', x: 100, y: 100, width: 10, height: 10 },
      { id: 'bl', name: 'bl', x: 0, y: 100, width: 10, height: 10 },
      { id: 'tr', name: 'tr', x: 100, y: 0, width: 10, height: 10 },
      { id: 'tl', name: 'tl', x: 0, y: 0, width: 10, height: 10 },
    ];
    assert.deepEqual(desiredChildOrder(grid, 'NONE'), ['tl', 'tr', 'bl', 'br']);
  });
});

describe('isAlreadyOrdered', () => {
  it('returns true when ids match positionally', () => {
    const kids = [
      { id: 'a', name: 'a', x: 0, y: 0, width: 1, height: 1 },
      { id: 'b', name: 'b', x: 0, y: 0, width: 1, height: 1 },
    ];
    assert.equal(isAlreadyOrdered(kids, ['a', 'b']), true);
    assert.equal(isAlreadyOrdered(kids, ['b', 'a']), false);
  });
});
