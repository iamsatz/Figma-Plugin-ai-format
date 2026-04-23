import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { buildTree } from '../src/utils/tree';

describe('buildTree', () => {
  it('rounds bbox coordinates', () => {
    const tree = buildTree({
      id: 'a',
      type: 'FRAME',
      name: 'Frame 1',
      x: 10.4,
      y: 20.6,
      width: 100.1,
      height: 50.9,
    });
    assert.deepEqual(tree.bbox, [10, 21, 100, 51]);
  });

  it('includes trimmed text for TEXT nodes, truncated to 80 chars', () => {
    const long = 'a'.repeat(120);
    const tree = buildTree({
      id: 't',
      type: 'TEXT',
      name: 'Text',
      characters: `  ${long}  `,
    });
    assert.equal(tree.text!.length, 80);
  });

  it('omits text for non-TEXT nodes', () => {
    const tree = buildTree({
      id: 'f',
      type: 'FRAME',
      name: 'Frame',
      characters: 'should be ignored',
    });
    assert.equal(tree.text, undefined);
  });

  it('recurses into children and caps at max depth', () => {
    function deep(depth: number, id: string): any {
      return depth === 0
        ? { id, type: 'FRAME', name: id }
        : { id, type: 'FRAME', name: id, children: [deep(depth - 1, `${id}-c`)] };
    }
    const tree = buildTree(deep(10, 'root'));
    let node = tree;
    let actualDepth = 0;
    while (node.children && node.children[0]) {
      actualDepth++;
      node = node.children[0];
    }
    // MAX_DEPTH is 6, so the deepest materialised child is at level 6.
    assert.equal(actualDepth, 6);
  });

  it('omits empty text', () => {
    const tree = buildTree({ id: 't', type: 'TEXT', name: 'Text', characters: '   ' });
    assert.equal(tree.text, undefined);
  });
});
