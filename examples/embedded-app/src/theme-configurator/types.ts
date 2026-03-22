/** Field definition types for the declarative configurator system */

export type FieldType =
  | 'color'
  | 'slider'
  | 'toggle'
  | 'select'
  | 'text'
  | 'chip-list'
  | 'color-scale'
  | 'token-ref';

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

export interface FieldDef {
  id: string;
  label: string;
  description?: string;
  type: FieldType;
  /** Dot-path into the config/theme object */
  path: string;
  defaultValue?: any;
  /** Slider-specific options */
  slider?: SliderOptions;
  /** Select-specific options */
  options?: SelectOption[];
  /** Color-scale-specific options */
  colorScale?: ColorScaleOptions;
  /** Token-ref-specific options */
  tokenRef?: TokenRefOptions;
  /** CSS property hint for value formatting */
  cssProperty?: string;
  /** Whether this is a theme path (vs config path) */
  isThemePath?: boolean;
  /** Convert stored value into a control-friendly value */
  formatValue?: (value: any) => any;
  /** Convert control input back into the stored value shape */
  parseValue?: (value: any) => any;
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
  values: Record<string, any>;
}

export interface ControlResult {
  element: HTMLElement;
  getValue: () => any;
  setValue: (value: any) => void;
  destroy: () => void;
  /** Field definition for search indexing */
  fieldDef: FieldDef;
}

export interface TabDef {
  id: string;
  label: string;
  icon?: string;
  sections: SectionDef[];
}

/** Callback for when a control value changes */
export type OnChangeCallback = (path: string, value: any) => void;

/** Search index entry */
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
