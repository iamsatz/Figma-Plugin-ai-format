import type { IconLibrary } from './types';
import { fetchPhosphorSvg } from './phosphor';

// All icon CDNs serve from unpkg.com, which is already in manifest allowedDomains.
const LUCIDE_BASE = 'https://unpkg.com/lucide-static@0.469.0/icons/';
const HEROICONS_BASE = 'https://unpkg.com/heroicons@2.1.5/24/outline/';
const MATERIAL_BASE = 'https://unpkg.com/@material-design-icons/svg@0.14.13/outlined/';

async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Icon fetch failed: ${url} (${res.status})`);
  return await res.text();
}

export async function fetchIconSvg(
  library: IconLibrary,
  name: string,
  signal?: AbortSignal,
): Promise<string> {
  switch (library) {
    case 'phosphor':
      return await fetchPhosphorSvg(name, 'regular', signal);
    case 'lucide':
      return await fetchText(`${LUCIDE_BASE}${name}.svg`, signal);
    case 'heroicons':
      return await fetchText(`${HEROICONS_BASE}${name}.svg`, signal);
    case 'material':
      return await fetchText(`${MATERIAL_BASE}${name}.svg`, signal);
  }
}
