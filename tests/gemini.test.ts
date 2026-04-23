import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { parseResponse, GeminiError } from '../src/ui/api/gemini';

describe('parseResponse', () => {
  it('extracts JSON name map from Gemini envelope', () => {
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ text: '{"node-1":"Section_Hero","node-2":"Button_CTA"}' }],
          },
        },
      ],
    };
    const result = parseResponse(envelope);
    assert.deepEqual(result, { 'node-1': 'Section_Hero', 'node-2': 'Button_CTA' });
  });

  it('trims whitespace from names', () => {
    const envelope = {
      candidates: [{ content: { parts: [{ text: '{"a":"  Heading_Title  "}' }] } }],
    };
    const result = parseResponse(envelope);
    assert.equal(result['a'], 'Heading_Title');
  });

  it('drops non-string values silently', () => {
    const envelope = {
      candidates: [
        { content: { parts: [{ text: '{"a":"Good","b":null,"c":123}' }] } },
      ],
    };
    const result = parseResponse(envelope);
    assert.deepEqual(result, { a: 'Good' });
  });

  it('throws on api error', () => {
    assert.throws(
      () => parseResponse({ error: { message: 'quota exceeded' } }),
      (err: Error) => err instanceof GeminiError && /quota/.test(err.message),
    );
  });

  it('throws on invalid JSON body', () => {
    const envelope = {
      candidates: [{ content: { parts: [{ text: 'not json' }] } }],
    };
    assert.throws(
      () => parseResponse(envelope),
      (err: Error) => err instanceof GeminiError && /invalid JSON/.test(err.message),
    );
  });

  it('throws when response is an array instead of an object', () => {
    const envelope = {
      candidates: [{ content: { parts: [{ text: '["a","b"]' }] } }],
    };
    assert.throws(
      () => parseResponse(envelope),
      (err: Error) => err instanceof GeminiError && /not a JSON object/.test(err.message),
    );
  });

  it('throws on empty response', () => {
    assert.throws(() => parseResponse(null), (err: Error) => err instanceof GeminiError);
  });

  it('concatenates multi-part text responses', () => {
    const envelope = {
      candidates: [
        {
          content: {
            parts: [{ text: '{"a":' }, { text: '"Section_Hero"}' }],
          },
        },
      ],
    };
    assert.deepEqual(parseResponse(envelope), { a: 'Section_Hero' });
  });
});
