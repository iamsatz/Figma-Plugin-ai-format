import type { TreeNode } from '../../core/types';
import type { IconLibrary, IconSuggestion } from '../icons/types';

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

const ICON_SYSTEM_PROMPT = `You help a designer find 4 icons matching their query across 4 open-source icon libraries.

Return EXACTLY 4 items as a JSON array. Each item is one of:

  Catalog match:
    { "library": "phosphor" | "lucide" | "heroicons" | "material", "name": "<exact-name-from-catalog>" }

  Custom inline SVG (last resort only when NO catalog has a decent match):
    { "library": "custom", "name": "<short-kebab-descriptor>", "svg": "<inline svg...>" }

Rules:
- Prefer catalog matches. Custom SVGs should be rare.
- Each "name" must match its library's catalog exactly (case-sensitive).
- Custom SVG must be 24x24 with viewBox="0 0 24 24", stroke-based (stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round" stroke-linejoin="round").
- Do not repeat anything in the Exclude list.
- Output JSON only, no prose, no code fences.`;

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

// Parses Claude's icon response envelope and returns up to 4 valid suggestions.
// Each suggestion is either a catalog match (library + name) or a custom
// AI-generated SVG. Catalog names are validated against the library's set.
// Exported for unit testing.
export function parseIconResponse(
  raw: unknown,
  catalogs: Record<IconLibrary, ReadonlySet<string>>,
): IconSuggestion[] {
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

  const seenIds = new Set<string>();
  const out: IconSuggestion[] = [];
  for (const item of parsed) {
    const suggestion = toSuggestion(item, catalogs);
    if (!suggestion) continue;
    const id = suggestion.kind === 'library' ? `${suggestion.library}:${suggestion.name}` : `custom:${suggestion.name}`;
    if (seenIds.has(id)) continue;
    seenIds.add(id);
    out.push(suggestion);
    if (out.length >= 4) break;
  }
  return out;
}

function toSuggestion(
  item: unknown,
  catalogs: Record<IconLibrary, ReadonlySet<string>>,
): IconSuggestion | null {
  if (!item || typeof item !== 'object') return null;
  const raw = item as { library?: unknown; name?: unknown; svg?: unknown };
  if (typeof raw.library !== 'string' || typeof raw.name !== 'string') return null;
  const name = raw.name.trim();
  if (!name) return null;

  if (raw.library === 'custom') {
    if (typeof raw.svg !== 'string') return null;
    const svg = raw.svg.trim();
    if (!svg.startsWith('<svg')) return null;
    return { kind: 'custom', name, svg };
  }

  if (raw.library === 'phosphor' || raw.library === 'lucide' || raw.library === 'heroicons' || raw.library === 'material') {
    const catalog = catalogs[raw.library];
    if (!catalog.has(name)) return null;
    return { kind: 'library', library: raw.library, name };
  }

  return null;
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

function buildIconBody(
  query: string,
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
) {
  const text =
    `Query: ${query}\n\n` +
    `phosphor catalog (kebab-case): ${catalogs.phosphor.join(', ')}\n\n` +
    `lucide catalog (kebab-case): ${catalogs.lucide.join(', ')}\n\n` +
    `heroicons catalog (kebab-case): ${catalogs.heroicons.join(', ')}\n\n` +
    `material catalog (snake_case): ${catalogs.material.join(', ')}\n\n` +
    `Exclude (already shown): ${exclude.join(', ') || '(none)'}\n\n` +
    `Return a JSON array of EXACTLY 4 items, each either a catalog match or a custom SVG.`;
  return {
    model: MODEL,
    max_tokens: 2000,
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
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ suggestions: IconSuggestion[]; usage: ClaudeUsage }> {
  const json = await postClaude(apiKey, buildIconBody(query, catalogs, exclude), signal);
  const sets: Record<IconLibrary, ReadonlySet<string>> = {
    phosphor: new Set(catalogs.phosphor),
    lucide: new Set(catalogs.lucide),
    heroicons: new Set(catalogs.heroicons),
    material: new Set(catalogs.material),
  };
  const suggestions = parseIconResponse(json, sets);
  const usage = extractUsage(json);
  return { suggestions, usage };
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
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ suggestions: IconSuggestion[]; usage: ClaudeUsage }> {
  try {
    return await iconsOnce(apiKey, query, catalogs, exclude, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    return await iconsOnce(apiKey, query, catalogs, exclude, signal);
  }
}
