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

export class GeminiError extends Error {
  readonly status: number;
  constructor(message: string, status = 0) {
    super(message);
    this.name = 'GeminiError';
    this.status = status;
  }
}

type GeminiBody = {
  contents: Array<{
    role: 'user';
    parts: Array<
      | { text: string }
      | { inline_data: { mime_type: 'image/png'; data: string } }
    >;
  }>;
  generationConfig: {
    responseMimeType: 'application/json';
    responseSchema: {
      type: 'object';
      additionalProperties: { type: 'string' };
    };
    temperature: number;
  };
};

function buildBody(pngBase64: string, tree: TreeNode): GeminiBody {
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

// Parses Gemini's response envelope and returns the JSON name map.
// Exported for unit testing.
export function parseResponse(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object') throw new GeminiError('empty response');
  const envelope = raw as {
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
    error?: { message?: string };
  };
  if (envelope.error) throw new GeminiError(envelope.error.message ?? 'api error');

  const parts = envelope.candidates?.[0]?.content?.parts;
  const text = parts?.map((p) => p.text).filter(Boolean).join('') ?? '';
  if (!text) throw new GeminiError('no text in response');

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

async function callOnce(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  const res = await fetch(`${ENDPOINT}?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(buildBody(pngBase64, tree)),
    signal,
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) {
    const msg =
      (json as { error?: { message?: string } } | null)?.error?.message ??
      `Gemini returned ${res.status}`;
    throw new GeminiError(msg, res.status);
  }
  return parseResponse(json);
}

export async function renameWithGemini(
  apiKey: string,
  pngBase64: string,
  tree: TreeNode,
  signal?: AbortSignal,
): Promise<Record<string, string>> {
  try {
    return await callOnce(apiKey, pngBase64, tree, signal);
  } catch (err) {
    if (err instanceof GeminiError && err.status >= 400 && err.status < 500 && err.status !== 429) {
      // Auth / bad-request failures won't recover on retry.
      throw err;
    }
    // One retry for transient errors (5xx, network, invalid JSON, 429).
    return await callOnce(apiKey, pngBase64, tree, signal);
  }
}
