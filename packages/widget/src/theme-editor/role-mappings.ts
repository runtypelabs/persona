/**
 * Interface Role → Token mapping layer.
 *
 * Maps high-level editor choices (family + intensity) to concrete palette
 * token references across multiple component/semantic paths. This is the
 * core of the "Interface Roles" editor section — one picker writes to
 * many tokens atomically.
 *
 * All functions are pure and headless (no DOM).
 */

import type { RoleTarget, RoleIntensity, RoleAssignmentOptions } from './types';

// ─── Intensities ────────────────────────────────────────────────

export const ROLE_INTENSITIES: RoleIntensity[] = [
  { id: 'solid', label: 'Solid' },
  { id: 'soft', label: 'Soft' },
];

// ─── Palette families available for role assignment ─────────────

export const ROLE_FAMILIES = ['primary', 'secondary', 'accent', 'gray'] as const;
export type RoleFamily = (typeof ROLE_FAMILIES)[number];

/** Display labels for palette families in the editor */
export const ROLE_FAMILY_LABELS: Record<RoleFamily, string> = {
  primary: 'Primary',
  secondary: 'Secondary',
  accent: 'Accent',
  gray: 'Neutral',
};

// ─── Role Definitions ───────────────────────────────────────────

export const ROLE_SURFACES: RoleAssignmentOptions = {
  roleId: 'role-surfaces',
  helper: 'Page and panel backgrounds',
  previewZone: 'container',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'semantic.colors.background', kind: 'background' },
    { path: 'semantic.colors.surface', kind: 'background' },
    { path: 'semantic.colors.container', kind: 'background' },
  ],
};

export const ROLE_HEADER: RoleAssignmentOptions = {
  roleId: 'role-header',
  helper: 'Widget header bar',
  previewZone: 'header',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'components.header.background', kind: 'background' },
    { path: 'components.header.border', kind: 'border' },
    { path: 'components.header.iconBackground', kind: 'accent' },
    { path: 'components.header.iconForeground', kind: 'foreground' },
    { path: 'components.header.titleForeground', kind: 'accent' },
    { path: 'components.header.subtitleForeground', kind: 'foreground' },
    { path: 'components.header.actionIconForeground', kind: 'foreground' },
  ],
};

export const ROLE_USER_MESSAGES: RoleAssignmentOptions = {
  roleId: 'role-user-messages',
  helper: 'User chat bubbles',
  previewZone: 'user-message',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'components.message.user.background', kind: 'background' },
    { path: 'components.message.user.text', kind: 'foreground' },
  ],
};

export const ROLE_ASSISTANT_MESSAGES: RoleAssignmentOptions = {
  roleId: 'role-assistant-messages',
  helper: 'Assistant chat bubbles',
  previewZone: 'assistant-message',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'components.message.assistant.background', kind: 'background' },
    { path: 'components.message.assistant.text', kind: 'foreground' },
  ],
};

export const ROLE_PRIMARY_ACTIONS: RoleAssignmentOptions = {
  roleId: 'role-primary-actions',
  helper: 'Send button and primary buttons',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'components.button.primary.background', kind: 'background' },
    { path: 'components.button.primary.foreground', kind: 'foreground' },
    { path: 'semantic.colors.interactive.default', kind: 'accent' },
    { path: 'semantic.colors.interactive.hover', kind: 'accent' },
  ],
};

export const ROLE_INPUT: RoleAssignmentOptions = {
  roleId: 'role-input',
  helper: 'Message input field',
  previewZone: 'composer',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'components.input.background', kind: 'background' },
    { path: 'components.input.placeholder', kind: 'foreground' },
    { path: 'components.input.focus.border', kind: 'accent' },
    { path: 'components.input.focus.ring', kind: 'accent' },
  ],
};

export const ROLE_LINKS_FOCUS: RoleAssignmentOptions = {
  roleId: 'role-links-focus',
  helper: 'Links, focus rings, and interactive highlights',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'semantic.colors.accent', kind: 'accent' },
    { path: 'semantic.colors.interactive.focus', kind: 'accent' },
    { path: 'semantic.colors.interactive.active', kind: 'accent' },
    { path: 'components.markdown.link.foreground', kind: 'accent' },
  ],
};

export const ROLE_BORDERS: RoleAssignmentOptions = {
  roleId: 'role-borders',
  helper: 'Borders, dividers, and separators',
  intensities: ROLE_INTENSITIES,
  targets: [
    { path: 'semantic.colors.border', kind: 'border' },
    { path: 'semantic.colors.divider', kind: 'border' },
  ],
};

/** All interface role definitions in display order */
export const ALL_ROLES: RoleAssignmentOptions[] = [
  ROLE_SURFACES,
  ROLE_HEADER,
  ROLE_USER_MESSAGES,
  ROLE_ASSISTANT_MESSAGES,
  ROLE_PRIMARY_ACTIONS,
  ROLE_INPUT,
  ROLE_LINKS_FOCUS,
  ROLE_BORDERS,
];

// ─── Resolution ─────────────────────────────────────────────────

/**
 * Resolve a role assignment (family + intensity) into concrete token writes.
 *
 * Returns a map of `{ "theme.{path}": "palette.colors.{family}.{shade}" }`.
 * The `theme.` prefix is added so callers can pass the result directly to
 * `state.setBatch()`.
 */
export function resolveRoleAssignment(
  family: string,
  intensity: string,
  role: RoleAssignmentOptions
): Record<string, string> {
  const writes: Record<string, string> = {};
  const f = family === 'neutral' ? 'gray' : family;

  for (const target of role.targets) {
    const value = resolveTarget(f, intensity, target, role.roleId);
    writes[`theme.${target.path}`] = value;
    writes[`darkTheme.${target.path}`] = value;
  }

  // For primary-actions, also write the hover shade (one step darker than default)
  if (role.roleId === 'role-primary-actions') {
    const hoverValue = intensity === 'solid'
      ? `palette.colors.${f}.700`
      : `palette.colors.${f}.200`;
    writes['theme.semantic.colors.interactive.hover'] = hoverValue;
    writes['darkTheme.semantic.colors.interactive.hover'] = hoverValue;
  }

  return writes;
}

function resolveTarget(
  family: string,
  intensity: string,
  target: RoleTarget,
  roleId: string
): string {
  const solid = intensity === 'solid';

  // Header has nuanced per-sub-target shading
  if (roleId === 'role-header') {
    return resolveHeaderTarget(family, solid, target);
  }

  // Input has special handling — foreground target is the placeholder
  if (roleId === 'role-input') {
    return resolveInputTarget(family, solid, target);
  }

  switch (target.kind) {
    case 'background':
      return solid
        ? `palette.colors.${family}.500`
        : `palette.colors.${family}.${family === 'gray' ? '50' : '100'}`;
    case 'foreground':
      return solid
        ? `palette.colors.${family === 'gray' ? 'gray' : family}.50`
        : `palette.colors.${family === 'gray' ? 'gray' : family}.900`;
    case 'border':
      return solid
        ? `palette.colors.${family}.600`
        : `palette.colors.${family}.200`;
    case 'accent':
      return solid
        ? `palette.colors.${family}.600`
        : `palette.colors.${family}.400`;
  }
}

function resolveHeaderTarget(family: string, solid: boolean, target: RoleTarget): string {
  const path = target.path;

  if (path.endsWith('.background')) {
    return solid
      ? `palette.colors.${family}.500`
      : `palette.colors.${family}.${family === 'gray' ? '50' : '100'}`;
  }
  if (path.endsWith('.border')) {
    return solid
      ? `palette.colors.${family}.600`
      : `palette.colors.${family}.200`;
  }
  if (path.endsWith('.iconBackground')) {
    return solid
      ? `palette.colors.${family}.${family === 'gray' ? '700' : '600'}`
      : `palette.colors.${family}.500`;
  }
  if (path.endsWith('.iconForeground')) {
    return solid
      ? `palette.colors.${family}.50`
      : `palette.colors.${family}.50`;
  }
  if (path.endsWith('.titleForeground')) {
    return solid
      ? `palette.colors.${family}.50`
      : `palette.colors.${family}.${family === 'gray' ? '900' : '700'}`;
  }
  if (path.endsWith('.subtitleForeground')) {
    return solid
      ? `palette.colors.${family}.200`
      : `palette.colors.${family}.500`;
  }
  if (path.endsWith('.actionIconForeground')) {
    return solid
      ? `palette.colors.${family}.200`
      : `palette.colors.${family}.500`;
  }

  // Fallback
  return `palette.colors.${family}.500`;
}

function resolveInputTarget(family: string, solid: boolean, target: RoleTarget): string {
  const path = target.path;

  if (path.endsWith('.background')) {
    return solid
      ? `palette.colors.${family}.${family === 'gray' ? '100' : '50'}`
      : `palette.colors.${family}.${family === 'gray' ? '50' : '50'}`;
  }
  if (path.endsWith('.placeholder')) {
    return `palette.colors.${family}.${solid ? '400' : '400'}`;
  }
  if (path.endsWith('.border') || path.endsWith('.ring')) {
    return solid
      ? `palette.colors.${family}.500`
      : `palette.colors.${family}.400`;
  }

  return `palette.colors.${family}.500`;
}

// ─── Detection (reverse mapping) ────────────────────────────────

/** Result of detecting a role assignment from current state */
export interface DetectedRoleAssignment {
  family: RoleFamily;
  intensity: string;
}

/** Pattern: palette.colors.{family}.{shade} */
const PALETTE_REF_RE = /^palette\.colors\.(\w+)\.(\d+)$/;

/**
 * Detect the current role assignment by reading token values and matching
 * against known palette reference patterns.
 *
 * @param getValue - Function to read a theme token value (e.g., `(p) => state.get('theme.' + p)`)
 * @param role - The role definition to detect against
 * @returns Detected assignment or null if tokens don't match a known pattern
 */
export function detectRoleAssignment(
  getValue: (path: string) => unknown,
  role: RoleAssignmentOptions
): DetectedRoleAssignment | null {
  // Read the first background target (or first target of any kind) to determine the family
  const probeTarget = role.targets.find((t) => t.kind === 'background') ?? role.targets[0];
  if (!probeTarget) return null;

  const bgValue = String(getValue(probeTarget.path) ?? '');
  const bgMatch = bgValue.match(PALETTE_REF_RE);
  if (!bgMatch) return null;

  const detectedFamily = bgMatch[1] as string;
  const shade = bgMatch[2];

  // Normalize gray → gray (it's already the canonical name)
  const family = ROLE_FAMILIES.includes(detectedFamily as RoleFamily)
    ? (detectedFamily as RoleFamily)
    : null;
  if (!family) return null;

  // Try both intensities — shade-based guessing doesn't work for all target kinds
  for (const intensity of ['solid', 'soft'] as const) {
    const expected = resolveRoleAssignment(family, intensity, role);
    const allMatch = role.targets.every((t) => {
      const actual = String(getValue(t.path) ?? '');
      return actual === expected[`theme.${t.path}`];
    });
    if (allMatch) return { family, intensity };
  }

  return null;
}
