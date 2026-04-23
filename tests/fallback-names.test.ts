import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { fallbackNames } from '../src/ui/api/fallback-names';
import type { TreeNode } from '../src/core/types';

function n(overrides: Partial<TreeNode> & { id: string; type: string; name: string }): TreeNode {
  return {
    bbox: [0, 0, 100, 100],
    ...overrides,
  };
}

describe('fallbackNames', () => {
  it('renames placeholder frames to type-based names', () => {
    const tree = n({ id: 'a', type: 'FRAME', name: 'Frame 47' });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Container');
  });

  it('keeps meaningful names untouched', () => {
    const tree = n({ id: 'a', type: 'FRAME', name: 'Hero Section' });
    const out = fallbackNames(tree);
    assert.equal(out['a'], undefined);
  });

  it('picks text context from TEXT child', () => {
    const tree = n({
      id: 'a',
      type: 'FRAME',
      name: 'Frame 12',
      children: [n({ id: 'b', type: 'TEXT', name: 'Text', text: 'Sign up now' })],
    });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Container_SignUp');
  });

  it('gives TEXT nodes a Label_ prefix', () => {
    const tree = n({
      id: 'a',
      type: 'TEXT',
      name: 'Text 3',
      text: 'Welcome home',
    });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Label_WelcomeHome');
  });

  it('handles GROUP as Stack', () => {
    const tree = n({ id: 'a', type: 'GROUP', name: 'Group 9' });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Stack');
  });

  it('sanitizes punctuation out of context words', () => {
    const tree = n({
      id: 'a',
      type: 'TEXT',
      name: 'Rectangle 2',
      text: 'Hello, World!',
    });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Label_HelloWorld');
  });

  it('walks children recursively', () => {
    const tree = n({
      id: 'a',
      type: 'FRAME',
      name: 'Frame 1',
      children: [
        n({
          id: 'b',
          type: 'FRAME',
          name: 'Frame 2',
          children: [n({ id: 'c', type: 'TEXT', name: 'Text 1', text: 'Hi there' })],
        }),
      ],
    });
    const out = fallbackNames(tree);
    assert.equal(out['a'], 'Container_HiThere');
    assert.equal(out['b'], 'Container_HiThere');
    assert.equal(out['c'], 'Label_HiThere');
  });
});
