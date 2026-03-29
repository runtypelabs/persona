/** Field definition types for the declarative configurator system (headless — no DOM) */

import type { DeepPartial, PersonaTheme } from '../types/theme';
import type { AgentWidgetConfig } from '../types';

// ─── Field System ────────────────────────────────────────────────

export type FieldType =
  | 'color'
  | 'slider'
  | 'toggle'
  | 'select'
  | 'text'
  | 'chip-list'
  | 'color-scale'
  | 'token-ref'
  | 'role-assignment';

export interface SliderOptions {
  min: number;
  max: number;
  step: number;
  unit?: 'px' | 'rem' | 'none';
  /** Treat max value as 9999px (border-radius: full) */
  isRadiusFull?: boolean;
}

export interface SelectOption {
  value: string;
  label: string;
}

export interface ColorScaleOptions {
  /** Which palette color family (e.g., 'primary', 'gray') */
  colorFamily: string;
}

export interface TokenRefOptions {
  /** Token type to filter available references */
  tokenType: 'color' | 'spacing' | 'radius' | 'shadow' | 'typography';
  /** Available palette families to reference */
  families?: string[];
}

// ─── Role Assignment System ─────────────────────────────────────

/** Which kind of value a role target expects */
export type RoleTargetKind = 'background' | 'foreground' | 'border' | 'accent';

/** A single token path that a role assignment writes to */
export interface RoleTarget {
  /** Theme token path (e.g., 'components.message.user.background') */
  path: string;
  /** What kind of value this target expects */
  kind: RoleTargetKind;
}

/** An intensity preset (e.g., Solid uses .500 shades, Soft uses .100 shades) */
export interface RoleIntensity {
  id: string;
  label: string;
}

/** Options for a role-assignment field */
export interface RoleAssignmentOptions {
  /** Unique role identifier */
  roleId: string;
  /** Helper text shown below the role name */
  helper: string;
  /** Token paths this role writes to */
  targets: RoleTarget[];
  /** Available intensity presets */
  intensities: RoleIntensity[];
  /** Which data-persona-theme-zone this role corresponds to (for preview highlighting) */
  previewZone?: string;
}

export interface FieldDef {
  id: string;
  label: string;
  description?: string;
  type: FieldType;
  /** Dot-path into the config/theme object */
  path: string;
  defaultValue?: unknown;
  /** Slider-specific options */
  slider?: SliderOptions;
  /** Select-specific options */
  options?: SelectOption[];
  /** Color-scale-specific options */
  colorScale?: ColorScaleOptions;
  /** Token-ref-specific options */
  tokenRef?: TokenRefOptions;
  /** Role-assignment-specific options */
  roleAssignment?: RoleAssignmentOptions;
  /** CSS property hint for value formatting */
  cssProperty?: string;
  /** Whether this is a theme path (vs config path) */
  isThemePath?: boolean;
  /** Convert stored value into a control-friendly value */
  formatValue?: (value: unknown) => unknown;
  /** Convert control input back into the stored value shape */
  parseValue?: (value: unknown) => unknown;
}

export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  /** Whether the section starts collapsed */
  collapsed?: boolean;
  /** Preset buttons for this section */
  presets?: SectionPreset[];
}

export interface SectionPreset {
  id: string;
  label: string;
  values: Record<string, unknown>;
}

export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  sections: SectionDef[];
}

export interface SubGroupDef {
  label: string;
  sections: SectionDef[];
  /** When true, the sub-group starts collapsed and must be explicitly expanded */
  collapsedByDefault?: boolean;
}

// ─── Preset System ───────────────────────────────────────────────

/** Extract the toolCall config type from AgentWidgetConfig */
type AgentWidgetToolCallConfig = NonNullable<AgentWidgetConfig['toolCall']>;

export interface ThemeEditorPreset {
  id: string;
  name: string;
  description: string;
  theme: DeepPartial<PersonaTheme>;
  darkTheme?: DeepPartial<PersonaTheme>;
  /** Tool call styling for light mode */
  toolCall?: AgentWidgetToolCallConfig;
  /** Tool call styling for dark mode (falls back to toolCall if not set) */
  darkToolCall?: AgentWidgetToolCallConfig;
  preview: {
    primary: string;
    surface: string;
    accent: string;
  };
  darkPreview?: {
    primary: string;
    surface: string;
    accent: string;
  };
  /** Tags for filtering/categorization */
  tags?: string[];
}

// ─── State ───────────────────────────────────────────────────────

export interface ConfiguratorSnapshot {
  version: 2;
  config: Record<string, unknown>;
  theme: PersonaTheme;
}

export type ConfigChangeListener = (config: AgentWidgetConfig, theme: PersonaTheme) => void;

/** Callback for when a control value changes */
export type OnChangeCallback = (path: string, value: unknown) => void;
