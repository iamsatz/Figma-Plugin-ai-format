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
  const catalog = ['home', 'user', 'settings', 'search', 'bell', 'heart'] as const;

  it('returns names matching the catalog', () => {
    const envelope = {
      content: [{ type: 'text', text: '["home","user","settings","search"]' }],
    };
    const result = parseIconResponse(envelope, catalog);
    assert.deepEqual(result, ['home', 'user', 'settings', 'search']);
  });

  it('filters out names not in the catalog', () => {
    const envelope = {
      content: [{ type: 'text', text: '["home","bogus","settings","xyz"]' }],
    };
    const result = parseIconResponse(envelope, catalog);
    assert.deepEqual(result, ['home', 'settings']);
  });

  it('caps at 4 names when more are returned', () => {
    const envelope = {
      content: [
        { type: 'text', text: '["home","user","settings","search","bell","heart"]' },
      ],
    };
    const result = parseIconResponse(envelope, catalog);
    assert.equal(result.length, 4);
    assert.deepEqual(result, ['home', 'user', 'settings', 'search']);
  });

  it('returns empty array when catalog has no matches', () => {
    const envelope = {
      content: [{ type: 'text', text: '["a","b","c"]' }],
    };
    assert.deepEqual(parseIconResponse(envelope, catalog), []);
  });

  it('handles empty array response', () => {
    const envelope = {
      content: [{ type: 'text', text: '[]' }],
    };
    assert.deepEqual(parseIconResponse(envelope, catalog), []);
  });

  it('drops non-string entries', () => {
    const envelope = {
      content: [{ type: 'text', text: '["home",42,null,"user"]' }],
    };
    const result = parseIconResponse(envelope, catalog);
    assert.deepEqual(result, ['home', 'user']);
  });

  it('deduplicates matches', () => {
    const envelope = {
      content: [{ type: 'text', text: '["home","home","user"]' }],
    };
    const result = parseIconResponse(envelope, catalog);
    assert.deepEqual(result, ['home', 'user']);
  });

  it('throws on invalid JSON', () => {
    const envelope = {
      content: [{ type: 'text', text: 'not json' }],
    };
    assert.throws(
      () => parseIconResponse(envelope, catalog),
      (err: Error) => err instanceof ClaudeError && /invalid JSON/.test(err.message),
    );
  });

  it('throws when response is an object instead of an array', () => {
    const envelope = {
      content: [{ type: 'text', text: '{"a":"home"}' }],
    };
    assert.throws(
      () => parseIconResponse(envelope, catalog),
      (err: Error) => err instanceof ClaudeError && /not a JSON array/.test(err.message),
    );
  });

  it('throws on empty envelope', () => {
    assert.throws(
      () => parseIconResponse(null, catalog),
      (err: Error) => err instanceof ClaudeError,
    );
  });

  it('throws on api error', () => {
    assert.throws(
      () => parseIconResponse({ error: { message: 'rate limited' } }, catalog),
      (err: Error) => err instanceof ClaudeError && /rate limited/.test(err.message),
    );
  });
});
