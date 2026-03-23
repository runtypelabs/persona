/**
 * Package default component token values for inline editor reset (light + dark use same ref strings).
 */

import { DEFAULT_COMPONENTS } from '@runtypelabs/persona';

function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const parts = path.split('.');
  let current: unknown = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[part];
  }
  return current;
}

/**
 * Resolve the default token ref or literal for `theme.components.*` or `darkTheme.components.*`.
 */
export function getPackageDefaultForComponentsPath(fullPath: string): string | undefined {
  const prefixes = ['theme.components.', 'darkTheme.components.'] as const;
  for (const prefix of prefixes) {
    if (fullPath.startsWith(prefix)) {
      const rest = fullPath.slice(prefix.length);
      const v = getByPath(DEFAULT_COMPONENTS as Record<string, unknown>, rest);
      return typeof v === 'string' ? v : undefined;
    }
  }
  return undefined;
}

/**
 * Map a `theme.*` state path to light + dark config paths (for mirrored updates).
 */
export function pairedThemeColorPaths(themePath: string): { light: string; dark: string } | null {
  if (!themePath.startsWith('theme.')) return null;
  return {
    light: themePath,
    dark: `darkTheme.${themePath.slice('theme.'.length)}`,
  };
}

function slotMatchesDefault(raw: unknown, defaultRef: string): boolean {
  return raw === undefined || raw === defaultRef;
}

/**
 * True if either light or dark slot diverges from the package default (literals, other refs, or dark-only overrides).
 */
export function colorFieldNeedsReset(
  get: (path: string) => unknown,
  themePath: string,
  defaultRef: string
): boolean {
  const pair = pairedThemeColorPaths(themePath);
  if (!pair) return true;
  const lightRaw = get(pair.light);
  const darkRaw = get(pair.dark);
  return !slotMatchesDefault(lightRaw, defaultRef) || !slotMatchesDefault(darkRaw, defaultRef);
}
