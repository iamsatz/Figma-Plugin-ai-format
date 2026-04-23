import type { TreeNode } from '../../core/types';

const ENDPOINT =
  'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

const SYSTEM_PROMPT = `You are a senior product designer naming Figma layers for developer handoff.

INPUT: A frame screenshot and a JSON layer tree.
TASK: Rename every layer using the convention:

  Type_Context  or  Type_Context_Variant

Allowed Types:
  Section, Container, Stack, Row, Col, Card, Button, Input, Label,
  Heading, Body, Caption, Icon, Image, Avatar, Badge, Divider,
  Nav, Logo, Tab, Modal, Toast, List, ListItem.

RULES:
- PascalCase, underscores between segments, max 3 segments.
- Container layers: name by role, not contents.
- Skip any layer whose existing name starts with "_".
- Skip locked layers.
- For text layers, use the visible text as Context (max 2 words, sanitized).
- If the existing name is already a good PascalCase Type_Context name, keep it.

OUTPUT: ONLY valid JSON of shape { "<layerId>": "<NewName>", ... }
Include every layer id from the tree. No prose. No code fences. No explanations.`;

const ICON_SYSTEM_PROMPT =
  "You pick exactly 4 icon names from a provided catalog that best match a user's search query. Respond with ONLY a JSON array of 4 strings from the catalog. No prose, no markdown.";

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

export function friendlyGeminiError(err: unknown): string {
  if (err instanceof GeminiError) {
    if (err.status === 401 || err.status === 403) return 'Invalid API key';
    if (err.status === 429) return 'Rate limit hit — try again later';
    if (err.status >= 500) return 'Gemini service error';
  }
  return 'Check your connection';
}

type GeminiUsage = { inputTokens: number; outputTokens: number };

type GeminiBody = {
  contents: Array<{
    role: 'user';
    parts: Array<
      | { text: string }
      | { inline_data: { mime_type: 'image/png'; data: string } }
    >;
  }>;
  systemInstruction?: { parts: Array<{ text: string }> };
  generationConfig: {
    responseMimeType: 'application/json';
    responseSchema: {
      type: 'object' | 'array';
      additionalProperties?: { type: 'string' };
      items?: { type: 'string' };
    };
    temperature: number;
  };
};

function buildRenameBody(pngBase64: string, tree: TreeNode): GeminiBody {
  return {
    contents: [
      {
        role: 'user',
        parts: [
          { text: SYSTEM_PROMPT },
          { inline_data: { mime_type: 'image/png', data: pngBase64 } },
          { text: `TREE:\n${JSON.stringify(tree)}` },
        ],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'object',
        additionalProperties: { type: 'string' },
      },
      temperature: 0.2,
    },
  };
}

function buildIconBody(query: string, catalog: readonly string[], exclude: readonly string[]): GeminiBody {
  const text =
    `${ICON_SYSTEM_PROMPT}\n\n` +
    `Query: ${query}\n` +
    `Catalog: ${catalog.join(', ')}\n` +
    `Exclude: ${exclude.join(', ') || '(none)'}\n` +
    `Return a JSON array of 4 icon names from the catalog, not in the exclude list.`;
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: { type: 'array', items: { type: 'string' } },
      temperature: 0.3,
    },
  };
}

function extractText(envelope: unknown): string {
  if (!envelope || typeof envelope !== 'object') throw new GeminiError('empty response');
  const e = envelope as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (e.error) throw new GeminiError(e.error.message ?? 'api error');
  const parts = e.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  if (!text) throw new GeminiError('no text in response');
  return text;
}

function extractUsage(envelope: unknown): GeminiUsage {
  const e = envelope as {
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number };
  } | null;
  const u = e?.usageMetadata;
  return {
    inputTokens: typeof u?.promptTokenCount === 'number' ? u.promptTokenCount : 0,
    outputTokens: typeof u?.candidatesTokenCount === 'number' ? u.candidatesTokenCount : 0,
  };
}

// Parses Gemini's rename response envelope and returns the JSON name map.
// Exported for unit testing.
export function parseResponse(raw: unknown): Record<string, string> {
  const text = extractText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError('invalid JSON in response');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new GeminiError('response is not a JSON object');
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

export function parseIconResponse(raw: unknown, catalog: readonly string[]): string[] {
  const text = extractText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError('invalid JSON in response');
  }
  if (!Array.isArray(parsed)) throw new GeminiError('response is not a JSON array');
  const set = new Set(catalog);
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (set.has(trimmed) && !out.includes(trimmed)) {
      out.push(trimmed);
      if (out.length >= 4) break;
    }
  }
  return out;
}

async function postGemini(apiKey: string, body: GeminiBody, signal?: AbortSignal): Promise<unknown> {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Gemini returned ${res.status}`;
    throw new GeminiError(msg, res.status);
  }
  return json;
}

function isNonRetryable(err: unknown): boolean {
  return (
    err instanceof GeminiError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 429
  );
}

async function renameOnce(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<{ names: Record<string, string>; usage: GeminiUsage }> {
  const json = await postGemini(apiKey, buildRenameBody(pngBase64, tree), signal);
  return { names: parseResponse(json), usage: extractUsage(json) };
}

async function iconsOnce(
  apiKey: string,
  query: string,
  catalog: readonly string[],
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ names: string[]; usage: GeminiUsage }> {
  const json = await postGemini(apiKey, buildIconBody(query, catalog, exclude), signal);
  return { names: parseIconResponse(json, catalog), usage: extractUsage(json) };
}

export async function renameWithGemini(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<{ names: Record<string, string>; usage: GeminiUsage }> {
  try {
    return await renameOnce(apiKey, pngBase64, tree, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    return await renameOnce(apiKey, pngBase64, tree, signal);
  }
}

export async function suggestIconsWithGemini(
  apiKey: string,
  query: string,
  catalog: readonly string[],
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ names: string[]; usage: GeminiUsage }> {
  try {
    return await iconsOnce(apiKey, query, catalog, exclude, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    return await iconsOnce(apiKey, query, catalog, exclude, signal);
  }
}
