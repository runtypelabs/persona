/** @runtypelabs/persona/theme-editor — Headless theme editor core */

// Types
export type {
  FieldType,
  FieldDef,
  SectionDef,
  SectionPreset,
  TabDef,
  SubGroupDef,
  SliderOptions,
  SelectOption,
  ColorScaleOptions,
  TokenRefOptions,
  ThemeEditorPreset,
  ConfiguratorSnapshot,
  ConfigChangeListener,
  OnChangeCallback,
} from './types';

// State
export { ThemeEditorState } from './state';

// Sections
export {
  STYLE_SECTIONS,
  COLORS_SECTIONS,
  PALETTE_SECTION,
  SEMANTIC_COLORS_SECTION,
  COMPONENTS_SECTIONS,
  COMPONENT_SHAPE_SECTIONS,
  COMPONENT_COLOR_SECTIONS,
  CONFIGURE_SECTIONS,
  CONFIGURE_SUB_GROUPS,
  ALL_TABS,
  scopeSection,
  findSection,
} from './sections';

// Presets
export {
  BUILT_IN_PRESETS,
  THEME_EDITOR_PRESETS,
  getThemeEditorPreset,
} from './presets';

// Preview renderer
export { createThemePreview } from './preview';
export type {
  ThemePreviewOptions,
  ThemePreviewHandle,
  PreviewDevice,
  PreviewScene,
  PreviewShellMode,
  CompareMode,
} from './preview';

// Color utilities
export {
  parseCssValue,
  formatCssValue,
  convertToPx,
  convertFromPx,
  normalizeColorValue,
  isValidHex,
  hexToHsl,
  hslToHex,
  generateColorScale,
  SHADE_KEYS,
  COLOR_FAMILIES,
  paletteColorPath,
  resolveThemeColorPath,
  tokenRefDisplayName,
} from './color-utils';
