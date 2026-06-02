/**
 * Theme state summarization + contrast feedback for the WebMCP tools.
 *
 * Every mutation tool returns a compact `ThemeSummary` plus any contrast
 * warnings, so an agent gets actionable feedback without a follow-up read
 * (arcade.dev "proactive state-returning").
 */

import { wcagContrastRatio, SHADE_KEYS } from '../color-utils';
import { ALL_ROLES, detectRoleAssignment } from '../role-mappings';
import { STYLE_SECTIONS } from '../sections';
import type { RoleAssignmentOptions } from '../types';
import type { ThemeEditorLike } from './types';
import type { RoundnessStyle } from './coerce';

// ─── Radius presets (derived from the editor's shape section) ───
// The editor's shape section in sections.ts owns the canonical radius preset
// values (default/sharp/rounded); we derive them here so the tool and the GUI
// can't drift, and add the "pill" preset the editor doesn't expose.

const RADIUS_PATH_PREFIX = 'theme.palette.radius.';

function buildRadiusPresets(): Record<string, Record<string, string>> {
  const presets: Record<string, Record<string, string>> = {
    pill: { sm: '9999px', md: '9999px', lg: '9999px', xl: '9999px', full: '9999px' },
  };
  for (const section of STYLE_SECTIONS) {
    for (const preset of section.presets ?? []) {
      const match = preset.id.match(/^radius-(\w+)$/);
      if (!match) continue;
      const radius: Record<string, string> = {};
      for (const [path, value] of Object.entries(preset.values)) {
        if (path.startsWith(RADIUS_PATH_PREFIX) && typeof value === 'string') {
          radius[path.slice(RADIUS_PATH_PREFIX.length)] = value;
        }
      }
      presets[match[1]] = radius;
    }
  }
  return presets;
}

export const RADIUS_PRESETS: Record<string, Record<string, string>> = buildRadiusPresets();

const RADIUS_KEYS = ['sm', 'md', 'lg', 'xl', 'full'] as const;

// ─── Variant-aware color resolution ─────────────────────────────

/**
 * Resolve a theme token path to a concrete color, following `palette.*`,
 * `semantic.*`, and `components.*` references. When resolving the `darkTheme`
 * variant, tokens the dark theme doesn't define fall back to the light theme —
 * mirroring the widget's runtime merge behavior.
 */
export function resolveColor(
  state: ThemeEditorLike,
  path: string,
  prefix: 'theme' | 'darkTheme' = 'theme',
  depth = 0
): string | null {
  if (depth > 6) return null;
  const raw = state.get(`${prefix}.${path}`);
  if (typeof raw !== 'string' || raw === '') {
    return prefix === 'darkTheme' ? resolveColor(state, path, 'theme', depth) : null;
  }
  if (raw.startsWith('#') || raw.startsWith('rgb') || raw === 'transparent') return raw;
  if (
    raw.startsWith('palette.') ||
    raw.startsWith('semantic.') ||
    raw.startsWith('components.')
  ) {
    return resolveColor(state, raw, prefix, depth + 1);
  }
  return null;
}

// ─── Summary ────────────────────────────────────────────────────

export interface RoleState {
  family: string;
  intensity: string;
}

export interface ThemeSummary {
  brand: { primary: string | null; secondary: string | null; accent: string | null };
  roles: Record<string, RoleState | null>;
  typography: {
    fontFamily: string;
    fontSize: string;
    fontWeight: string;
    lineHeight: string;
  };
  roundness: { style: RoundnessStyle | 'custom'; radius: Record<string, string> };
  colorScheme: string;
  history: { index: number; canUndo: boolean; canRedo: boolean };
}

function refSuffix(state: ThemeEditorLike, path: string): string {
  const raw = state.get(path);
  if (typeof raw !== 'string') return 'unknown';
  const parts = raw.split('.');
  return parts[parts.length - 1] || String(raw);
}

/** Friendly role key, e.g. `role-user-messages` → `user-messages`. */
export function roleKey(roleId: string): string {
  return roleId.replace(/^role-/, '');
}

function detectRoundness(radius: Record<string, string>): RoundnessStyle | 'custom' {
  for (const [style, preset] of Object.entries(RADIUS_PRESETS) as [
    RoundnessStyle,
    Record<string, string>,
  ][]) {
    if (RADIUS_KEYS.every((k) => radius[k] === preset[k])) return style;
  }
  return 'custom';
}

export function buildSummary(state: ThemeEditorLike): ThemeSummary {
  const radius: Record<string, string> = {};
  for (const k of RADIUS_KEYS) {
    radius[k] = String(state.get(`theme.palette.radius.${k}`) ?? '');
  }

  const roles: Record<string, RoleState | null> = {};
  for (const role of ALL_ROLES) {
    roles[roleKey(role.roleId)] = detectRoleAssignment(
      (p) => state.get(`theme.${p}`),
      role
    );
  }

  return {
    brand: {
      primary: asColor(state.get('theme.palette.colors.primary.500')),
      secondary: asColor(state.get('theme.palette.colors.secondary.500')),
      accent: asColor(state.get('theme.palette.colors.accent.500')),
    },
    roles,
    typography: {
      fontFamily: refSuffix(state, 'theme.semantic.typography.fontFamily'),
      fontSize: refSuffix(state, 'theme.semantic.typography.fontSize'),
      fontWeight: refSuffix(state, 'theme.semantic.typography.fontWeight'),
      lineHeight: refSuffix(state, 'theme.semantic.typography.lineHeight'),
    },
    roundness: { style: detectRoundness(radius), radius },
    colorScheme: String(state.get('colorScheme') ?? 'light'),
    history: {
      index: state.getHistoryIndex(),
      canUndo: state.canUndo(),
      canRedo: state.canRedo(),
    },
  };
}

function asColor(value: unknown): string | null {
  return typeof value === 'string' && value !== '' ? value : null;
}

// ─── Contrast ───────────────────────────────────────────────────

export interface ContrastPair {
  key: string;
  label: string;
  fg: string;
  bg: string;
}

export const CONTRAST_PAIRS: ContrastPair[] = [
  { key: 'user-message', label: 'User message text', fg: 'components.message.user.text', bg: 'components.message.user.background' },
  { key: 'assistant-message', label: 'Assistant message text', fg: 'components.message.assistant.text', bg: 'components.message.assistant.background' },
  { key: 'header', label: 'Header title', fg: 'components.header.titleForeground', bg: 'components.header.background' },
  { key: 'primary-button', label: 'Primary button label', fg: 'components.button.primary.foreground', bg: 'components.button.primary.background' },
  { key: 'input', label: 'Input placeholder', fg: 'components.input.placeholder', bg: 'components.input.background' },
  { key: 'link', label: 'Link text', fg: 'components.markdown.link.foreground', bg: 'semantic.colors.background' },
  { key: 'scroll', label: 'Scroll-to-bottom icon', fg: 'components.scrollToBottom.foreground', bg: 'components.scrollToBottom.background' },
  { key: 'body', label: 'Body text on background', fg: 'semantic.colors.text', bg: 'semantic.colors.background' },
  { key: 'surface', label: 'Body text on surface', fg: 'semantic.colors.text', bg: 'semantic.colors.surface' },
];

/**
 * The contrast-pair keys relevant to a role, derived by intersecting the role's
 * target token paths with the contrast pairs. This replaces a hand-maintained
 * map so a new role or contrast pair is covered automatically. Roles with no
 * text pair (e.g. borders) correctly yield `[]`.
 */
export function roleContrastPairKeys(role: RoleAssignmentOptions): string[] {
  const targets = new Set(role.targets.map((t) => t.path));
  return CONTRAST_PAIRS.filter((p) => targets.has(p.fg) || targets.has(p.bg)).map((p) => p.key);
}

export interface ContrastWarning {
  code: 'contrast';
  pair: string;
  variant: 'light' | 'dark';
  ratio: number;
  threshold: number;
  message: string;
}

export const CONTRAST_THRESHOLDS = { AA: 4.5, AAA: 7 } as const;
export type ContrastLevel = keyof typeof CONTRAST_THRESHOLDS;

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Suggest a same-family shade for `fgPath` that meets `threshold` against
 * `bgHex`, preferring the passing shade closest to the current one. Returns a
 * token-ref string (e.g. `palette.colors.primary.700`) or null.
 */
function suggestShade(
  state: ThemeEditorLike,
  fgPath: string,
  bgHex: string,
  threshold: number,
  prefix: 'theme' | 'darkTheme'
): string | null {
  const raw = state.get(`${prefix}.${fgPath}`);
  if (typeof raw !== 'string') return null;
  const m = raw.match(/^palette\.colors\.(\w+)\.(\d+)$/);
  if (!m) return null;
  const family = m[1];
  const currentIdx = SHADE_KEYS.indexOf(m[2] as (typeof SHADE_KEYS)[number]);

  let best: string | null = null;
  let bestDistance = Infinity;
  SHADE_KEYS.forEach((shade, idx) => {
    const hex = state.get(`${prefix}.palette.colors.${family}.${shade}`);
    if (typeof hex !== 'string' || !(hex.startsWith('#') || hex.startsWith('rgb'))) return;
    if (wcagContrastRatio(hex, bgHex) >= threshold) {
      const distance = currentIdx >= 0 ? Math.abs(idx - currentIdx) : idx;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = `palette.colors.${family}.${shade}`;
      }
    }
  });
  return best;
}

export interface ContrastCheck {
  pair: string;
  label: string;
  variant: 'light' | 'dark';
  fg: string;
  bg: string;
  ratio: number;
  threshold: number;
  passes: boolean;
  suggestion?: string;
}

export interface ContrastReport {
  level: ContrastLevel;
  checks: ContrastCheck[];
  failures: ContrastCheck[];
}

/** Run contrast over the named pairs (default: all) for the given variant(s). */
export function runContrastChecks(
  state: ThemeEditorLike,
  level: ContrastLevel = 'AA',
  variant: 'light' | 'dark' | 'both' = 'both',
  pairKeys?: string[]
): ContrastReport {
  const threshold = CONTRAST_THRESHOLDS[level];
  const variants: ('light' | 'dark')[] = variant === 'both' ? ['light', 'dark'] : [variant];
  const pairs = pairKeys
    ? CONTRAST_PAIRS.filter((p) => pairKeys.includes(p.key))
    : CONTRAST_PAIRS;

  const checks: ContrastCheck[] = [];
  for (const v of variants) {
    const prefix = v === 'light' ? 'theme' : 'darkTheme';
    for (const pair of pairs) {
      const fg = resolveColor(state, pair.fg, prefix);
      const bg = resolveColor(state, pair.bg, prefix);
      if (!fg || !bg) continue;
      const ratio = round2(wcagContrastRatio(fg, bg));
      const passes = ratio >= threshold;
      const check: ContrastCheck = {
        pair: pair.key,
        label: pair.label,
        variant: v,
        fg,
        bg,
        ratio,
        threshold,
        passes,
      };
      if (!passes) {
        const suggestion = suggestShade(state, pair.fg, bg, threshold, prefix);
        if (suggestion) check.suggestion = suggestion;
      }
      checks.push(check);
    }
  }

  return { level, checks, failures: checks.filter((c) => !c.passes) };
}

/** Compact contrast warnings for the regions a mutation touched. */
export function quickContrastWarnings(
  state: ThemeEditorLike,
  pairKeys: string[],
  variant: 'light' | 'dark' | 'both' = 'light',
  level: ContrastLevel = 'AA'
): ContrastWarning[] {
  if (pairKeys.length === 0) return [];
  const report = runContrastChecks(state, level, variant, pairKeys);
  return report.failures.map((f) => ({
    code: 'contrast' as const,
    pair: f.pair,
    variant: f.variant,
    ratio: f.ratio,
    threshold: f.threshold,
    message: `${f.label} (${f.variant}) has a contrast ratio of ${f.ratio}:1, below the ${level} threshold of ${f.threshold}:1${
      f.suggestion ? `. Try ${f.suggestion} for the foreground.` : '.'
    }`,
  }));
}
