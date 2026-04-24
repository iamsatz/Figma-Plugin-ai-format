import type { TreeNode } from '../../core/types';
import type { IconLibrary, IconSuggestion } from '../icons/types';

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

type GeminiSchema = {
  type: 'object' | 'array' | 'string';
  additionalProperties?: GeminiSchema;
  items?: GeminiSchema;
  properties?: Record<string, GeminiSchema>;
  required?: string[];
};

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
    responseSchema: GeminiSchema;
    temperature: number;
    maxOutputTokens?: number;
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

function buildIconBody(
  query: string,
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
): GeminiBody {
  const text =
    `${ICON_SYSTEM_PROMPT}\n\n` +
    `Query: ${query}\n\n` +
    `phosphor catalog (kebab-case): ${catalogs.phosphor.join(', ')}\n\n` +
    `lucide catalog (kebab-case): ${catalogs.lucide.join(', ')}\n\n` +
    `heroicons catalog (kebab-case): ${catalogs.heroicons.join(', ')}\n\n` +
    `material catalog (snake_case): ${catalogs.material.join(', ')}\n\n` +
    `Exclude (already shown): ${exclude.join(', ') || '(none)'}\n\n` +
    `Return a JSON array of EXACTLY 4 items, each either a catalog match or a custom SVG.`;
  return {
    contents: [{ role: 'user', parts: [{ text }] }],
    generationConfig: {
      responseMimeType: 'application/json',
      responseSchema: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            library: { type: 'string' },
            name: { type: 'string' },
            svg: { type: 'string' },
          },
          required: ['library', 'name'],
        },
      },
      temperature: 0.3,
      maxOutputTokens: 2000,
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

export function parseIconResponse(
  raw: unknown,
  catalogs: Record<IconLibrary, ReadonlySet<string>>,
): IconSuggestion[] {
  const text = extractText(raw);
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new GeminiError('invalid JSON in response');
  }
  if (!Array.isArray(parsed)) throw new GeminiError('response is not a JSON array');

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
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ suggestions: IconSuggestion[]; usage: GeminiUsage }> {
  const json = await postGemini(apiKey, buildIconBody(query, catalogs, exclude), signal);
  const sets: Record<IconLibrary, ReadonlySet<string>> = {
    phosphor: new Set(catalogs.phosphor),
    lucide: new Set(catalogs.lucide),
    heroicons: new Set(catalogs.heroicons),
    material: new Set(catalogs.material),
  };
  return { suggestions: parseIconResponse(json, sets), usage: extractUsage(json) };
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
  catalogs: Record<IconLibrary, readonly string[]>,
  exclude: readonly string[],
  signal?: AbortSignal,
): Promise<{ suggestions: IconSuggestion[]; usage: GeminiUsage }> {
  try {
    return await iconsOnce(apiKey, query, catalogs, exclude, signal);
  } catch (err) {
    if (isNonRetryable(err)) throw err;
    return await iconsOnce(apiKey, query, catalogs, exclude, signal);
  }
}
