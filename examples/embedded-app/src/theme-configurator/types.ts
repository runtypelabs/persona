/** Field definition types for the declarative configurator system.
 *  Core types re-exported from @runtypelabs/persona/theme-editor;
 *  DOM-specific types (ControlResult, SearchEntry) defined here.
 */

// Re-export headless types that don't need `any` adjustment
export type {
  FieldType,
  SectionPreset,
  SliderOptions,
  SelectOption,
  ColorScaleOptions,
  TokenRefOptions,
  RoleAssignmentOptions,
} from '@runtypelabs/persona/theme-editor';

// SectionDef and TabDef reference the local FieldDef (with `any`)
export interface SectionDef {
  id: string;
  title: string;
  description?: string;
  fields: FieldDef[];
  collapsed?: boolean;
  presets?: import('@runtypelabs/persona/theme-editor').SectionPreset[];
}

export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  sections: SectionDef[];
}

// FieldDef uses `any` here for backward compat with existing section files
// (headless core uses `unknown` but the vanilla configurator uses `any`)
export interface FieldDef {
  id: string;
  label: string;
  description?: string;
  type: import('@runtypelabs/persona/theme-editor').FieldType;
  path: string;
  defaultValue?: any;
  slider?: import('@runtypelabs/persona/theme-editor').SliderOptions;
  options?: import('@runtypelabs/persona/theme-editor').SelectOption[];
  colorScale?: import('@runtypelabs/persona/theme-editor').ColorScaleOptions;
  tokenRef?: import('@runtypelabs/persona/theme-editor').TokenRefOptions;
  roleAssignment?: import('@runtypelabs/persona/theme-editor').RoleAssignmentOptions;
  cssProperty?: string;
  isThemePath?: boolean;
  formatValue?: (value: any) => any;
  parseValue?: (value: any) => any;
}

/** Callback for when a control value changes */
export type OnChangeCallback = (path: string, value: any) => void;

/** DOM-specific: result of rendering a control */
export interface ControlResult {
  element: HTMLElement;
  getValue: () => any;
  setValue: (value: any) => void;
  destroy: () => void;
  /** Field definition for search indexing */
  fieldDef: import('@runtypelabs/persona/theme-editor').FieldDef;
}

/** DOM-specific: search index entry */
export interface SearchEntry {
  fieldId: string;
  label: string;
  description: string;
  keywords: string[];
  tabId: string;
  sectionId: string;
  element: HTMLElement;
  control: ControlResult;
}
