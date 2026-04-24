import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseRenameResponse, parseIconResponse, ClaudeError } from '../src/ui/api/claude';

describe('parseRenameResponse', () => {
  it('extracts JSON name map from Claude envelope', () => {
    const envelope = {
      content: [{ type: 'text', text: '{"node-1":"Section_Hero","node-2":"Button_CTA"}' }],
    };
    const result = parseRenameResponse(envelope);
    assert.deepEqual(result, { 'node-1': 'Section_Hero', 'node-2': 'Button_CTA' });
  });

  it('trims whitespace from names', () => {
    const envelope = {
      content: [{ type: 'text', text: '{"a":"  Heading_Title  "}' }],
    };
    const result = parseRenameResponse(envelope);
    assert.equal(result['a'], 'Heading_Title');
  });

  it('drops non-string values silently', () => {
    const envelope = {
      content: [{ type: 'text', text: '{"a":"Good","b":null,"c":123}' }],
    };
    const result = parseRenameResponse(envelope);
    assert.deepEqual(result, { a: 'Good' });
  });

  it('throws on api error', () => {
    assert.throws(
      () => parseRenameResponse({ error: { message: 'quota exceeded' } }),
      (err: Error) => err instanceof ClaudeError && /quota/.test(err.message),
    );
  });

  it('throws on invalid JSON body', () => {
    const envelope = {
      content: [{ type: 'text', text: 'not json' }],
    };
    assert.throws(
      () => parseRenameResponse(envelope),
      (err: Error) => err instanceof ClaudeError && /invalid JSON/.test(err.message),
    );
  });

  it('throws when response is an array instead of an object', () => {
    const envelope = {
      content: [{ type: 'text', text: '["a","b"]' }],
    };
    assert.throws(
      () => parseRenameResponse(envelope),
      (err: Error) => err instanceof ClaudeError && /not a JSON object/.test(err.message),
    );
  });

  it('throws on empty response', () => {
    assert.throws(
      () => parseRenameResponse(null),
      (err: Error) => err instanceof ClaudeError,
    );
  });

  it('throws when content is empty', () => {
    assert.throws(
      () => parseRenameResponse({ content: [] }),
      (err: Error) => err instanceof ClaudeError,
    );
  });

  it('concatenates multi-block text content', () => {
    const envelope = {
      content: [
        { type: 'text', text: '{"a":' },
        { type: 'text', text: '"Section_Hero"}' },
      ],
    };
    assert.deepEqual(parseRenameResponse(envelope), { a: 'Section_Hero' });
  });

  it('ignores non-text content blocks', () => {
    const envelope = {
      content: [
        { type: 'thinking', text: 'ignored' },
        { type: 'text', text: '{"a":"Button_CTA"}' },
      ],
    };
    assert.deepEqual(parseRenameResponse(envelope), { a: 'Button_CTA' });
  });
});

describe('parseIconResponse', () => {
  const catalogs = {
    phosphor: new Set(['heart', 'home', 'user', 'gear']),
    lucide: new Set(['heart', 'home', 'settings']),
    heroicons: new Set(['heart', 'home', 'cog-6-tooth']),
    material: new Set(['favorite', 'home', 'settings']),
  };

  function envelope(text: string) {
    return { content: [{ type: 'text', text }] };
  }

  it('returns catalog matches across libraries', () => {
    const text = JSON.stringify([
      { library: 'phosphor', name: 'heart' },
      { library: 'lucide', name: 'settings' },
      { library: 'heroicons', name: 'home' },
      { library: 'material', name: 'favorite' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'heart' },
      { kind: 'library', library: 'lucide', name: 'settings' },
      { kind: 'library', library: 'heroicons', name: 'home' },
      { kind: 'library', library: 'material', name: 'favorite' },
    ]);
  });

  it('filters out names not present in the named library', () => {
    const text = JSON.stringify([
      { library: 'phosphor', name: 'heart' },
      { library: 'phosphor', name: 'not-in-catalog' },
      { library: 'lucide', name: 'settings' },
      { library: 'lucide', name: 'gear' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'heart' },
      { kind: 'library', library: 'lucide', name: 'settings' },
    ]);
  });

  it('caps at 4 items', () => {
    const text = JSON.stringify([
      { library: 'phosphor', name: 'heart' },
      { library: 'phosphor', name: 'home' },
      { library: 'phosphor', name: 'user' },
      { library: 'phosphor', name: 'gear' },
      { library: 'lucide', name: 'home' },
      { library: 'lucide', name: 'heart' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.equal(result.length, 4);
  });

  it('accepts custom SVG items', () => {
    const text = JSON.stringify([
      { library: 'phosphor', name: 'heart' },
      { library: 'custom', name: 'banana-split', svg: '<svg viewBox="0 0 24 24"></svg>' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'heart' },
      { kind: 'custom', name: 'banana-split', svg: '<svg viewBox="0 0 24 24"></svg>' },
    ]);
  });

  it('rejects custom items without svg field or bad svg string', () => {
    const text = JSON.stringify([
      { library: 'custom', name: 'missing-svg' },
      { library: 'custom', name: 'not-svg', svg: '<div />' },
      { library: 'phosphor', name: 'heart' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'heart' },
    ]);
  });

  it('rejects unknown library values', () => {
    const text = JSON.stringify([
      { library: 'bootstrap', name: 'heart' },
      { library: 'phosphor', name: 'home' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'home' },
    ]);
  });

  it('deduplicates on library:name pair', () => {
    const text = JSON.stringify([
      { library: 'phosphor', name: 'heart' },
      { library: 'phosphor', name: 'heart' },
      { library: 'lucide', name: 'heart' },
    ]);
    const result = parseIconResponse(envelope(text), catalogs);
    assert.deepEqual(result, [
      { kind: 'library', library: 'phosphor', name: 'heart' },
      { kind: 'library', library: 'lucide', name: 'heart' },
    ]);
  });

  it('handles empty array response', () => {
    assert.deepEqual(parseIconResponse(envelope('[]'), catalogs), []);
  });

  it('throws on invalid JSON', () => {
    assert.throws(
      () => parseIconResponse(envelope('not json'), catalogs),
      (err: Error) => err instanceof ClaudeError && /invalid JSON/.test(err.message),
    );
  });

  it('throws when response is an object instead of an array', () => {
    assert.throws(
      () => parseIconResponse(envelope('{"a":"home"}'), catalogs),
      (err: Error) => err instanceof ClaudeError && /not a JSON array/.test(err.message),
    );
  });

  it('throws on empty envelope', () => {
    assert.throws(
      () => parseIconResponse(null, catalogs),
      (err: Error) => err instanceof ClaudeError,
    );
  });

  it('throws on api error', () => {
    assert.throws(
      () => parseIconResponse({ error: { message: 'rate limited' } }, catalogs),
      (err: Error) => err instanceof ClaudeError && /rate limited/.test(err.message),
    );
  });
});
