import type { TreeNode } from '../../core/types';

const ENDPOINT = 'https://api.anthropic.com/v1/messages';
const MODEL = 'claude-haiku-4-5';

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

export class ClaudeError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'ClaudeError';
    this.status = status;
  }
}

export function friendlyClaudeError(err: unknown): string {
  if (err instanceof ClaudeError) {
    if (err.status === 401 || err.status === 403) return 'Invalid API key';
    if (err.status === 429) return 'Rate limit hit — try again later';
    if (err.status === 529) return 'Claude is overloaded — try again';
    if (err.status >= 500) return 'Claude service error';
  }
  return 'Check your connection';
}

type ClaudeUsage = { inputTokens: number; outputTokens: number };

function headers(apiKey: string): Record<string, string> {
  return {
    'x-api-key': apiKey,
    'anthropic-version': '2023-06-01',
    'anthropic-dangerous-direct-browser-access': 'true',
    'content-type': 'application/json',
  };
}

function extractText(raw: unknown): string {
  if (!raw || typeof raw !== 'object') throw new ClaudeError('empty response');
  const envelope = raw as {
    content?: Array<{ type?: string; text?: string }>;
    error?: { message?: string };
  };
  if (envelope.error) throw new ClaudeError(envelope.error.message ?? 'api error');

  const blocks = envelope.content;
  if (!Array.isArray(blocks) || blocks.length === 0) {
    throw new ClaudeError('no content in response');
  }
  const text = blocks
    .filter((b) => b && b.type === 'text' && typeof b.text === 'string')
    .map((b) => b.text as string)
    .join('');
  if (!text) throw new ClaudeError('no text in response');
  return text;
}

function extractUsage(raw: unknown): ClaudeUsage {
  const envelope = raw as {
    usage?: { input_tokens?: number; output_tokens?: number };
  } | null;
  const u = envelope?.usage;
  return {
    inputTokens: typeof u?.input_tokens === 'number' ? u.input_tokens : 0,
    outputTokens: typeof u?.output_tokens === 'number' ? u.output_tokens : 0,
  };
}

// Parses Claude's rename response envelope and returns the JSON name map.
// Exported for unit testing.
export function parseRenameResponse(raw: unknown): Record<string, string> {
  const text = extractText(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClaudeError('invalid JSON in response');
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ClaudeError('response is not a JSON object');
  }

  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(parsed as Record<string, unknown>)) {
    if (typeof v === 'string' && v.trim()) out[k] = v.trim();
  }
  return out;
}

// Parses Claude's icon response envelope and returns up to 4 catalog-valid names.
// Exported for unit testing.
export function parseIconResponse(raw: unknown, catalog: readonly string[]): string[] {
  const text = extractText(raw);

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new ClaudeError('invalid JSON in response');
  }

  if (!Array.isArray(parsed)) {
    throw new ClaudeError('response is not a JSON array');
  }

  const catalogSet = new Set(catalog);
  const out: string[] = [];
  for (const item of parsed) {
    if (typeof item !== 'string') continue;
    const trimmed = item.trim();
    if (catalogSet.has(trimmed) && !out.includes(trimmed)) {
      out.push(trimmed);
      if (out.length >= 4) break;
    }
  }
  return out;
}

function buildRenameBody(pngBase64: string, tree: TreeNode) {
  return {
    model: MODEL,
    max_tokens: 4096,
    system: SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'image',
            source: { type: 'base64', media_type: 'image/png', data: pngBase64 },
          },
          { type: 'text', text: `TREE:\n${JSON.stringify(tree)}` },
        ],
      },
    ],
  };
}

function buildIconBody(query: string, catalog: readonly string[], exclude: readonly string[]) {
  const text =
    `Query: ${query}\n` +
    `Catalog: ${catalog.join(', ')}\n` +
    `Exclude: ${exclude.join(', ') || '(none)'}\n` +
    `Return a JSON array of 4 icon names from the catalog, not in the exclude list.`;
  return {
    model: MODEL,
    max_tokens: 200,
    system: ICON_SYSTEM_PROMPT,
    messages: [
      {
        role: 'user',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

async function postClaude(
  apiKey: string,
  body: unknown,
  signal?: AbortSignal,
): Promise<unknown> {
  const res = await fetch(ENDPOINT, {
    method: 'POST',
    headers: headers(apiKey),
    body: JSON.stringify(body),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Claude returned ${res.status}`;
    throw new ClaudeError(msg, res.status);
  }
  return json;
}

async function renameOnce(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<{ names: Record<string, string>; usage: ClaudeUsage }> {
  const json = await postClaude(apiKey, buildRenameBody(pngBase64, tree), signal);
  const names = parseRenameResponse(json);
  const usage = extractUsage(json);
  return { names, usage };
}

async function iconsOnce(
  apiKey: string,
  query: string,
  catalog: readonly string[],
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ names: string[]; usage: ClaudeUsage }> {
  const json = await postClaude(apiKey, buildIconBody(query, catalog, exclude), signal);
  const names = parseIconResponse(json, catalog);
  const usage = extractUsage(json);
  return { names, usage };
}

function isNonRetryable(err: unknown): boolean {
  // 4xx (except 429/529) won't recover on retry.
  return (
    err instanceof ClaudeError &&
    err.status >= 400 &&
    err.status < 500 &&
    err.status !== 429 &&
    err.status !== 529
  );
}

export async function renameWithClaude(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<{ names: Record<string, string>; usage: ClaudeUsage }> {
  try {
    return await renameOnce(apiKey, pngBase64, tree, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    // One retry for transient errors (5xx, 529, 429, network, invalid JSON).
    return await renameOnce(apiKey, pngBase64, tree, signal);
  }
}

export async function suggestIconsWithClaude(
  apiKey: string,
  query: string,
  catalog: readonly string[],
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ names: string[]; usage: ClaudeUsage }> {
  try {
    return await iconsOnce(apiKey, query, catalog, exclude, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    return await iconsOnce(apiKey, query, catalog, exclude, signal);
  }
}
