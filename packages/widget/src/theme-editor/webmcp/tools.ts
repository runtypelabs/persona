/**
 * WebMCP tool factory for the Persona theme editor.
 *
 * `createThemeEditorTools(state)` returns transport-agnostic tool definitions
 * designed for Agent Experience: intent-level operations (set brand colors,
 * assign a color role, set roundness…) rather than a 1:1 mapping of the ~150
 * editor fields. Two altitudes: high-level semantic tools plus a low-level
 * escape hatch (`set_theme_fields`): keep the catalog small without losing
 * coverage. Every mutation returns a compact summary + contrast warnings.
 */

import { createTheme } from '../../utils/theme';
import type { AgentWidgetConfig } from '../../types';
import type { PersonaTheme } from '../../types/theme';
import { generateColorScale, SHADE_KEYS } from '../color-utils';
import { ALL_ROLES, resolveRoleAssignment } from '../role-mappings';
import type { RoleAssignmentOptions, FieldDef } from '../types';
import { THEME_EDITOR_PRESETS, getThemeEditorPreset } from '../presets';
import { ALL_TABS, CONFIGURE_SUB_GROUPS } from '../sections';
import {
  toolResult,
  type WebMcpTool,
  type ThemeEditorLike,
  type EditTarget,
  type CreateThemeEditorToolsOptions,
} from './types';
import {
  coerceColor,
  coerceFamily,
  coerceIntensity,
  coerceScheme,
  coerceRoundnessStyle,
  coerceRadius,
  coerceTypographyRef,
  ROLE_FAMILY_NAMES,
  FONT_FAMILY_REFS,
  FONT_SIZE_REFS,
  FONT_WEIGHT_REFS,
  LINE_HEIGHT_REFS,
} from './coerce';
import {
  buildSummary,
  quickContrastWarnings,
  runContrastChecks,
  roleContrastPairKeys,
  RADIUS_PRESETS,
  roleKey,
  type ContrastWarning,
  type ContrastLevel,
} from './summary';

// ─── Role lookup ────────────────────────────────────────────────

const ROLE_ALIASES: Record<string, RoleAssignmentOptions> = {};
for (const role of ALL_ROLES) {
  const key = roleKey(role.roleId);
  ROLE_ALIASES[key] = role; // e.g. "user-messages"
  ROLE_ALIASES[role.roleId] = role; // e.g. "role-user-messages"
}
Object.assign(ROLE_ALIASES, {
  surface: ROLE_ALIASES['surfaces'],
  background: ROLE_ALIASES['surfaces'],
  backgrounds: ROLE_ALIASES['surfaces'],
  user: ROLE_ALIASES['user-messages'],
  'user-message': ROLE_ALIASES['user-messages'],
  assistant: ROLE_ALIASES['assistant-messages'],
  'assistant-message': ROLE_ALIASES['assistant-messages'],
  actions: ROLE_ALIASES['primary-actions'],
  buttons: ROLE_ALIASES['primary-actions'],
  composer: ROLE_ALIASES['input'],
  links: ROLE_ALIASES['links-focus'],
  focus: ROLE_ALIASES['links-focus'],
  border: ROLE_ALIASES['borders'],
  dividers: ROLE_ALIASES['borders'],
  scroll: ROLE_ALIASES['scroll-to-bottom'],
});

function coerceRole(input: unknown): RoleAssignmentOptions {
  const key = String(input ?? '').trim().toLowerCase();
  const role = ROLE_ALIASES[key];
  if (!role) {
    const valid = ALL_ROLES.map((r) => roleKey(r.roleId)).join(', ');
    throw new Error(`Unknown role "${input}". Valid roles: ${valid}.`);
  }
  return role;
}

// ─── Field index (escape hatch) ─────────────────────────────────

function buildFieldIndex(): Map<string, FieldDef> {
  const index = new Map<string, FieldDef>();
  const addSections = (sections: { fields: FieldDef[] }[]) => {
    for (const section of sections) {
      for (const field of section.fields) {
        if (!index.has(field.id)) index.set(field.id, field);
      }
    }
  };
  for (const tab of ALL_TABS) addSections(tab.sections);
  for (const group of CONFIGURE_SUB_GROUPS) addSections(group.sections);
  return index;
}

// ─── Config-tool path maps ──────────────────────────────────────

const FEATURE_PATHS: Record<string, string> = {
  voice: 'voiceRecognition.enabled',
  artifacts: 'features.artifacts.enabled',
  attachments: 'attachments.enabled',
  toolCalls: 'features.showToolCalls',
  reasoning: 'features.showReasoning',
  feedback: 'messageActions.enabled',
};

const LAYOUT_PATHS: Record<string, string> = {
  avatars: 'layout.messages.avatar.show',
  timestamps: 'layout.messages.timestamp.show',
  showHeader: 'layout.showHeader',
  messageStyle: 'layout.messages.layout',
};

const LAUNCHER_POSITIONS = ['bottom-right', 'bottom-left', 'top-right', 'top-left'];
const MESSAGE_STYLES = ['bubble', 'flat', 'minimal'];

const COPY_PATHS: Record<string, string> = {
  title: 'copy.welcomeTitle',
  subtitle: 'copy.welcomeSubtitle',
  placeholder: 'copy.inputPlaceholder',
  sendLabel: 'copy.sendButtonLabel',
};

// ─── Factory ────────────────────────────────────────────────────

export function createThemeEditorTools(
  state: ThemeEditorLike,
  options?: CreateThemeEditorToolsOptions
): WebMcpTool[] {
  let editTarget: EditTarget = options?.editTarget ?? 'both';
  let fieldIndex: Map<string, FieldDef> | null = null;

  const rec = (input: unknown): Record<string, unknown> =>
    input && typeof input === 'object' ? (input as Record<string, unknown>) : {};

  /** Expand a theme-relative path to light/dark writes per editTarget. */
  const expandScoped = (
    themeRelPath: string,
    value: unknown,
    target: EditTarget = editTarget
  ): Record<string, unknown> => {
    const out: Record<string, unknown> = {};
    if (target === 'light' || target === 'both') out[`theme.${themeRelPath}`] = value;
    if (target === 'dark' || target === 'both') out[`darkTheme.${themeRelPath}`] = value;
    return out;
  };

  /** Drop light/dark writes that fall outside the current editTarget. */
  const filterByEditTarget = (writes: Record<string, string>): Record<string, string> => {
    if (editTarget === 'both') return writes;
    const out: Record<string, string> = {};
    for (const [k, v] of Object.entries(writes)) {
      if (editTarget === 'light' && k.startsWith('theme.')) out[k] = v;
      else if (editTarget === 'dark' && k.startsWith('darkTheme.')) out[k] = v;
    }
    return out;
  };

  /** Which variant a color mutation should be contrast-checked against. */
  const warnVariant = (): 'light' | 'dark' => (editTarget === 'dark' ? 'dark' : 'light');

  const result = (applied: unknown, warnings: ContrastWarning[] = []) =>
    toolResult({ ok: true, summary: buildSummary(state), warnings, applied });

  // ── Tools ──────────────────────────────────────────────────

  const getThemeOverview: WebMcpTool = {
    name: 'get_theme_overview',
    title: 'Get current theme & what is editable',
    description:
      'Read the current widget theme (brand colors, per-role color assignments, typography, roundness, color scheme, undo/redo state), the available presets, and the high-level levers you can change. Call this FIRST before editing.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        verbosity: {
          type: 'string',
          enum: ['summary', 'full'],
          description: "Use 'full' to also include the field-id index for set_theme_fields.",
        },
      },
      additionalProperties: false,
    },
    execute(input) {
      const { verbosity } = rec(input);
      const payload: Record<string, unknown> = {
        summary: buildSummary(state),
        availableRoles: ALL_ROLES.map((r) => ({
          role: roleKey(r.roleId),
          helper: r.helper,
        })),
        availableFamilies: ROLE_FAMILY_NAMES,
        presets: THEME_EDITOR_PRESETS.map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          tags: p.tags ?? [],
        })),
        tools: [
          { tool: 'set_brand_colors', hint: 'Recolor the palette (primary/secondary/accent): auto-generates shade scales.' },
          { tool: 'assign_color_role', hint: 'Recolor a region (header, user/assistant messages, actions, input, links, borders, surfaces, scroll) with a family + intensity.' },
          { tool: 'set_typography', hint: 'Set font family, size, weight, line height.' },
          { tool: 'set_roundness', hint: 'Set corner roundness (sharp/default/rounded/pill) or granular radii.' },
          { tool: 'set_color_scheme', hint: 'Set light/dark/auto and which variant edits target.' },
          { tool: 'apply_preset', hint: 'Apply a complete built-in preset.' },
          { tool: 'configure_widget', hint: 'Toggle launcher position, features, and layout.' },
          { tool: 'set_copy_and_suggestions', hint: 'Set welcome copy, placeholder, and suggestion chips.' },
          { tool: 'set_theme_fields', hint: 'Advanced escape hatch: set any field by id or dot-path.' },
          { tool: 'check_contrast', hint: 'Audit WCAG contrast across key text/background pairs.' },
          { tool: 'manage_session', hint: 'Undo, redo, reset, or export the theme.' },
        ],
      };
      if (verbosity === 'full') {
        fieldIndex ??= buildFieldIndex();
        payload.fieldIndex = Array.from(fieldIndex.values()).map((f) => ({
          id: f.id,
          path: f.path,
          type: f.type,
          label: f.label,
          options: f.options?.map((o) => o.value),
        }));
      }
      return toolResult(payload);
    },
  };

  const setBrandColors: WebMcpTool = {
    name: 'set_brand_colors',
    title: 'Set brand colors',
    description:
      'Set one or more brand colors (primary, secondary, accent). Each color auto-generates a full 50–950 shade scale and applies to the light and dark themes (per the current edit target). Accepts hex ("#2563eb", "2563eb", "#18f"), rgb()/rgba() ("rgb(37, 99, 235)"), or CSS color names ("blue", "slateblue").',
    inputSchema: {
      type: 'object',
      properties: {
        primary: { type: 'string', description: 'Hex, rgb()/rgba(), or CSS color name.' },
        secondary: { type: 'string', description: 'Hex, rgb()/rgba(), or CSS color name.' },
        accent: { type: 'string', description: 'Hex, rgb()/rgba(), or CSS color name.' },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const families: Array<'primary' | 'secondary' | 'accent'> = ['primary', 'secondary', 'accent'];
      const writes: Record<string, unknown> = {};
      const applied: Record<string, string> = {};

      for (const family of families) {
        if (args[family] === undefined) continue;
        const base = coerceColor(args[family]);
        applied[family] = base;
        const scale = generateColorScale(base);
        for (const shade of SHADE_KEYS) {
          const value = scale[shade];
          if (value === undefined) continue;
          Object.assign(writes, expandScoped(`palette.colors.${family}.${shade}`, value));
        }
      }

      if (Object.keys(applied).length === 0) {
        throw new Error('Provide at least one of: primary, secondary, accent.');
      }

      state.setBatch(writes);
      const warnings = quickContrastWarnings(
        state,
        ['primary-button', 'user-message'],
        warnVariant()
      );
      return result(applied, warnings);
    },
  };

  const assignColorRole: WebMcpTool = {
    name: 'assign_color_role',
    title: 'Assign a color family to an interface role',
    description:
      'Recolor a semantic region of the widget by choosing a palette family and intensity. One call writes all related tokens (background, text, border, icon) consistently. Roles: header, user-messages, assistant-messages, primary-actions, input, links, borders, surfaces, scroll-to-bottom. Families: primary, secondary, accent, neutral. Intensity: solid (bold) or soft (tinted).',
    inputSchema: {
      type: 'object',
      properties: {
        role: { type: 'string', description: 'Interface role, e.g. "header" or "user-messages".' },
        family: { type: 'string', enum: ROLE_FAMILY_NAMES },
        intensity: { type: 'string', enum: ['solid', 'soft'], description: "Defaults to 'solid'." },
      },
      required: ['role', 'family'],
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const role = coerceRole(args.role);
      const family = coerceFamily(args.family, true);
      const intensity = coerceIntensity(args.intensity);

      const writes = filterByEditTarget(resolveRoleAssignment(family, intensity, role));
      const tokensWritten = Object.keys(writes).length;
      state.setBatch(writes);

      const warnings = quickContrastWarnings(state, roleContrastPairKeys(role), warnVariant());
      return result(
        { role: roleKey(role.roleId), family, intensity, tokensWritten },
        warnings
      );
    },
  };

  const setTypography: WebMcpTool = {
    name: 'set_typography',
    title: 'Set typography',
    description:
      'Set font family, base size, weight, and line height in one call. fontFamily: sans|serif|mono. fontSize: xs|sm|base|lg|xl. fontWeight: normal|medium|semibold|bold (or 400–700). lineHeight: tight|normal|relaxed (or 1.25/1.5/1.625).',
    inputSchema: {
      type: 'object',
      properties: {
        fontFamily: { type: 'string' },
        fontSize: { type: 'string' },
        fontWeight: { type: ['string', 'number'] },
        lineHeight: { type: ['string', 'number'] },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const writes: Record<string, unknown> = {};
      const applied: Record<string, string> = {};

      const apply = (
        key: 'fontFamily' | 'fontSize' | 'fontWeight' | 'lineHeight',
        refs: Record<string, string>
      ) => {
        if (args[key] === undefined) return;
        const ref = coerceTypographyRef(args[key], refs, key);
        applied[key] = ref.split('.').pop() ?? ref;
        Object.assign(writes, expandScoped(`semantic.typography.${key}`, ref));
      };

      apply('fontFamily', FONT_FAMILY_REFS);
      apply('fontSize', FONT_SIZE_REFS);
      apply('fontWeight', FONT_WEIGHT_REFS);
      apply('lineHeight', LINE_HEIGHT_REFS);

      if (Object.keys(applied).length === 0) {
        throw new Error('Provide at least one of: fontFamily, fontSize, fontWeight, lineHeight.');
      }
      state.setBatch(writes);
      return result(applied);
    },
  };

  const setRoundness: WebMcpTool = {
    name: 'set_roundness',
    title: 'Set corner roundness',
    description:
      'Set overall corner roundness with a keyword (sharp, default, rounded, pill) which maps the full radius scale, OR pass granular radius values. Provide at least one of `style` or `radius`.',
    inputSchema: {
      type: 'object',
      properties: {
        style: { type: 'string', enum: ['sharp', 'default', 'rounded', 'pill'] },
        radius: {
          type: 'object',
          description: 'Granular overrides (px number or CSS length).',
          properties: {
            sm: { type: ['string', 'number'] },
            md: { type: ['string', 'number'] },
            lg: { type: ['string', 'number'] },
            xl: { type: ['string', 'number'] },
            full: { type: ['string', 'number'] },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const writes: Record<string, unknown> = {};
      const applied: Record<string, unknown> = {};

      if (args.style !== undefined) {
        const style = coerceRoundnessStyle(args.style);
        applied.style = style;
        for (const [key, value] of Object.entries(RADIUS_PRESETS[style])) {
          Object.assign(writes, expandScoped(`palette.radius.${key}`, value));
        }
      }

      if (args.radius !== undefined) {
        const radius = rec(args.radius);
        const overrides: Record<string, string> = {};
        for (const key of ['sm', 'md', 'lg', 'xl', 'full']) {
          if (radius[key] === undefined) continue;
          const value = coerceRadius(radius[key]);
          overrides[key] = value;
          Object.assign(writes, expandScoped(`palette.radius.${key}`, value));
        }
        applied.radius = overrides;
      }

      if (Object.keys(writes).length === 0) {
        throw new Error('Provide `style` (sharp|default|rounded|pill) or a `radius` object.');
      }
      state.setBatch(writes);
      return result(applied);
    },
  };

  const setColorScheme: WebMcpTool = {
    name: 'set_color_scheme',
    title: 'Set color scheme',
    description:
      'Set the shipped widget color scheme (light, dark, or auto/follow-system). Optionally set `editTarget` to choose which theme variant subsequent styling edits write to (light, dark, or both: default both).',
    inputSchema: {
      type: 'object',
      properties: {
        scheme: { type: 'string', enum: ['light', 'dark', 'auto'] },
        editTarget: { type: 'string', enum: ['light', 'dark', 'both'] },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const applied: Record<string, unknown> = {};
      if (args.scheme !== undefined) {
        const scheme = coerceScheme(args.scheme);
        state.set('colorScheme', scheme);
        applied.scheme = scheme;
      }
      if (args.editTarget !== undefined) {
        const t = String(args.editTarget).trim().toLowerCase();
        if (t !== 'light' && t !== 'dark' && t !== 'both') {
          throw new Error(`Unknown editTarget "${args.editTarget}". Valid: light, dark, both.`);
        }
        editTarget = t;
        applied.editTarget = t;
      }
      if (Object.keys(applied).length === 0) {
        throw new Error('Provide `scheme` and/or `editTarget`.');
      }
      return toolResult({ ok: true, summary: buildSummary(state), warnings: [], applied, editTarget });
    },
  };

  const applyPreset: WebMcpTool = {
    name: 'apply_preset',
    title: 'Apply a built-in theme preset',
    description:
      'Apply a complete built-in preset, replacing theme tokens. Call get_theme_overview to list preset ids.',
    inputSchema: {
      type: 'object',
      properties: { presetId: { type: 'string' } },
      required: ['presetId'],
      additionalProperties: false,
    },
    execute(input) {
      const { presetId } = rec(input);
      const preset = getThemeEditorPreset(String(presetId ?? ''));
      if (!preset) {
        const valid = THEME_EDITOR_PRESETS.map((p) => p.id).join(', ');
        throw new Error(`Unknown preset "${presetId}". Valid presets: ${valid}.`);
      }
      const theme = createTheme(preset.theme, { validate: false });
      const config: AgentWidgetConfig = { ...state.getConfig() };
      if (preset.darkTheme) {
        config.darkTheme = createTheme(preset.darkTheme, { validate: false }) as PersonaTheme;
      }
      if (preset.toolCall) config.toolCall = preset.toolCall;
      state.setFullConfig(config, theme);
      const warnings = quickContrastWarnings(state, ['body', 'assistant-message'], 'light');
      return result({ appliedPreset: { id: preset.id, name: preset.name } }, warnings);
    },
  };

  const configureWidget: WebMcpTool = {
    name: 'configure_widget',
    title: 'Configure launcher, features, and layout',
    description:
      'Toggle non-theme widget configuration. launcherPosition: bottom-right|bottom-left|top-right|top-left. features: { voice, artifacts, attachments, toolCalls, reasoning, feedback } booleans. layout: { avatars, timestamps, showHeader } booleans and messageStyle: bubble|flat|minimal.',
    inputSchema: {
      type: 'object',
      properties: {
        launcherPosition: { type: 'string', enum: LAUNCHER_POSITIONS },
        features: {
          type: 'object',
          properties: {
            voice: { type: 'boolean' },
            artifacts: { type: 'boolean' },
            attachments: { type: 'boolean' },
            toolCalls: { type: 'boolean' },
            reasoning: { type: 'boolean' },
            feedback: { type: 'boolean' },
          },
          additionalProperties: false,
        },
        layout: {
          type: 'object',
          properties: {
            avatars: { type: 'boolean' },
            timestamps: { type: 'boolean' },
            showHeader: { type: 'boolean' },
            messageStyle: { type: 'string', enum: MESSAGE_STYLES },
          },
          additionalProperties: false,
        },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const writes: Record<string, unknown> = {};
      const applied: Record<string, unknown> = {};

      if (args.launcherPosition !== undefined) {
        const pos = String(args.launcherPosition);
        if (!LAUNCHER_POSITIONS.includes(pos)) {
          throw new Error(`Unknown launcherPosition "${pos}". Valid: ${LAUNCHER_POSITIONS.join(', ')}.`);
        }
        writes['launcher.position'] = pos;
        applied.launcherPosition = pos;
      }

      const features = rec(args.features);
      for (const [key, path] of Object.entries(FEATURE_PATHS)) {
        if (features[key] === undefined) continue;
        writes[path] = Boolean(features[key]);
        (applied.features ??= {} as Record<string, boolean>);
        (applied.features as Record<string, boolean>)[key] = Boolean(features[key]);
      }

      const layout = rec(args.layout);
      for (const [key, path] of Object.entries(LAYOUT_PATHS)) {
        if (layout[key] === undefined) continue;
        if (key === 'messageStyle') {
          const style = String(layout[key]);
          if (!MESSAGE_STYLES.includes(style)) {
            throw new Error(`Unknown messageStyle "${style}". Valid: ${MESSAGE_STYLES.join(', ')}.`);
          }
          writes[path] = style;
          (applied.layout ??= {} as Record<string, unknown>);
          (applied.layout as Record<string, unknown>)[key] = style;
        } else {
          writes[path] = Boolean(layout[key]);
          (applied.layout ??= {} as Record<string, unknown>);
          (applied.layout as Record<string, unknown>)[key] = Boolean(layout[key]);
        }
      }

      if (Object.keys(writes).length === 0) {
        throw new Error('Provide launcherPosition, features, and/or layout.');
      }
      state.setBatch(writes);
      return result(applied);
    },
  };

  const setCopyAndSuggestions: WebMcpTool = {
    name: 'set_copy_and_suggestions',
    title: 'Set welcome copy and suggestion chips',
    description:
      'Set the widget welcome copy and suggestion chips. title/subtitle are the welcome card text; placeholder is the input placeholder; sendLabel is the send button label; suggestions is an array of suggestion-chip strings (replaces the existing list).',
    inputSchema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        subtitle: { type: 'string' },
        placeholder: { type: 'string' },
        sendLabel: { type: 'string' },
        suggestions: { type: 'array', items: { type: 'string' } },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const writes: Record<string, unknown> = {};
      const applied: Record<string, unknown> = {};

      for (const [key, path] of Object.entries(COPY_PATHS)) {
        if (args[key] === undefined) continue;
        writes[path] = String(args[key]);
        applied[key] = String(args[key]);
      }

      if (args.suggestions !== undefined) {
        if (!Array.isArray(args.suggestions)) {
          throw new Error('`suggestions` must be an array of strings.');
        }
        const chips = args.suggestions.filter((s): s is string => typeof s === 'string');
        writes['suggestionChips'] = chips;
        applied.suggestions = chips;
      }

      if (Object.keys(writes).length === 0) {
        throw new Error('Provide at least one of: title, subtitle, placeholder, sendLabel, suggestions.');
      }
      state.setBatch(writes);
      return result(applied);
    },
  };

  const setThemeFields: WebMcpTool = {
    name: 'set_theme_fields',
    title: 'Set theme fields by id or path (advanced)',
    description:
      'Advanced escape hatch: set individual editor fields by field id (see get_theme_overview verbosity:"full"), theme field ids follow the current edit target (light/dark/both), or by raw dot-path (theme.* / darkTheme.* / a config path), which is written as-is. Use only when a higher-level tool does not cover the need. Values are validated against the field metadata.',
    inputSchema: {
      type: 'object',
      properties: {
        updates: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              field: { type: 'string', description: 'Field id or dot-path.' },
              value: { type: ['string', 'number', 'boolean'] },
            },
            required: ['field', 'value'],
            additionalProperties: false,
          },
        },
      },
      required: ['updates'],
      additionalProperties: false,
    },
    execute(input) {
      const { updates } = rec(input);
      if (!Array.isArray(updates) || updates.length === 0) {
        throw new Error('`updates` must be a non-empty array of { field, value }.');
      }
      fieldIndex ??= buildFieldIndex();

      const writes: Record<string, unknown> = {};
      const report: Array<{
        field: string;
        resolvedPath?: string | string[];
        ok: boolean;
        error?: string;
      }> = [];

      for (const raw of updates) {
        const entry = rec(raw);
        const fieldKey = String(entry.field ?? '');
        try {
          const def = fieldIndex.get(fieldKey);
          const path = def ? def.path : fieldKey;
          if (!def && !/^(theme|darkTheme)\.|\./.test(path)) {
            // A bare token with no field def and no dotted path is ambiguous.
            throw new Error(
              `Unknown field "${fieldKey}". Pass a known field id or a dot-path (e.g. theme.palette.radius.md).`
            );
          }
          const value = coerceFieldValue(def, entry.value);
          if (def && path.startsWith('theme.')) {
            // Field ids resolve to light-theme paths; honor the active edit
            // target so dark-only / both edits are reachable by id (not only by
            // raw darkTheme.* dot-path).
            const scoped = expandScoped(path.slice('theme.'.length), value);
            Object.assign(writes, scoped);
            report.push({ field: fieldKey, resolvedPath: Object.keys(scoped), ok: true });
          } else {
            writes[path] = value;
            report.push({ field: fieldKey, resolvedPath: path, ok: true });
          }
        } catch (err) {
          report.push({ field: fieldKey, ok: false, error: (err as Error).message });
        }
      }

      const okWrites = report.filter((r) => r.ok);
      if (Object.keys(writes).length > 0) state.setBatch(writes);
      return toolResult({
        ok: okWrites.length > 0,
        summary: buildSummary(state),
        warnings: [],
        applied: { updates: report },
      });
    },
  };

  const checkContrast: WebMcpTool = {
    name: 'check_contrast',
    title: 'Check accessibility contrast',
    description:
      'Run WCAG contrast checks over the key text/background pairs (message text, header title, input/body text, primary button). Returns each ratio, whether it passes, and a suggested foreground shade for failures.',
    annotations: { readOnlyHint: true },
    inputSchema: {
      type: 'object',
      properties: {
        level: { type: 'string', enum: ['AA', 'AAA'], description: "Defaults to 'AA'." },
        variant: { type: 'string', enum: ['light', 'dark', 'both'], description: "Defaults to 'both'." },
      },
      additionalProperties: false,
    },
    execute(input) {
      const args = rec(input);
      const level = (args.level === 'AAA' ? 'AAA' : 'AA') as ContrastLevel;
      const variant =
        args.variant === 'light' || args.variant === 'dark' ? args.variant : 'both';
      const report = runContrastChecks(state, level, variant);
      return toolResult({
        level: report.level,
        passing: report.checks.length - report.failures.length,
        total: report.checks.length,
        checks: report.checks,
        failures: report.failures,
      });
    },
  };

  const manageSession: WebMcpTool = {
    name: 'manage_session',
    title: 'Undo, redo, reset, or export the theme',
    description:
      'Session action. "undo"/"redo" step through edit history; "reset" restores defaults; "export" returns the embeddable theme snapshot (config + theme JSON) with no side effects.',
    inputSchema: {
      type: 'object',
      properties: { action: { type: 'string', enum: ['undo', 'redo', 'reset', 'export'] } },
      required: ['action'],
      additionalProperties: false,
    },
    execute(input) {
      const { action } = rec(input);
      switch (action) {
        case 'undo':
          state.undo();
          return result({ action: 'undo' });
        case 'redo':
          state.redo();
          return result({ action: 'redo' });
        case 'reset':
          state.resetToDefaults();
          return result({ action: 'reset' });
        case 'export':
          return toolResult({ ok: true, snapshot: state.exportSnapshot() });
        default:
          throw new Error(`Unknown action "${action}". Valid: undo, redo, reset, export.`);
      }
    },
  };

  return [
    getThemeOverview,
    setBrandColors,
    assignColorRole,
    setTypography,
    setRoundness,
    setColorScheme,
    applyPreset,
    configureWidget,
    setCopyAndSuggestions,
    setThemeFields,
    checkContrast,
    manageSession,
  ];
}

// ─── Field value validation (escape hatch) ──────────────────────

function coerceFieldValue(def: FieldDef | undefined, value: unknown): unknown {
  if (!def) return value;

  switch (def.type) {
    case 'color':
      return def.parseValue ? def.parseValue(coerceColor(value)) : coerceColor(value);
    case 'toggle':
      return typeof value === 'boolean' ? value : value === 'true' || value === 1;
    case 'slider': {
      const num = Number(value);
      if (!Number.isFinite(num)) throw new Error(`"${def.id}" expects a number.`);
      if (def.slider) {
        const { min, max } = def.slider;
        if (num < min || num > max) {
          throw new Error(`"${def.id}" must be between ${min} and ${max}.`);
        }
      }
      return def.parseValue ? def.parseValue(num) : num;
    }
    case 'select': {
      const str = String(value);
      if (def.options && !def.options.some((o) => o.value === str)) {
        throw new Error(
          `"${def.id}" must be one of: ${def.options.map((o) => o.value).join(', ')}.`
        );
      }
      return def.parseValue ? def.parseValue(str) : str;
    }
    default:
      return def.parseValue ? def.parseValue(value) : value;
  }
}
