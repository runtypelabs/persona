/**
 * WebMCP tools for the Persona theme editor.
 *
 * Transport-agnostic: `createThemeEditorTools(state)` returns plain tool
 * definitions. Host code (e.g. an example app or a self-styling widget) is
 * responsible for obtaining a `document.modelContext` and calling
 * `registerTool` for each — this module has no polyfill dependency.
 */

export { createThemeEditorTools } from './tools';
export { toolResult } from './types';
export type {
  WebMcpTool,
  ToolResult,
  ToolAnnotations,
  ToolTextContent,
  ToolExecute,
  ThemeEditorLike,
  EditTarget,
  CreateThemeEditorToolsOptions,
} from './types';
export {
  buildSummary,
  runContrastChecks,
  quickContrastWarnings,
  CONTRAST_PAIRS,
  RADIUS_PRESETS,
} from './summary';
export type {
  ThemeSummary,
  RoleState,
  ContrastReport,
  ContrastCheck,
  ContrastWarning,
  ContrastLevel,
} from './summary';
export {
  coerceColor,
  coerceFamily,
  coerceIntensity,
  coerceScheme,
  coerceRoundnessStyle,
  coerceRadius,
  CSS_NAMED_COLORS,
} from './coerce';
