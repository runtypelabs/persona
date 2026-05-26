/** WebMCP integration — exposes theme editor actions as tools to AI agents.
 *
 *  Implements the WebMCP draft API
 *  (https://webmachinelearning.github.io/webmcp/) by registering tools on
 *  `navigator.modelContext`. When the API is not available the file is a no-op,
 *  so it is safe to import unconditionally.
 */

import {
  generateColorScale,
  hexToHsl,
  hslToHex,
  isValidHex,
  normalizeColorValue,
} from './color-utils';
import { applyPreset, getAllPresets, saveCustomPreset } from './presets';
import * as state from './state';

interface ModelContextToolAnnotations {
  readOnlyHint?: boolean;
  untrustedContentHint?: boolean;
}

interface ModelContextTool {
  name: string;
  title?: string;
  description: string;
  inputSchema?: Record<string, unknown>;
  execute: (input: Record<string, unknown>) => Promise<unknown> | unknown;
  annotations?: ModelContextToolAnnotations;
}

interface ModelContextLike {
  registerTool: (
    tool: ModelContextTool,
    options?: { signal?: AbortSignal }
  ) => unknown;
}

function getModelContext(): ModelContextLike | null {
  if (typeof navigator === 'undefined') return null;
  const candidate = (navigator as unknown as { modelContext?: ModelContextLike })
    .modelContext;
  return candidate && typeof candidate.registerTool === 'function'
    ? candidate
    : null;
}

function describePreset(preset: ReturnType<typeof getAllPresets>[number]): {
  id: string;
  name: string;
  description: string;
  builtIn: boolean;
} {
  return {
    id: preset.id,
    name: preset.label,
    description: preset.description,
    builtIn: preset.builtIn,
  };
}

function buildBrandColorUpdates(hex: string): Record<string, string> {
  const { h, s, l } = hexToHsl(hex);
  const primary = generateColorScale(hex);
  const secondary = generateColorScale(
    hslToHex(h + 26, Math.min(1, s * 0.92), l)
  );
  const accent = generateColorScale(
    hslToHex(h - 24, Math.min(1, s * 1.04), Math.min(0.72, l + 0.04))
  );

  const updates: Record<string, string> = {};
  for (const [shade, value] of Object.entries(primary)) {
    updates[`theme.palette.colors.primary.${shade}`] = value!;
    updates[`darkTheme.palette.colors.primary.${shade}`] = value!;
  }
  for (const [shade, value] of Object.entries(secondary)) {
    updates[`theme.palette.colors.secondary.${shade}`] = value!;
    updates[`darkTheme.palette.colors.secondary.${shade}`] = value!;
  }
  for (const [shade, value] of Object.entries(accent)) {
    updates[`theme.palette.colors.accent.${shade}`] = value!;
    updates[`darkTheme.palette.colors.accent.${shade}`] = value!;
  }

  updates['theme.semantic.colors.primary'] = 'palette.colors.primary.500';
  updates['theme.semantic.colors.accent'] = 'palette.colors.accent.500';
  updates['theme.semantic.colors.interactive.default'] =
    'palette.colors.primary.500';
  updates['theme.semantic.colors.interactive.hover'] =
    'palette.colors.primary.600';
  updates['darkTheme.semantic.colors.primary'] = 'palette.colors.primary.400';
  updates['darkTheme.semantic.colors.accent'] = 'palette.colors.accent.400';
  updates['darkTheme.semantic.colors.interactive.default'] =
    'palette.colors.primary.400';
  updates['darkTheme.semantic.colors.interactive.hover'] =
    'palette.colors.primary.300';

  return updates;
}

const PREVIEW_SCENES = ['home', 'conversation', 'minimized', 'artifact'] as const;
const PREVIEW_MODES = ['light', 'dark', 'system'] as const;
const PREVIEW_DEVICES = ['desktop', 'mobile'] as const;
const EDITING_THEMES = ['light', 'dark'] as const;

function buildTools(): ModelContextTool[] {
  return [
    {
      name: 'list_presets',
      title: 'List theme presets',
      description:
        'Return every available theme preset (built-in and custom). Use the returned id with `apply_preset`.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ presets: getAllPresets().map(describePreset) }),
    },
    {
      name: 'apply_preset',
      title: 'Apply a theme preset',
      description:
        'Apply a preset to the editor. Accepts either the preset `id` or its human-readable `name` (case-insensitive). The widget preview updates immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          id: { type: 'string', description: 'Preset id from `list_presets`.' },
          name: {
            type: 'string',
            description: 'Preset display name (used if `id` is omitted).',
          },
        },
        additionalProperties: false,
      },
      execute: (input) => {
        const id = typeof input.id === 'string' ? input.id : undefined;
        const name = typeof input.name === 'string' ? input.name : undefined;
        if (!id && !name) {
          throw new Error('Provide either `id` or `name`.');
        }
        const presets = getAllPresets();
        const target = presets.find((p) => {
          if (id && p.id === id) return true;
          if (name && p.label.toLowerCase() === name.toLowerCase()) return true;
          return false;
        });
        if (!target) {
          throw new Error(
            `No preset found matching ${id ? `id="${id}"` : `name="${name}"`}.`
          );
        }
        applyPreset(target);
        return { applied: describePreset(target) };
      },
    },
    {
      name: 'generate_theme_from_brand_color',
      title: 'Generate theme from brand color',
      description:
        'Generate a primary, secondary, and accent color scale (and matching semantic tokens) from a single brand hex color. Mirrors the in-editor brand color wizard.',
      inputSchema: {
        type: 'object',
        properties: {
          color: {
            type: 'string',
            description: '6-digit hex color (e.g. "#3B82F6").',
          },
        },
        required: ['color'],
        additionalProperties: false,
      },
      execute: (input) => {
        const raw = typeof input.color === 'string' ? input.color : '';
        const normalized = normalizeColorValue(raw);
        if (!isValidHex(normalized)) {
          throw new Error('`color` must be a valid 6-digit hex value.');
        }
        const updates = buildBrandColorUpdates(normalized);
        state.setBatch(updates);
        return { applied: { color: normalized, updatedPaths: Object.keys(updates).length } };
      },
    },
    {
      name: 'get_theme_value',
      title: 'Get a theme or config value',
      description:
        'Read a single value from the current config/theme by dot-path. Paths starting with `theme.` read the light theme; `darkTheme.` reads the dark theme; otherwise reads the widget config.',
      inputSchema: {
        type: 'object',
        properties: {
          path: {
            type: 'string',
            description:
              'Dot-path such as "theme.semantic.colors.primary" or "launcher.position".',
          },
        },
        required: ['path'],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: (input) => {
        const path = typeof input.path === 'string' ? input.path : '';
        if (!path) throw new Error('`path` is required.');
        return { path, value: state.get(path) ?? null };
      },
    },
    {
      name: 'set_theme_value',
      title: 'Set a theme or config value',
      description:
        'Update a single value at a dot-path. Use `theme.*` for light theme, `darkTheme.*` for dark theme, otherwise widget config. Preview updates immediately.',
      inputSchema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          value: {
            description:
              'New value. Can be a string, number, boolean, array, or object — whatever the path expects.',
          },
        },
        required: ['path', 'value'],
        additionalProperties: false,
      },
      execute: (input) => {
        const path = typeof input.path === 'string' ? input.path : '';
        if (!path) throw new Error('`path` is required.');
        state.setImmediate(path, input.value);
        return { path, value: state.get(path) ?? null };
      },
    },
    {
      name: 'set_theme_values',
      title: 'Batch update theme and config values',
      description:
        'Apply several path/value updates atomically. Object keys are dot-paths. Useful for coordinated changes (e.g. matching light and dark theme tokens).',
      inputSchema: {
        type: 'object',
        properties: {
          updates: {
            type: 'object',
            description:
              'Map of dot-path to new value. Example: { "theme.semantic.colors.primary": "#3B82F6" }',
            additionalProperties: true,
          },
        },
        required: ['updates'],
        additionalProperties: false,
      },
      execute: (input) => {
        const updates = input.updates;
        if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
          throw new Error('`updates` must be an object of path -> value.');
        }
        state.setBatch(updates as Record<string, unknown>);
        return { updated: Object.keys(updates).length };
      },
    },
    {
      name: 'export_snapshot',
      title: 'Export current theme snapshot',
      description:
        'Return the full current snapshot (`{ version, config, theme }`) so it can be saved, shared, or re-imported later.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      annotations: { readOnlyHint: true },
      execute: () => ({ snapshot: state.exportSnapshot() }),
    },
    {
      name: 'import_snapshot',
      title: 'Import a theme snapshot',
      description:
        'Replace the current config and theme with the supplied snapshot. Accepts either a v2 snapshot object (`{ version, config, theme }`) or a bare PersonaTheme.',
      inputSchema: {
        type: 'object',
        properties: {
          snapshot: {
            type: 'object',
            description: 'Snapshot object previously returned by `export_snapshot`.',
            additionalProperties: true,
          },
        },
        required: ['snapshot'],
        additionalProperties: false,
      },
      annotations: { untrustedContentHint: true },
      execute: (input) => {
        if (!input.snapshot || typeof input.snapshot !== 'object') {
          throw new Error('`snapshot` must be an object.');
        }
        state.importSnapshot(input.snapshot);
        return { ok: true };
      },
    },
    {
      name: 'reset_theme',
      title: 'Reset theme editor',
      description: 'Reset the editor to its default config and theme, discarding all unsaved changes.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => {
        state.resetToDefaults();
        return { ok: true };
      },
    },
    {
      name: 'undo',
      title: 'Undo last theme change',
      description: 'Step backwards in the editor history.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => {
        if (!state.canUndo()) return { ok: false, reason: 'Nothing to undo.' };
        state.undo();
        return { ok: true };
      },
    },
    {
      name: 'redo',
      title: 'Redo last undone change',
      description: 'Step forwards in the editor history.',
      inputSchema: { type: 'object', properties: {}, additionalProperties: false },
      execute: () => {
        if (!state.canRedo()) return { ok: false, reason: 'Nothing to redo.' };
        state.redo();
        return { ok: true };
      },
    },
    {
      name: 'save_custom_preset',
      title: 'Save current theme as a custom preset',
      description:
        'Persist the current config + theme as a named custom preset (stored in localStorage). Overwrites an existing custom preset with the same name.',
      inputSchema: {
        type: 'object',
        properties: {
          name: { type: 'string', description: 'Preset display name.' },
        },
        required: ['name'],
        additionalProperties: false,
      },
      execute: (input) => {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (!name) throw new Error('`name` is required.');
        const ok = saveCustomPreset(name);
        if (!ok) throw new Error('Failed to save custom preset.');
        return { ok: true, name };
      },
    },
    {
      name: 'set_preview_scene',
      title: 'Set preview scene',
      description:
        'Change which scene the preview renders (conversation, home, minimized, or artifact).',
      inputSchema: {
        type: 'object',
        properties: {
          scene: { type: 'string', enum: [...PREVIEW_SCENES] },
        },
        required: ['scene'],
        additionalProperties: false,
      },
      execute: (input) => {
        const scene = input.scene as (typeof PREVIEW_SCENES)[number];
        if (!PREVIEW_SCENES.includes(scene)) {
          throw new Error(`scene must be one of ${PREVIEW_SCENES.join(', ')}.`);
        }
        state.setPreviewScene(scene);
        return { scene };
      },
    },
    {
      name: 'set_preview_mode',
      title: 'Set preview color scheme',
      description: 'Force the preview into light, dark, or system mode.',
      inputSchema: {
        type: 'object',
        properties: {
          mode: { type: 'string', enum: [...PREVIEW_MODES] },
        },
        required: ['mode'],
        additionalProperties: false,
      },
      execute: (input) => {
        const mode = input.mode as (typeof PREVIEW_MODES)[number];
        if (!PREVIEW_MODES.includes(mode)) {
          throw new Error(`mode must be one of ${PREVIEW_MODES.join(', ')}.`);
        }
        state.setPreviewMode(mode);
        return { mode };
      },
    },
    {
      name: 'set_preview_device',
      title: 'Set preview device',
      description: 'Toggle the preview viewport between desktop and mobile.',
      inputSchema: {
        type: 'object',
        properties: {
          device: { type: 'string', enum: [...PREVIEW_DEVICES] },
        },
        required: ['device'],
        additionalProperties: false,
      },
      execute: (input) => {
        const device = input.device as (typeof PREVIEW_DEVICES)[number];
        if (!PREVIEW_DEVICES.includes(device)) {
          throw new Error(`device must be one of ${PREVIEW_DEVICES.join(', ')}.`);
        }
        state.setPreviewDevice(device);
        return { device };
      },
    },
    {
      name: 'set_editing_theme',
      title: 'Set theme being edited',
      description:
        'Choose whether subsequent edits target the light or dark theme (mirrors the editor toggle).',
      inputSchema: {
        type: 'object',
        properties: {
          theme: { type: 'string', enum: [...EDITING_THEMES] },
        },
        required: ['theme'],
        additionalProperties: false,
      },
      execute: (input) => {
        const theme = input.theme as (typeof EDITING_THEMES)[number];
        if (!EDITING_THEMES.includes(theme)) {
          throw new Error(`theme must be one of ${EDITING_THEMES.join(', ')}.`);
        }
        state.setEditingTheme(theme);
        return { theme };
      },
    },
  ];
}

let registered = false;

export function initWebMcpTools(): AbortController | null {
  if (registered) return null;
  const ctx = getModelContext();
  if (!ctx) return null;

  registered = true;
  const controller = new AbortController();

  for (const tool of buildTools()) {
    try {
      ctx.registerTool(tool, { signal: controller.signal });
    } catch (error) {
      console.warn(`[webmcp] Failed to register tool "${tool.name}":`, error);
    }
  }

  return controller;
}
