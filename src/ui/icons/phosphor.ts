import type { PhosphorWeight } from './catalog';

export const PHOSPHOR_CDN_BASE = 'https://unpkg.com/@phosphor-icons/core@2.1.1/assets/';

/**
 * Fetches a single Phosphor SVG from the unpkg CDN.
 *
 * URL shape: `${PHOSPHOR_CDN_BASE}${weight}/${name}${suffix}.svg`
 * where suffix is `''` for regular and `-${weight}` for all other weights.
 *
 * Examples:
 *   heart + regular  -> .../assets/regular/heart.svg
 *   heart + bold     -> .../assets/bold/heart-bold.svg
 *   heart + fill     -> .../assets/fill/heart-fill.svg
 *   heart + duotone  -> .../assets/duotone/heart-duotone.svg
 */
export async function fetchPhosphorSvg(
  name: string,
  weight: PhosphorWeight = 'regular',
  signal?: AbortSignal,
): Promise<string> {
  const suffix = weight === 'regular' ? '' : `-${weight}`;
  const url = `${PHOSPHOR_CDN_BASE}${weight}/${name}${suffix}.svg`;

  let response: Response;
  try {
    response = await fetch(url, { signal });
  } catch (err) {
    // Network / abort / CORS — rethrow as-is so callers can distinguish.
    throw err;
  }

  if (!response.ok) {
    throw new Error(`Icon not found: ${name} (${weight})`);
  }

  return await response.text();
}
