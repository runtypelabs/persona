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
  RoleTargetKind,
  RoleTarget,
  RoleIntensity,
  RoleAssignmentOptions,
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
  STYLE_SECTIONS_V2,
  THEME_SECTION,
  BRAND_PALETTE_SECTION,
  STATUS_PALETTE_SECTION,
  INTERFACE_ROLES_SECTION,
  STATUS_COLORS_SECTION,
  ADVANCED_TOKENS_SECTION,
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
  PreviewLifecycleContext,
  PreviewDevice,
  PreviewShellMode,
  CompareMode,
} from './preview';

// Preview building blocks (for advanced/custom preview renderers)
export {
  DEVICE_DIMENSIONS,
  ZOOM_MIN,
  ZOOM_MAX,
  SHELL_STYLE_ID,
  PREVIEW_STORAGE_ADAPTER,
  HOME_SUGGESTION_CHIPS,
  MOCK_BROWSER_CONTENT,
  MOCK_WORKSPACE_CONTENT,
  escapeHtml,
  getShellPalette,
  buildShellCss,
  applyShellTheme,
  buildSrcdoc,
  getPreviewTranscriptPresetLabel,
  createPreviewTranscriptEntry,
  appendPreviewTranscriptEntry,
  createPreviewMessages,
  applySceneConfig,
  buildPreviewConfig,
  buildPreviewConfigWithMessages,
} from './preview-utils';
export type {
  PreviewScene,
  PreviewTranscriptEntryPreset,
  PreviewShellPalette,
  PreviewConfigOptions,
} from './preview-utils';

// Role mappings (Interface Roles editor)
export {
  ROLE_INTENSITIES,
  ROLE_FAMILIES,
  ROLE_FAMILY_LABELS,
  ROLE_SURFACES,
  ROLE_HEADER,
  ROLE_USER_MESSAGES,
  ROLE_ASSISTANT_MESSAGES,
  ROLE_PRIMARY_ACTIONS,
  ROLE_SCROLL_TO_BOTTOM,
  ROLE_INPUT,
  ROLE_LINKS_FOCUS,
  ROLE_BORDERS,
  ALL_ROLES,
  resolveRoleAssignment,
  detectRoleAssignment,
} from './role-mappings';
export type { RoleFamily, DetectedRoleAssignment } from './role-mappings';

// Color utilities
export {
  parseCssValue,
  formatCssValue,
  convertToPx,
  convertFromPx,
  normalizeColorValue,
  isValidHex,
  wcagContrastRatio,
  hexToHsl,
  hslToHex,
  generateColorScale,
  SHADE_KEYS,
  COLOR_FAMILIES,
  paletteColorPath,
  resolveThemeColorPath,
  tokenRefDisplayName,
} from './color-utils';
