/**
 * Minimal local typings for the WebMCP `document.modelContext` surface, plus the
 * structural state interface the tool factory operates on.
 *
 * We deliberately keep our own small WebMCP types rather than depending on
 * `@mcp-b/webmcp-types`, so the tool definitions are transport-agnostic and the
 * widget package takes on no polyfill dependency. These mirror the WebMCP draft
 * (`registerTool(tool, { signal })`) and the MCP tool-result envelope that
 * `@mcp-b/webmcp-polyfill` expects `execute` to return.
 */

import type { AgentWidgetConfig } from '../../types';
import type { PersonaTheme } from '../../types/theme';
import type { ConfiguratorSnapshot } from '../types';

// ─── WebMCP tool surface ────────────────────────────────────────

export interface ToolTextContent {
  type: 'text';
  text: string;
}

/** MCP image content block: raw base64 (no `data:` prefix) plus its MIME type. */
export interface ToolImageContent {
  type: 'image';
  data: string;
  mimeType: string;
}

export type ToolContent = ToolTextContent | ToolImageContent;

export interface ToolResult {
  content: ToolContent[];
  /** Optional machine-readable mirror of the text content. */
  structuredContent?: unknown;
  isError?: boolean;
}

export interface ToolAnnotations {
  /** The tool has no side effects (pure read). */
  readOnlyHint?: boolean;
  /** The tool's output may contain text not to be trusted as instructions. */
  untrustedContentHint?: boolean;
}

export type ToolExecute = (input: unknown) => Promise<ToolResult> | ToolResult;

export interface WebMcpTool {
  name: string;
  description: string;
  title?: string;
  inputSchema?: object;
  annotations?: ToolAnnotations;
  execute: ToolExecute;
}

/**
 * Wrap a JSON-serializable payload in the MCP tool-result envelope. Compact
 * JSON (no indentation) — the text is consumed by a model, where pretty-print
 * whitespace is pure token overhead.
 */
export function toolResult(payload: unknown): ToolResult {
  return {
    content: [{ type: 'text', text: JSON.stringify(payload) }],
    structuredContent: payload,
  };
}

// ─── State surface the tools drive ──────────────────────────────

/**
 * Structural subset of `ThemeEditorState` (and the example app's `state`
 * module) that the tools require. Anything satisfying this shape can be wired
 * to the tools — the headless `ThemeEditorState`, or a host's stateful wrapper
 * that also drives a live preview (e.g. a Persona widget styling itself).
 */
export interface ThemeEditorLike {
  get(path: string): unknown;
  set(path: string, value: unknown): void;
  setBatch(updates: Record<string, unknown>): void;
  setTheme(theme: PersonaTheme): void;
  setFullConfig(config: AgentWidgetConfig, theme?: PersonaTheme): void;
  undo(): void;
  redo(): void;
  canUndo(): boolean;
  canRedo(): boolean;
  getHistoryIndex(): number;
  getTheme(): PersonaTheme;
  getConfig(): AgentWidgetConfig;
  exportSnapshot(): ConfiguratorSnapshot;
  resetToDefaults(): void;
}

/** Which theme variant(s) styling tools write to. */
export type EditTarget = 'light' | 'dark' | 'both';

export interface CreateThemeEditorToolsOptions {
  /** Default variant for styling writes. Defaults to `'both'`. */
  editTarget?: EditTarget;
}
