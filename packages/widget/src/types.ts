import type { AgentWidgetPlugin } from "./plugins/types";
import type { DeepPartial, PersonaTheme } from "./types/theme";
import type {
  RuntypeClientChatRequest,
  RuntypeClientFeedbackRequest,
  RuntypeStopReasonKind,
} from "./generated/runtype-openapi-contract";
import type { TargetResolver } from "./utils/target";
import type { IconName } from "./utils/icons";

export type { TargetResolver, ResolvedTarget } from "./utils/target";

// ============================================================================
// Multi-Modal Content Types
// ============================================================================

/**
 * Text content part for multi-modal messages
 */
export type TextContentPart = {
  type: 'text';
  text: string;
};

/**
 * Image content part for multi-modal messages
 * Supports base64 data URIs or URLs
 */
export type ImageContentPart = {
  type: 'image';
  image: string; // base64 data URI or URL
  mimeType?: string;
  alt?: string; // optional alt text for accessibility
};

/**
 * File content part for multi-modal messages
 * Supports PDF, TXT, DOCX, and other document types
 */
export type FileContentPart = {
  type: 'file';
  data: string; // base64 data URI or URL
  mimeType: string;
  filename: string;
};

/**
 * Audio content part for multi-modal messages
 * Supports base64 data URIs or URLs
 */
export type AudioContentPart = {
  type: 'audio';
  audio: string; // base64 data URI or URL
  mimeType?: string;
};

/**
 * Video content part for multi-modal messages
 * Supports base64 data URIs or URLs
 */
export type VideoContentPart = {
  type: 'video';
  video: string; // base64 data URI or URL
  mimeType?: string;
};

/**
 * Union type for all content part types
 */
export type ContentPart =
  | TextContentPart
  | ImageContentPart
  | FileContentPart
  | AudioContentPart
  | VideoContentPart;

/**
 * Message content can be a simple string or an array of content parts
 */
export type MessageContent = string | ContentPart[];

// ============================================================================
// Context and Middleware Types
// ============================================================================

export type AgentWidgetContextProviderContext = {
  messages: AgentWidgetMessage[];
  config: AgentWidgetConfig;
};

export type AgentWidgetContextProvider = (
  context: AgentWidgetContextProviderContext
) =>
  | Record<string, unknown>
  | void
  | Promise<Record<string, unknown> | void>;

// ============================================================================
// Context Mentions (composer @-mentions / context attachment)
// ============================================================================
//
// Two entry points (a visible affordance button and the `@` trigger) over one
// shared menu. Selecting a mention strips the typed `@query` and adds a compact
// removable pill chip to the composer context row; the resolved content reaches
// the model via `llmAppend`/`contentParts` (default, no backend changes) or the
// opt-in structured `context` channel. See `docs/context-mentions-plan.md`.

/** A single selectable item in the mention menu (host-provided). */
export type AgentWidgetContextMentionItem = {
  /** Stable key within its source. */
  id: string;
  /** Shown in the menu and on the chip (e.g. "App.tsx"). */
  label: string;
  /** Subtitle line in the menu. */
  description?: string;
  /** Lucide icon name. */
  iconName?: string;
  /** Group header override; defaults to the source's `label`. */
  group?: string;
  /** Optional recency/popularity hint the default matcher boosts on. */
  recencyScore?: number;
};

/** Reference stored on a sent message for transcript fidelity + chip rendering. */
export type AgentWidgetContextMentionRef = {
  sourceId: string;
  itemId: string;
  label: string;
  iconName?: string;
};

/**
 * The payload a source returns from `resolve()` for one selected item.
 * Lead with `llmAppend` — it is the only channel guaranteed to reach the model
 * with no backend changes.
 */
export type AgentWidgetContextMentionPayload = {
  /**
   * PRIMARY, model-visible channel. Appended to this user message's LLM content
   * so the model actually sees the context with no backend changes.
   */
  llmAppend?: string;
  /** Extra content parts (e.g. file text / image) via the multi-modal path. */
  contentParts?: ContentPart[];
  /**
   * OPT-IN structured channel. Merged into request `context` under
   * `mentions.<sourceId>.<itemId>` for flows/agents that read it. NOTE: ambient
   * `context` is NOT guaranteed to reach the model — use `llmAppend` if you need
   * the model to see it.
   */
  context?: Record<string, unknown>;
};

export type AgentWidgetContextMentionSearchContext = {
  messages: AgentWidgetMessage[];
  config: AgentWidgetConfig;
  /** Aborts when the next keystroke supersedes this in-flight search. */
  signal: AbortSignal;
};

export type AgentWidgetContextMentionResolveContext =
  AgentWidgetContextMentionSearchContext & {
    /** Plain-text composer value at resolve time. */
    composerText: string;
  };

export type AgentWidgetContextMentionSource = {
  id: string;
  /** Group header shown in the menu. */
  label: string;
  /**
   * Filter items for the current `@query` (empty query → recent/popular).
   * Implement server-side search for large/remote sets, or return all items and
   * let the widget rank them with `defaultMentionFilter`
   * (see `createStaticMentionSource` for the common case).
   */
  search: (
    query: string,
    ctx: AgentWidgetContextMentionSearchContext
  ) =>
    | AgentWidgetContextMentionItem[]
    | Promise<AgentWidgetContextMentionItem[]>;
  /**
   * Fetch the payload for dispatch. Called once when the user SELECTS the item
   * (eagerly, cached on the chip, abortable on removal) unless `resolveOn` is
   * `"submit"`. A throw/abort drops the mention via `onMentionResolveError`.
   */
  resolve: (
    item: AgentWidgetContextMentionItem,
    ctx: AgentWidgetContextMentionResolveContext
  ) =>
    | AgentWidgetContextMentionPayload
    | Promise<AgentWidgetContextMentionPayload>;
  /**
   * When to call `resolve()`:
   *  - `"select"` (default): eager on pick; parallelizes the fetch with the user
   *    finishing their sentence so submit stays instant.
   *  - `"submit"`: defer to send time, for time-sensitive sources (e.g. current
   *    page state that may change between select and send).
   * @default "select"
   */
  resolveOn?: "select" | "submit";
};

/** Context passed to the optional `renderMentionMenu` override. */
export type AgentWidgetContextMentionMenuRenderContext = {
  /** Current trigger query ("" when freshly opened). */
  query: string;
  /** Grouped, ranked, capped results ready to paint. */
  groups: {
    source: AgentWidgetContextMentionSource;
    items: AgentWidgetContextMentionItem[];
  }[];
  /** Per-source async state for loading/empty/error rendering, keyed by source id. */
  status: Record<string, "loading" | "ready" | "empty" | "error">;
  /** Index into the flat keyboard-traversal order. */
  activeIndex: number;
  /** Commit a selection (strips `@query`, adds chip, resolves on select). */
  select: (item: AgentWidgetContextMentionItem) => void;
  /** Close the menu, keeping a literal `@`. */
  close: () => void;
};

/** Context passed to the optional `renderMentionItem` per-row override. */
export type AgentWidgetContextMentionItemRenderContext = {
  /** The item to render. */
  item: AgentWidgetContextMentionItem;
  /** The source this item came from (its group). */
  source: AgentWidgetContextMentionSource;
  /** Current trigger query, for highlighting matches. */
  query: string;
  /** True when this row is the keyboard-highlighted one at render time. */
  active: boolean;
  /** Position in the flat keyboard-traversal order. */
  index: number;
};

/** Context passed to the optional `renderMentionChip` override. */
export type AgentWidgetContextMentionChipRenderContext = {
  ref: AgentWidgetContextMentionRef;
  /** Resolve-on-select lifecycle for spinner→ready→error UI. */
  status: "resolving" | "ready" | "error";
  /**
   * The resolved payload, once available (select-resolved sources only). Use it
   * to preview already-fetched content on hover. Undefined while `status` is
   * `"resolving"`, on `"error"`, and for `resolveOn:"submit"` sources (which
   * resolve at send time, not while the chip sits in the composer — for those,
   * `ref.itemId` carries the source key you can re-read on demand, e.g. a CSS
   * selector for the smart-dom source).
   */
  payload?: AgentWidgetContextMentionPayload;
  /** Remove the chip; aborts any in-flight resolve. */
  remove: () => void;
};

export type AgentWidgetContextMentionConfig = {
  /** @default false */
  enabled?: boolean;
  /**
   * Show the visible composer affordance button (the discoverable entry point).
   * Strongly recommended; the bare `@` trigger alone is hard to discover for
   * non-technical users. @default true
   */
  showButton?: boolean;
  /** Icon for the affordance button. @default "at-sign" */
  buttonIconName?: string;
  /** Tooltip / aria-label for the affordance button. @default "Add context" */
  buttonTooltipText?: string;
  /** Trigger character. @default "@" */
  trigger?: string;
  /** Max mentions per message. @default 8 */
  maxMentions?: number;
  /** Max items shown per source group before "keep typing to narrow". @default 6 */
  maxItemsPerGroup?: number;
  /**
   * Debounce for ASYNC source search only (ms). Synchronous sources and the
   * menu's first paint are never debounced. @default 150
   */
  searchDebounceMs?: number;
  /** Registered mention sources (search + resolve). */
  sources: AgentWidgetContextMentionSource[];
  /** Chip icon fallback when a source/item omits one. @default "at-sign" */
  chipIconName?: string;
  /** Fired when a pick is rejected because it duplicates an existing chip or hits `maxMentions`. */
  onMentionRejected?: (
    item: AgentWidgetContextMentionItem,
    reason: "duplicate" | "limit"
  ) => void;
  /**
   * A `resolve()` that throws/aborts: the mention is dropped and the message
   * still sends. Surface a non-blocking notice here if desired.
   */
  onMentionResolveError?: (
    item: AgentWidgetContextMentionItem,
    error: unknown
  ) => void;
  /**
   * MID-LEVEL render override for the autocomplete menu. The widget still owns
   * trigger detection, search, debounce/abort, keyboard nav, and positioning;
   * you only supply the menu markup and drive selection through `ctx`. Omit to
   * use the built-in grouped menu. @default built-in
   */
  renderMentionMenu?: (
    ctx: AgentWidgetContextMentionMenuRenderContext
  ) => HTMLElement;
  /**
   * NARROW render override for a single result row's INNER content, keeping the
   * built-in menu chrome (group headers, loading/empty/error, keyboard nav, the
   * "keep typing" hint). The widget keeps the `role="option"` wrapper and its
   * click/hover wiring; you return only the row's contents. For full menu
   * control use `renderMentionMenu` instead. Highlight is CSS-driven via the
   * wrapper's `[data-active]` attribute, so this is called once per render, not
   * on every arrow key. Ignored when `renderMentionMenu` is set. @default built-in
   */
  renderMentionItem?: (
    ctx: AgentWidgetContextMentionItemRenderContext
  ) => HTMLElement;
  /**
   * MID-LEVEL render override for a single context chip. Return your own pill
   * (must include an accessible remove control wired to `ctx.remove`); reflect
   * `ctx.status` for resolve-on-select. Omit to use the built-in compact pill.
   * @default built-in
   */
  renderMentionChip?: (
    ctx: AgentWidgetContextMentionChipRenderContext
  ) => HTMLElement;
};

export type AgentWidgetRequestPayloadMessage = {
  role: AgentWidgetMessageRole;
  content: MessageContent;
  createdAt: string;
};

export type AgentWidgetRequestPayload = {
  messages: AgentWidgetRequestPayloadMessage[];
  flowId?: string;
  agent?: { agentId: string };
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Per-turn template variables for /v1/client/chat (merged as root-level {{var}} in Runtype). */
  inputs?: Record<string, unknown>;
  /**
   * Per-turn page-discovered tools (WebMCP). Sent to Runtype's dispatch so the
   * agent can call them as `webmcp:<name>`. The widget snapshots
   * `document.modelContext.__getRegisteredTools()` each turn and ships only
   * the JSON-serializable surface (no `execute`).
   */
  clientTools?: ClientToolDefinition[];
};

// ============================================================================
// Agent Execution Types
// ============================================================================

/**
 * Configuration for agent loop behavior.
 */
export type AgentLoopConfig = {
  /** Maximum number of agent turns (1-100). The loop continues while the model calls tools. */
  maxTurns: number;
  /** Maximum cost budget in USD. Agent stops when exceeded. */
  maxCost?: number;
  /** Enable periodic reflection during execution */
  enableReflection?: boolean;
  /** Number of iterations between reflections (1-50) */
  reflectionInterval?: number;
};

/**
 * Configuration for agent tools (search, code execution, MCP servers, etc.)
 */
export type AgentToolsConfig = {
  /** Tool IDs to enable (e.g., "builtin:exa", "builtin:dalle", "builtin:openai_web_search") */
  toolIds?: string[];
  /** Per-tool configuration overrides keyed by tool ID */
  toolConfigs?: Record<string, Record<string, unknown>>;
  /** Inline tool definitions for runtime-defined tools */
  runtimeTools?: Array<Record<string, unknown>>;
  /** Custom MCP server connections */
  mcpServers?: Array<Record<string, unknown>>;
  /** Maximum number of tool invocations per execution */
  maxToolCalls?: number;
  /** How the model is steered toward tools: let it decide, force a call, or disable */
  toolCallStrategy?: "auto" | "required" | "none";
  /** Per-tool invocation limits / requirements keyed by tool name */
  perToolLimits?: Record<string, { maxCalls?: number; required?: boolean }>;
  /** Tool approval configuration for human-in-the-loop workflows */
  approval?: {
    /** Tool names/patterns to require approval for, or true for all tools */
    require: string[] | boolean;
    /** Approval timeout in milliseconds (default: 300000 / 5 minutes) */
    timeout?: number;
    /** Ask the agent to state its intent alongside approval requests (default: true) */
    requestReason?: boolean;
  };
  /**
   * Enables the synthesized `spawn_subagent` tool: the model can spin up
   * ad-hoc child agents at runtime, restricted to `toolPool` (tool IDs /
   * runtime-tool names already granted to the parent agent).
   */
  subagentConfig?: {
    toolPool: string[];
    defaultMaxTurns?: number;
    maxTurnsLimit?: number;
    maxSpawnsPerRun?: number;
    defaultModel?: string;
    allowNesting?: boolean;
    defaultTimeoutMs?: number;
  };
  /**
   * Enables the synthesized `code_mode` tool: the model writes JS that calls
   * pool tools inside a sandbox instead of issuing individual tool calls.
   */
  codeModeConfig?: {
    toolPool: string[];
    description?: string;
    timeoutMs?: number;
  };
};

/** Artifact kinds for the Persona sidebar and dispatch payload */
export type PersonaArtifactKind = "markdown" | "component";

/**
 * Agent configuration for agent execution mode.
 * When provided in the widget config, enables agent loop execution instead of flow dispatch.
 */
export type ArtifactConfigPayload = {
  enabled: true;
  types: PersonaArtifactKind[];
};

export type AgentConfig = {
  /** Agent display name */
  name: string;
  /** Model identifier (e.g., 'openai:gpt-4o-mini', 'qwen/qwen3-8b') */
  model: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Temperature for model responses */
  temperature?: number;
  /** Tool configuration for the agent */
  tools?: AgentToolsConfig;
  /** Persona artifacts: sibling of tools (virtual agent / API parity) */
  artifacts?: ArtifactConfigPayload;
  /** Loop configuration for multi-turn execution */
  loopConfig?: AgentLoopConfig;
};

export type SavedAgentConfig = {
  /** Persisted Runtype agent ID to execute. */
  agentId: string;
};

/**
 * Options for agent execution requests.
 */
export type AgentRequestOptions = {
  /** Whether to stream the response (should be true for widget usage) */
  streamResponse?: boolean;
  /** Record mode: 'virtual' for no persistence, 'existing'/'create' for database records */
  recordMode?: 'virtual' | 'existing' | 'create';
  /** Whether to store results server-side */
  storeResults?: boolean;
  /** Enable debug mode for additional event data */
  debugMode?: boolean;
};

/**
 * Request payload for agent execution mode.
 */
export type AgentWidgetAgentRequestPayload = {
  agent: AgentConfig | SavedAgentConfig;
  messages: AgentWidgetRequestPayloadMessage[];
  options: AgentRequestOptions;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /**
   * Per-turn page-discovered tools (WebMCP): same shape as
   * `AgentWidgetRequestPayload.clientTools`.
   */
  clientTools?: ClientToolDefinition[];
};

// ============================================================================
// WebMCP Types (page-discovered tools shipped per dispatch)
// ============================================================================

/**
 * Wire shape for a single client-discovered tool sent on `dispatch.clientTools[]`.
 *
 * Mirrors the SDK's `ClientToolDefinition` in `@runtypelabs/sdk`. Only the
 * JSON-serializable surface of a WebMCP tool: the `execute` function stays
 * client-side; the server merges these into the agent's tool catalog under
 * the `webmcp:` namespace.
 */
export type ClientToolDefinition = {
  /** Bare tool name; the server prepends `webmcp:` on the wire. */
  name: string;
  description: string;
  /** JSON Schema (per WebMCP spec): passed through as-is. */
  parametersSchema?: object;
  /**
   * `'webmcp'` for tools discovered via the polyfill (server prepends the
   * `webmcp:` wire prefix); `'sdk'` for widget/SDK-provided tools (name stays
   * bare on the wire). Matches the server's accepted enum: any other value
   * fails dispatch validation.
   */
  origin?: 'webmcp' | 'sdk';
  /** Origin of the page that registered the tool: for server-side audit. */
  pageOrigin?: string;
  /**
   * WebMCP `Tool.annotations` (spec). Not used for gating server-side; the
   * widget reads these client-side. Forwarded so traces/dashboards can show
   * `readOnlyHint` / `untrustedContentHint` on tool-call records.
   */
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
};

/**
 * Information passed to the confirm-bubble handler before a `webmcp:*` tool
 * call executes. Every WebMCP tool routes through this single gate.
 */
export type WebMcpConfirmInfo = {
  /** Bare tool name (no `webmcp:` prefix). */
  toolName: string;
  args: unknown;
  description?: string;
  /**
   * Display title the tool declared via the WebMCP spec's
   * `ToolDescriptor.title` (e.g. `"Add to Cart"`). Absent when the tool
   * didn't declare one.
   */
  title?: string;
  annotations?: {
    readOnlyHint?: boolean;
    untrustedContentHint?: boolean;
  };
  /**
   * Why the confirm was requested. Currently always `'gate'`: the default
   * confirm-by-default gate that fires before every `webmcp:*` call. (The
   * `@mcp-b/webmcp-polyfill` owns the spec's `requestUserInteraction` callback
   * internally, so Persona no longer surfaces a nested in-tool confirm.)
   */
  reason: 'gate';
};

/**
 * Resolves to `true` if the user approves the tool call; `false` to decline.
 */
export type WebMcpConfirmHandler = (info: WebMcpConfirmInfo) => Promise<boolean>;

/**
 * Persona's normalized tool-result shape sent back to the agent on `/resume`.
 * Mirrors the MCP `CallToolResult` content shape; arbitrary `execute()` return
 * values are wrapped as a single text block at the bridge boundary.
 */
export type WebMcpToolResult = {
  content: Array<
    | { type: 'text'; text: string }
    | { type: string;[key: string]: unknown }
  >;
  isError?: boolean;
  /** Pass-through of the tool's `annotations.untrustedContentHint`. */
  annotations?: {
    untrustedContentHint?: boolean;
  };
};

/**
 * Widget-level WebMCP configuration. Set `enabled: true` to opt in. The
 * surface's server-side `webmcp` policy is the source of truth for which
 * tools are accepted: these client-side options are convenience filters.
 */
export type AgentWidgetWebMcpConfig = {
  /** Master switch. Default: `false` (widget never installs the polyfill). */
  enabled?: boolean;
  /**
   * Glob-ish name patterns to include client-side. `'*'` matches any chars
   * except `:`. Patterns are matched against the bare tool name (no `webmcp:`
   * prefix). If unset, all registered tools are included.
   */
  allowlist?: string[];
  /**
   * Per-tool gate policy. Called before the confirm gate for every
   * `webmcp:*` call; return `true` to approve immediately and skip the
   * confirmation UI entirely. Use this to auto-allow read-only tools (e.g.
   * a catalog search) while still gating mutating ones. Only consulted on
   * the default-UI path: a custom `onConfirm` takes full control instead.
   */
  autoApprove?: (info: WebMcpConfirmInfo) => boolean;
  /**
   * Confirm gate handler. When omitted, Persona renders its native in-panel
   * approval bubble (the same chrome used for server-driven tool approvals)
   * and resolves on the user's Approve/Deny click. Supply this to override
   * with a custom confirmer (e.g. a route-level modal). The legacy
   * `window.confirm` fallback only applies when no widget UI is attached.
   */
  onConfirm?: WebMcpConfirmHandler;
};

/**
 * Agent execution state tracking.
 */
export type AgentExecutionState = {
  executionId: string;
  agentId: string;
  agentName: string;
  status: 'running' | 'complete' | 'error';
  currentIteration: number;
  maxTurns: number;
  startedAt?: number;
  completedAt?: number;
  stopReason?: 'complete' | 'end_turn' | 'max_turns' | 'max_cost' | 'timeout' | 'error';
};

/**
 * The coordinates needed to resume a durable agent turn after the SSE
 * connection drops (any resumable, server-persisted execution, e.g. Claude
 * Managed agents or async/background runs). Held on the session while a
 * resumable stream is in flight
 * and surfaced to the host via {@link AgentWidgetConfig.onExecutionState} so it
 * can persist `{ executionId, lastEventId }` next to its own `conversationId`
 * for the tab-reload path.
 *
 * `conversationId` is intentionally absent: it is host-owned (it lives in the
 * host's `reconnectStream`/`customFetch` closure; the widget never sees it).
 */
export type ResumableHandle = {
  /** The durable turn to reconnect to (from `agentMetadata.executionId`). */
  executionId: string;
  /** Highest SSE `id:` seq applied: the `?after=` reconnect cursor. */
  lastEventId: string;
  /** The open assistant message being streamed into, kept open on resume. */
  assistantMessageId: string;
  status: 'running';
};

/**
 * Metadata attached to messages created during agent execution.
 */
export type AgentMessageMetadata = {
  executionId?: string;
  iteration?: number;
  turnId?: string;
  agentName?: string;
  /**
   * When this message was produced by a step inside a nested flow executed
   * as a tool, identifies the parent tool call id. Enables renderers to
   * visually group or indent nested-flow output under its parent tool.
   */
  parentToolId?: string;
  /**
   * Nested flow step id that produced this message (e.g. a `send-stream`
   * or `prompt` step inside the nested flow). Stable key for that step.
   */
  parentStepId?: string;
  /**
   * Set to `true` on a tool-variant message produced from a `step_await`
   * event (`awaitReason: "local_tool_required"`). Signals to UI code that
   * the tool call is a LOCAL tool and the server is paused waiting for a
   * `POST /v1/dispatch/resume` with the user's answer keyed by tool name.
   */
  awaitingLocalTool?: boolean;
  /**
   * The provider per-call id (`toolu_…`) carried on the `step_await` /
   * `flow_await` events for a LOCAL tool (core#3878). Present only when the
   * server emits it. Two PARALLEL calls to the same tool in one turn share a
   * `toolName` (and a collapsed `toolId`) but get DISTINCT `webMcpToolCallId`s,
   * so this is the key the widget batches a single `/resume` on: preferred
   * over tool name, which collides for same-tool parallel calls. Absent →
   * fall back to the legacy name-keyed resume contract.
   */
  webMcpToolCallId?: string;
  /**
   * Set to `true` once the user has picked / typed / dismissed an answer for
   * an `ask_user_question` tool call, so renderers stop re-mounting the
   * answer-pill sheet for this tool call on subsequent render passes.
   */
  askUserQuestionAnswered?: boolean;
  /**
   * In-progress answers for a multi-question `ask_user_question` payload,
   * keyed by question text. Persisted across refresh so the user lands back
   * where they were if the page reloads mid-flow. Cleared once
   * `askUserQuestionAnswered` flips to `true`.
   */
  askUserQuestionAnswers?: Record<string, string | string[]>;
  /**
   * Current page index for a multi-question `ask_user_question` payload's
   * paginated stepper. Persists alongside `askUserQuestionAnswers`.
   */
  askUserQuestionIndex?: number;
  /**
   * Set to `true` once a `suggest_replies` tool call's fire-and-forget
   * `/resume` has been accepted by the server. Persisted belt-and-suspenders
   * mirror of the in-memory resolved-key dedupe, so hydration/re-emit paths
   * never re-resume the call.
   */
  suggestRepliesResolved?: boolean;
};

export type AgentWidgetRequestMiddlewareContext = {
  payload: AgentWidgetRequestPayload;
  config: AgentWidgetConfig;
};

export type AgentWidgetRequestMiddleware = (
  context: AgentWidgetRequestMiddlewareContext
) => AgentWidgetRequestPayload | void | Promise<AgentWidgetRequestPayload | void>;

export type AgentWidgetParsedAction = {
  type: string;
  payload: Record<string, unknown>;
  raw?: unknown;
};

export type AgentWidgetActionParserInput = {
  text: string;
  message: AgentWidgetMessage;
};

export type AgentWidgetActionParser = (
  input: AgentWidgetActionParserInput
) => AgentWidgetParsedAction | null | undefined;

export type AgentWidgetActionHandlerResult = {
  handled?: boolean;
  displayText?: string;
  persistMessage?: boolean; // If false, prevents message from being saved to history
  resubmit?: boolean; // If true, automatically triggers another model call after handler completes
};

export type AgentWidgetActionContext = {
  message: AgentWidgetMessage;
  metadata: Record<string, unknown>;
  updateMetadata: (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  document: Document | null;
  /**
   * Trigger automatic model continuation.
   * Call this AFTER completing async operations (e.g., injecting search results)
   * to have the model analyze the injected data.
   *
   * Use this instead of returning `resubmit: true` for handlers that do async work,
   * as it ensures the continuation happens after the data is available in context.
   *
   * @example
   * // In an action handler
   * const results = await fetchProducts(query);
   * session.injectAssistantMessage({ content: formatResults(results) });
   * context.triggerResubmit();
   */
  triggerResubmit: () => void;
};

export type AgentWidgetActionHandler = (
  action: AgentWidgetParsedAction,
  context: AgentWidgetActionContext
) => AgentWidgetActionHandlerResult | void;

export type AgentWidgetStoredState = {
  messages?: AgentWidgetMessage[];
  metadata?: Record<string, unknown>;
  artifacts?: PersonaArtifactRecord[];
  selectedArtifactId?: string | null;
};

export interface AgentWidgetStorageAdapter {
  load?: () =>
    | AgentWidgetStoredState
    | null
    | Promise<AgentWidgetStoredState | null>;
  save?: (state: AgentWidgetStoredState) => void | Promise<void>;
  clear?: () => void | Promise<void>;
}

export type AgentWidgetVoiceStateEvent = {
  active: boolean;
  source: "user" | "auto" | "restore" | "system";
  timestamp: number;
};

/**
 * Fired on every voice `VoiceStatus` transition (listening / processing /
 * speaking / idle / …). Unlike `voice:state` (a coarse active on/off), this
 * exposes the granular status so consumers can render their own per-state UI
 * (e.g. a listening/speaking status dock).
 */
export type AgentWidgetVoiceStatusEvent = {
  status: VoiceStatus;
  timestamp: number;
};

export type AgentWidgetActionEventPayload = {
  action: AgentWidgetParsedAction;
  message: AgentWidgetMessage;
};

/**
 * Fired on every "Read aloud" (text-to-speech) state transition for a message:
 * `loading` (press) → `playing` → `paused`/`playing` → `idle` (finished or
 * stopped). On the terminal `idle` transition, `messageId`/`message` still
 * identify the message that just stopped.
 */
export type AgentWidgetReadAloudEvent = {
  /** The message being read aloud (or that just finished/stopped), if known. */
  messageId: string | null;
  /** The message object, when still present in the thread. */
  message: AgentWidgetMessage | null;
  /** The new playback state for this message. */
  state: ReadAloudState;
  timestamp: number;
};

/**
 * Feedback event payload for upvote/downvote actions on messages
 */
export type AgentWidgetMessageFeedback = {
  type: "upvote" | "downvote";
  messageId: string;
  message: AgentWidgetMessage;
};

/**
 * Configuration for message action buttons (copy, upvote, downvote)
 * 
 * **Client Token Mode**: When using `clientToken`, feedback is automatically
 * sent to your Runtype backend. Just enable the buttons and you're done!
 * The `onFeedback` and `onCopy` callbacks are optional for additional local handling.
 * 
 * @example
 * ```typescript
 * // With clientToken - feedback is automatic!
 * config: {
 *   clientToken: 'ct_live_...',
 *   messageActions: {
 *     showUpvote: true,
 *     showDownvote: true,
 *     // No onFeedback needed - sent to backend automatically
 *   }
 * }
 * ```
 */
export type AgentWidgetMessageActionsConfig = {
  /**
   * Enable/disable message actions entirely
   * @default true
   */
  enabled?: boolean;
  /**
   * Show copy button
   * @default true
   */
  showCopy?: boolean;
  /**
   * Show upvote button.
   * When using `clientToken`, feedback is sent to the backend automatically.
   * @default false
   */
  showUpvote?: boolean;
  /**
   * Show downvote button.
   * When using `clientToken`, feedback is sent to the backend automatically.
   * @default false
   */
  showDownvote?: boolean;
  /**
   * Show a "Read aloud" button that speaks the assistant message via
   * text-to-speech (play / pause / resume). Uses the browser Web Speech API by
   * default, or a hosted engine supplied via `textToSpeech.createEngine`.
   * Voice, rate and pitch are read from the `textToSpeech` config.
   * @default false
   */
  showReadAloud?: boolean;
  /**
   * Visibility mode: 'always' shows buttons always, 'hover' shows on hover only
   * @default 'hover'
   */
  visibility?: "always" | "hover";
  /**
   * Horizontal alignment of action buttons
   * @default 'right'
   */
  align?: "left" | "center" | "right";
  /**
   * Layout style for action buttons
   * - 'pill-inside': Compact floating pill around just the buttons (default for hover)
   * - 'row-inside': Full-width row at the bottom of the message
   * @default 'pill-inside'
   */
  layout?: "pill-inside" | "row-inside";
  /**
   * Callback when user submits feedback (upvote/downvote).
   * 
   * **Note**: When using `clientToken`, feedback is AUTOMATICALLY sent to your
   * backend via `/v1/client/feedback`. This callback is called IN ADDITION to
   * the automatic submission, useful for updating local UI or analytics.
   */
  onFeedback?: (feedback: AgentWidgetMessageFeedback) => void;
  /**
   * Callback when user copies a message.
   * 
   * **Note**: When using `clientToken`, copy events are AUTOMATICALLY tracked
   * via `/v1/client/feedback`. This callback is called IN ADDITION to the
   * automatic tracking.
   */
  onCopy?: (message: AgentWidgetMessage) => void;
};

export type AgentWidgetStateEvent = {
  open: boolean;
  source: "user" | "auto" | "api" | "system";
  timestamp: number;
};

export type AgentWidgetStateSnapshot = {
  open: boolean;
  launcherEnabled: boolean;
  voiceActive: boolean;
  streaming: boolean;
};

export type AgentWidgetControllerEventMap = {
  "user:message": AgentWidgetMessage;
  "assistant:message": AgentWidgetMessage;
  "assistant:complete": AgentWidgetMessage;
  "voice:state": AgentWidgetVoiceStateEvent;
  "voice:status": AgentWidgetVoiceStatusEvent;
  "action:detected": AgentWidgetActionEventPayload;
  "action:resubmit": AgentWidgetActionEventPayload;
  "widget:opened": AgentWidgetStateEvent;
  "widget:closed": AgentWidgetStateEvent;
  "widget:state": AgentWidgetStateSnapshot;
  "message:feedback": AgentWidgetMessageFeedback;
  "message:copy": AgentWidgetMessage;
  "message:read-aloud": AgentWidgetReadAloudEvent;
  "eventStream:opened": { timestamp: number };
  "eventStream:closed": { timestamp: number };
  "approval:requested": { approval: AgentWidgetApproval; message: AgentWidgetMessage };
  "approval:resolved": { approval: AgentWidgetApproval; decision: string };
  /** A durable stream dropped; the widget is about to reconnect. */
  "stream:paused": { executionId: string; after: string };
  /** A reconnect attempt is in flight (`attempt` is 1-based). */
  "stream:resuming": { executionId: string; after: string; attempt: number };
  /** The durable turn resumed and reached its terminal after a reconnect. */
  "stream:resumed": { executionId: string; after: string };
};

/**
 * Layout for the artifact split / drawer (CSS lengths unless noted).
 *
 * **Close behavior:** In desktop split mode, the artifact chrome `Close` control uses the same
 * dismiss path as the mobile drawer (`onDismiss` on the artifact pane): the pane is hidden until
 * new artifact content arrives or the host calls `showArtifacts()` on the widget handle.
 */
export type AgentWidgetArtifactsLayoutConfig = {
  /**
   * Flex gap between chat column and artifact pane.
   * @default 0 (welded); detached uses the panel inset
   * @remarks In welded appearances (`panel` / `seamless`) a nonzero gap opens a
   * visible seam in the single card. It is honored geometrically (resize clamps
   * and the seam handle account for it) but is usually undesired.
   */
  splitGap?: string;
  /** Artifact column width in split mode. @default 40% */
  paneWidth?: string;
  /** Max width of artifact column. @default 28rem */
  paneMaxWidth?: string;
  /** Min width of artifact column (optional). */
  paneMinWidth?: string;
  /**
   * When the floating panel is at most this wide (px), use in-panel drawer for artifacts
   * instead of a side-by-side split (viewport can still be wide).
   * @default 520
   */
  narrowHostMaxWidth?: number;
  /**
   * When true (default), widen the launcher panel while artifacts are visible and not user-dismissed.
   * No-op for inline embed (`launcher.enabled === false`).
   */
  expandLauncherPanelWhenOpen?: boolean;
  /** Panel width when expanded (launcher + artifacts visible). @default min(720px, calc(100vw - 24px)) */
  expandedPanelWidth?: string;
  /**
   * When true, shows a drag handle between chat and artifact columns in desktop split mode only
   * (hidden in narrow-host drawer and viewport ≤640px). Width is not persisted across reloads.
   */
  resizable?: boolean;
  /** Min artifact column width while resizing. Only `px` strings are supported. @default 200px */
  resizableMinWidth?: string;
  /** Optional max artifact width cap while resizing (`px` only). Layout still bounds by chat min width. */
  resizableMaxWidth?: string;
  /**
   * Visual treatment for the artifact column in a desktop split.
   * - `'panel'`: one welded card (border + radius wrap chat + pane) with a hairline
   *   divider on the pane's chat-facing edge, zero gap (default).
   * - `'seamless'`: the same welded card with no internal divider or chrome, zero gap.
   * - `'detached'`: two separate elevated cards: gap from `--persona-panel-inset`,
   *   all-side border and radius on each, and canvas background behind the split.
   *   In an inline embed this also insets the split from the container edges on all
   *   sides (the page canvas shows through), so the all-side margin no longer requires
   *   `launcher.detachedPanel`.
   *
   * Default is `'panel'` unless `launcher.detachedPanel` is true, in which case an unset
   * `paneAppearance` resolves to `'detached'`. An explicit value always wins.
   * @default 'panel'
   */
  paneAppearance?: "panel" | "seamless" | "detached";
  /** Border radius on the artifact pane (CSS length). Works with any `paneAppearance`. */
  paneBorderRadius?: string;
  /** CSS `box-shadow` on the artifact pane. Set `"none"` to suppress the default shadow. */
  paneShadow?: string;
  /**
   * CSS `box-shadow` for the chat column card in a detached split. Defaults to the same
   * elevation as the artifact pane; set to `"none"` to keep the chat flat while the pane stays raised.
   */
  chatShadow?: string;
  /**
   * Chat column surface in a detached split. `"card"` (default) renders the chat as an inset card
   * matching the artifact pane; `"flush"` renders the chat flush with the container (no border, radius,
   * or shadow) and insets only the artifact pane, so the chat is flat background and the pane floats.
   * Only affects an inline-embedded detached split (the container-filling case); in floating, docked,
   * or sidebar modes it falls back to the card look.
   * @default 'card'
   */
  chatSurface?: "card" | "flush";
  /**
   * Full `border` shorthand for the artifact `<aside>` (all sides). Overrides default pane borders.
   * Example: `"1px solid #cccccc"`.
   */
  paneBorder?: string;
  /**
   * `border-left` shorthand only: typical for split view next to chat (with or without resizer).
   * Ignored if `paneBorder` is set. Example: `"1px solid #cccccc"`.
   */
  paneBorderLeft?: string;
  /**
   * @deprecated No-op. Panel and seamless splits now weld into one card by default.
   */
  unifiedSplitChrome?: boolean;
  /**
   * Desktop welded split only: override the artifact pane's outer-right corner radius (CSS length).
   * @default matches the panel radius (`--persona-panel-radius`)
   */
  unifiedSplitOuterRadius?: string;
  /**
   * Strongest override: solid background for the artifact column (CSS color). Sets `--persona-artifact-pane-bg`
   * on the widget root. Leave unset to use theme `components.artifact.pane.background` (defaults to semantic
   * container) so light/dark stays consistent.
   */
  paneBackground?: string;
  /**
   * Horizontal padding for artifact toolbar and content (CSS length), e.g. `24px`.
   */
  panePadding?: string;
  /**
   * Toolbar layout preset.
   * - `default`: "Artifacts" title, horizontal tabs, text close.
   * - `document`: view/source toggle, document title, copy / refresh / close; tab strip hidden when only one artifact.
   * @default 'default'
   */
  toolbarPreset?: "default" | "document";
  /** Visible title in the artifact toolbar. @default "Artifacts" */
  toolbarTitle?: string;
  /** Label for the artifact dismiss control. @default "Close" */
  closeButtonLabel?: string;
  /**
   * When `toolbarPreset` is `document`, show a visible "Copy" label next to the copy icon.
   */
  documentToolbarShowCopyLabel?: boolean;
  /**
   * When `toolbarPreset` is `document`, show a small chevron after the copy control (e.g. menu affordance).
   */
  documentToolbarShowCopyChevron?: boolean;
  /** Document toolbar icon buttons (view, code, copy, refresh, close): CSS color. Sets `--persona-artifact-doc-toolbar-icon-color` on the widget root. */
  documentToolbarIconColor?: string;
  /** Active view/source toggle background. Sets `--persona-artifact-doc-toggle-active-bg`. */
  documentToolbarToggleActiveBackground?: string;
  /** Active view/source toggle border color. Sets `--persona-artifact-doc-toggle-active-border`. */
  documentToolbarToggleActiveBorderColor?: string;
  /** Show an expand/collapse toggle in the artifact toolbar (both presets). Expanded fills the widget with the pane and hides the chat column. Default: false. */
  showExpandToggle?: boolean;
  /** Show the copy control in the `default` toolbar preset (the `document` preset always shows it). Default: false. */
  showCopyButton?: boolean;
  /** Edge fade on the scrollable tab strip. true = both ends (dynamic). @default true */
  tabFade?: boolean | { start?: boolean; end?: boolean };
  /** Tab fade width (CSS length). @default 24px */
  tabFadeSize?: string;
  /**
   * Invoked when the document toolbar Refresh control is used (before the pane re-renders).
   * Use to replay `connectStream`, refetch, etc.
   */
  onDocumentToolbarRefresh?: () => void | Promise<void>;
  /**
   * Optional copy dropdown entries (shown when `documentToolbarShowCopyChevron` is true and this array is non-empty).
   * The main Copy control still performs default copy unless `onDocumentToolbarCopyMenuSelect` handles everything.
   */
  documentToolbarCopyMenuItems?: Array<{ id: string; label: string }>;
  /**
   * When set, invoked for the chevron menu (and can override default copy per `actionId`).
   */
  onDocumentToolbarCopyMenuSelect?: (payload: {
    actionId: string;
    artifactId: string | null;
    markdown: string;
    jsonPayload: string;
  }) => void | Promise<void>;
};

export type PersonaArtifactDisplayMode =
  | "card"    // reference card in transcript; pane opens on click
  | "panel"   // reference card in transcript; pane also auto-opens on artifact_start (current default behavior)
  | "inline"; // artifact preview renders directly in the transcript; no pane involvement

/** Context handed to custom artifact actions. Content fields are best-effort: resolved from live session state or, after a refresh, from the persisted reference-card payload. */
export type PersonaArtifactActionContext = {
  artifactId: string | null;
  title: string;
  artifactType: string;
  markdown?: string;
  file?: PersonaArtifactFileMeta;
  /** Component artifacts: pretty-printed { component, props } JSON. */
  jsonPayload?: string;
};

/**
 * Context passed to a `features.artifacts.statusLabel` function on every
 * artifact streaming update, once per visible surface. Treat it as read-only:
 * the function should be pure and fast (it runs per streaming delta, per
 * surface).
 */
export type PersonaArtifactStatusLabelContext = {
  artifactId: string;
  artifactType: "markdown" | "component";
  title?: string;
  /** The default subject, e.g. "document", "component", or a file type label like "HTML file". */
  typeLabel: string;
  file?: PersonaArtifactFileMeta;
  /** Accumulated streamed content length so far (0 for component artifacts). */
  chars: number;
  /** Accumulated line count so far (0 for component artifacts). */
  lines: number;
  /** Milliseconds since this artifact's first streaming update was seen. */
  elapsedMs: number;
  /** Lazy accessor for the accumulated markdown source (empty string for component artifacts). Call only if needed; parsing cost is opt-in. */
  content: () => string;
  /** Which surface is asking, so hosts can shorten for cramped spots. */
  surface: "card" | "inline-chrome" | "status-body";
};

/** A custom action button rendered in an artifact toolbar/card slot. */
export type PersonaArtifactCustomAction = {
  /** Stable id, used for DOM wiring and keyed re-renders. */
  id: string;
  /** Accessible label; also the visible text when showLabel is true. */
  label: string;
  /** Registry icon name, or a factory returning your own element (e.g. a brand SVG). The factory result is author-owned code, not sanitized wire data. */
  icon?: IconName | (() => HTMLElement | SVGElement);
  /** Render icon + text instead of icon-only. Default: false. */
  showLabel?: boolean;
  /** Per-artifact gate, evaluated on each render. Omitted = always visible. */
  visible?: (ctx: PersonaArtifactActionContext) => boolean;
  /** May be async; rejections are swallowed like built-in action errors. */
  onClick: (ctx: PersonaArtifactActionContext) => void | Promise<void>;
};

export type AgentWidgetArtifactsFeature = {
  /** When true, Persona shows the artifact pane and handles artifact_* SSE events */
  enabled?: boolean;
  /** If set, artifact events for other types are ignored */
  allowedTypes?: PersonaArtifactKind[];
  /**
   * Where artifact bodies render. A single mode applies to all artifacts;
   * the object form sets a default plus per-type overrides.
   * Defaults to "panel" (current behavior).
   */
  display?:
    | PersonaArtifactDisplayMode
    | {
        default?: PersonaArtifactDisplayMode;
        byType?: Partial<Record<PersonaArtifactKind, PersonaArtifactDisplayMode>>;
      };
  /** Split / drawer dimensions and launcher widen behavior */
  layout?: AgentWidgetArtifactsLayoutConfig;
  /**
   * Controls inline preview of previewable file artifacts (HTML/SVG written by
   * a Claude Managed agent). When a markdown artifact carries `file` metadata,
   * the pane can render an isolated `<iframe srcdoc>` sandbox instead of a code
   * block.
   */
  filePreview?: {
    /** Enable rendered preview for html/svg files. Defaults to enabled. Set false to force source view. */
    enabled?: boolean;
    /**
     * `sandbox` attribute for the preview iframe. Defaults to `"allow-scripts"`.
     * `allow-same-origin` is stripped (with a console warning) unless
     * `dangerouslyAllowSameOrigin` is set: the opaque origin is what isolates
     * the preview from the host page. Embedder-trusted config.
     */
    iframeSandbox?: string;
    /**
     * Allows `allow-same-origin` to pass through `iframeSandbox`. Off by
     * default because it lets agent-written file content run with the host
     * page's origin (DOM, storage, credentialed requests). Only set this when
     * every previewed file source is fully trusted.
     */
    dangerouslyAllowSameOrigin?: boolean;
    /**
     * Loading treatment for the preview iframe. Default on.
     *
     * A sandboxed `iframe srcdoc` (opaque origin, `allow-scripts` only) paints
     * blank until its content renders — seconds for artifacts that pull CDN
     * scripts (React/Babel). The default shows a themed "Loading preview…"
     * overlay over the iframe, dismissed the instant the content signals it has
     * painted (an injected `postMessage` reporter) or a hard timeout elapses.
     *
     * `false` disables the overlay and the injected ready signal entirely (the
     * srcdoc becomes the raw file source, the prior behavior). An object tunes
     * the timing; omitted / `true` uses all defaults.
     */
    loading?:
      | boolean
      | {
          /** Show the overlay only if the preview is not ready after this many ms. Default 200. */
          delayMs?: number;
          /** Once shown, keep the overlay visible at least this long (anti-flicker). Default 300. */
          minVisibleMs?: number;
          /** Give up waiting and reveal the iframe regardless after this many ms. Default 8000. */
          timeoutMs?: number;
          /**
           * Append the `postMessage` ready reporter to the srcdoc so the overlay
           * dismisses on first paint rather than the iframe `load` event (which
           * fires before post-DOMContentLoaded rendering like Babel compilation).
           * Default true. When false, the overlay dismisses on `load` + a double
           * `requestAnimationFrame`, or the timeout.
           */
          injectReadySignal?: boolean;
          /**
           * Escalation text shown beside the spinner after `labelDelayMs`.
           * Default `"Starting preview..."`. `false` renders an icon-only
           * indicator forever (no text ever). A short work-naming label is
           * added only after a delay by design — icon-first, with text reserved
           * for genuinely slow loads (per Geist/Sandpack guidance; HIG warns
           * against the vague word "loading").
           */
          label?: string | false;
          /**
           * Delay before the escalation label fades in, measured from when the
           * overlay actually becomes visible (i.e. after `delayMs`), not from
           * iframe creation. Default 2000.
           */
          labelDelayMs?: number;
          /**
           * Full replacement for the default indicator (spinner + escalation
           * label). Called once when the overlay is built; return any element
           * (a brand mark, skeleton, custom animation) to own the indicator
           * content entirely (the escalation-label logic is then skipped), or
           * return `null` to fall back to the default. A thrown error also falls
           * back. Mirrors `renderInline` / `renderCard`'s null-falls-back
           * contract. The overlay backdrop, timing, and dismissal stay
           * widget-owned either way.
           */
          renderIndicator?: (ctx: {
            artifactId: string;
            config: AgentWidgetConfig;
          }) => HTMLElement | null;
        };
  };
  /**
   * Custom action buttons for the artifact pane toolbar, rendered between the
   * refresh and expand/close controls in both toolbar presets. Re-read on live
   * config updates.
   */
  toolbarActions?: PersonaArtifactCustomAction[];
  /**
   * Custom action buttons for the artifact reference card, rendered before the
   * Download button on complete artifacts. Clicks are delegated, so they
   * survive re-renders and page refresh.
   */
  cardActions?: PersonaArtifactCustomAction[];
  /**
   * File chrome (title bar + toolbar) around inline preview blocks
   * (`display: "inline"`). Default when undefined: chrome on, with the built-in
   * Copy and Expand controls. Pass `false` to render the bare preview body
   * (frame → padded body, no chrome bar), or an object to toggle the built-in
   * controls individually.
   *
   * Note: default-on chrome adds a title bar and buttons to every existing
   * inline host on upgrade; set `inlineChrome: false` to opt out.
   */
  inlineChrome?:
    | boolean
    | {
        /** Show the built-in Copy button (complete artifacts only). Default true. */
        showCopy?: boolean;
        /** Show the built-in Expand button (opens the pane for this artifact). Default true. */
        showExpand?: boolean;
        /**
         * Show the built-in rendered/source view toggle (complete artifacts
         * only). Default true. The toggle is availability-gated: it appears only
         * for file-backed markdown artifacts that have a rendered alternative to
         * their source (previewable HTML/SVG, or markdown-kind files), and never
         * when `inlineBody.viewMode: "source"` forces a source-only body. Plain
         * markdown and component artifacts don't get it (the pane toggle covers
         * those).
         */
        showViewToggle?: boolean;
      };
  /**
   * Custom action buttons for the inline chrome toolbar, rendered before the
   * built-in Copy/Expand controls on complete artifacts. Same shape as
   * `cardActions`; each action's `visible` gate is respected and clicks are
   * delegated, so they survive re-renders and page refresh.
   */
  inlineActions?: PersonaArtifactCustomAction[];
  /**
   * Replace the artifact tab strip entirely (Seam A). Return an element mounted in
   * place of the built-in `.persona-artifact-list`; the pane still owns the toolbar,
   * preview body, iframe reuse, and lazy-render gate. Re-invoked when the records or
   * selection change. Custom bars own their own accessibility; use `createRovingTablist`
   * to keep keyboard/tablist behavior. When set, the built-in strip (scroll, fade,
   * tablist) is not rendered.
   *
   * Return either a fresh element per call, or the SAME element updated in place.
   * Returning a stable element preserves internal state across selection changes:
   * the pane skips remounting an unchanged node, so a roving tablist keeps keyboard
   * focus on the selected tab (a fresh element per call drops focus and breaks
   * Arrow-key nav). See the reference bars in `apps/web/src/artifact-demo.ts`.
   */
  renderTabBar?: (ctx: {
    records: PersonaArtifactRecord[];
    selectedId: string | null;
    onSelect: (id: string) => void;
  }) => HTMLElement;
  /**
   * Body layout for inline artifact blocks (`display: "inline"`). Controls how
   * the block reserves height and behaves while a file/document artifact
   * streams, so the streaming source no longer grows an unbounded `<pre>` and
   * then snaps to the completed preview. Affects only the inline block; the
   * artifact pane is unchanged.
   *
   * Defaults (a behavior change from prior versions, which grew with content
   * during streaming): a fixed 320px streaming source window with tail-follow,
   * a top edge fade, and an animated streaming→complete swap. Pass
   * `height: "auto"` to restore the old grow-with-content streaming behavior.
   */
  inlineBody?: {
    /** What the body shows while streaming. Default `"source"`. */
    streamingView?: "source" | "status";
    /**
     * How the completed body renders. `"rendered"` (default) keeps the current
     * behavior: file previews in a sandboxed iframe, markdown through the
     * markdown pipeline. `"source"` always shows the raw syntax-highlighted
     * source instead — for hosts where the artifact is input to the host system
     * (a code editor, a query runner) rather than something to preview. Unlike
     * `filePreview.enabled: false`, this also covers markdown-kind files and
     * plain markdown artifacts. Component artifacts always render through the
     * registry.
     */
    viewMode?: "rendered" | "source";
    /**
     * Body height per state. A number reserves that many px for the whole body
     * region (border-box, padding included) with internal scroll — the
     * zero-layout-shift path; `"auto"` means content-sized. A
     * scalar applies to both the streaming and complete states; the object form
     * sets them independently. Default `320` for both states.
     *
     * Note: with `"auto"` on the complete state, non-iframe bodies (rendered
     * markdown, source view, component) are content-sized, but a file-preview
     * iframe cannot be content-sized without postMessage plumbing, so it falls
     * back to the CSS-var default (`--persona-artifact-inline-frame-height`,
     * 320px).
     *
     * Numeric heights are applied via the CSS var
     * `--persona-artifact-inline-body-height` on the block root. The older
     * `--persona-artifact-inline-frame-height` var still overrides the iframe
     * height when this one is unset, so themes pinned to it keep working.
     */
    height?:
      | number
      | "auto"
      | { streaming?: number | "auto"; complete?: number | "auto" };
    /**
     * Tail-follow the newest streamed lines in a fixed-height source window: if
     * the viewport is already at the bottom, keep it pinned as content arrives;
     * if the reader scrolled up, don't fight them. Only meaningful for a numeric
     * streaming height. Default `true`.
     *
     * Precedence: ignored when `overflow: "clip"` (a clipped window shows the
     * top of the document and never scrolls, so there is no tail to follow).
     */
    followOutput?: boolean;
    /**
     * How a fixed-height source window handles content taller than the window.
     *
     * - `"scroll"` (default) — the current behavior: an internally scrollable
     *   window that tail-follows the newest streamed lines (see `followOutput`),
     *   so the reader sees the growing tail of the document.
     * - `"clip"` — a fixed-height window that shows the TOP of the document,
     *   `overflow: hidden` with no internal scroll and no tail-follow
     *   (`followOutput` is ignored in this mode). When content overflows the
     *   window a bottom edge fade signals there is more below (the top is always
     *   visible, so a top fade never applies); an explicit `fadeMask` still wins
     *   over this clip-mode default. When the inline chrome's Expand control is
     *   enabled the whole body doubles as an expand hitbox (click / Enter / Space
     *   opens the artifact in the pane), matching the industry inline-card
     *   pattern; otherwise the clip is purely visual.
     *
     * Only meaningful for a numeric streaming/complete height. Default
     * `"scroll"`.
     */
    overflow?: "scroll" | "clip";
    /**
     * Edge fade masks on the fixed-height streaming window (a top fade signals
     * clipped content above, a bottom fade signals clipped content below). Each
     * fade renders only when content is actually clipped on that edge, so with
     * tail-follow pinned at the bottom the bottom fade stays inert until the
     * reader scrolls up mid-stream. `true` = `{ top: true, bottom: true }`,
     * `false` = none. Default `{ top: true, bottom: true }`.
     */
    fadeMask?: boolean | { top?: boolean; bottom?: boolean };
    /**
     * Animate the streaming→complete body swap. `"auto"` uses the View
     * Transitions API when supported and `prefers-reduced-motion` is off;
     * `"none"` swaps instantly. Default `"auto"`.
     */
    transition?: "auto" | "none";
    /**
     * What the block becomes once the artifact completes.
     *
     * - `"inline"` (default) — the streamed body stays inline forever, as
     *   configured by the other `inlineBody` options.
     * - `"card"` — the block streams inline as configured, then collapses to the
     *   compact artifact reference card once the artifact completes (the Copilot
     *   "chiclet" / Claude side-panel handoff pattern), keeping the thread
     *   scannable. The collapse plays as a short CSS height transition (skipped
     *   under `prefers-reduced-motion`); it does not use the View Transitions
     *   API, so `transition` does not affect it. After the collapse the card's
     *   normal actions apply (click opens the artifact pane). `viewMode`, the
     *   inline rendered/source view toggle, `inlineActions`, and inline copy are
     *   streaming-phase-only in this mode and inert once the block is a card
     *   (there is nothing to toggle or copy on a collapsed card). Blocks that are
     *   already complete when they first render (page-refresh hydration) render
     *   the card directly, with no flash of the inline body and no animation.
     *
     * Default `"inline"`.
     */
    completeDisplay?: "inline" | "card";
  };
  /**
   * Called when an artifact action is triggered (open, download, expand).
   * Return `true` to intercept: the widget then does not change state.
   * For `expand`, `expanded` is the state the toggle is about to enter and
   * `artifactId` is the currently selected artifact (or `null` when none).
   */
  onArtifactAction?: (
    action:
      | { type: 'open' | 'download'; artifactId: string }
      | { type: 'expand'; artifactId: string | null; expanded: boolean }
  ) => boolean | void;
  /**
   * Custom renderer for artifact reference cards shown in the message thread.
   * Return an HTMLElement to replace the default card, or `null` to use the default.
   */
  renderCard?: (context: {
    artifact: {
      artifactId: string;
      title: string;
      artifactType: string;
      status: string;
    };
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
  }) => HTMLElement | null;
  /**
   * Custom renderer for inline artifact blocks (display: "inline"), mirroring
   * `renderCard`. Return an element to replace the default inline preview,
   * or null to use the default.
   */
  renderInline?: (context: {
    artifact: {
      artifactId: string;
      title: string;
      artifactType: string;
      status: string;
    };
    config: AgentWidgetConfig;
    defaultRenderer: () => HTMLElement;
  }) => HTMLElement | null;
  /**
   * Text shown while an artifact streams, in place of the default
   * `Generating <type>...` status. Applies to every streaming surface: the
   * reference card status line, the inline chrome meta label, and the inline
   * streaming status body (`inlineBody.streamingView: "status"`).
   *
   * - A plain string replaces the default label everywhere (localization or
   *   brand voice).
   * - A function is called on every artifact update for each visible surface;
   *   it must be pure and fast. Returning a string sets the animated label
   *   only. Returning `{ label, detail }` splits the status into an animated
   *   label (re-applied only when its text changes, so the loading animation
   *   stays stable) and a plain un-animated detail span that may update freely
   *   per delta (live counters).
   *
   * Default when unset: the current behavior, `Generating <type>...` with no
   * detail. If the function throws, the default label is used for that update
   * (a bad host callback must never break rendering). There is deliberately no
   * percent progress: streams do not announce total length, so counts and
   * elapsed time are the only truthful signals.
   */
  statusLabel?:
    | string
    | ((ctx: PersonaArtifactStatusLabelContext) =>
        | string
        | { label: string; detail?: string });
  /**
   * Animation applied to the artifact card's "Generating …" status text while
   * the artifact streams. Character-by-character modes (`shimmer`,
   * `shimmer-color`, `rainbow`) wrap each character in a span with a staggered
   * `animation-delay`; `pulse` fades the whole status text; `none` disables the
   * animation. Honors `prefers-reduced-motion`.
   * @default "shimmer"
   */
  loadingAnimation?: AgentWidgetToolCallLoadingAnimation;
  /**
   * Duration of one full animation cycle in milliseconds.
   * Applies to pulse, shimmer, shimmer-color, and rainbow modes.
   * @default 2000
   */
  loadingAnimationDuration?: number;
  /**
   * Primary color for shimmer-color animation mode.
   * Defaults to the current text color.
   */
  loadingAnimationColor?: string;
  /**
   * Secondary/end color for shimmer-color animation mode.
   * Creates a gradient sweep between `loadingAnimationColor` and this color.
   * @default "#3b82f6"
   */
  loadingAnimationSecondaryColor?: string;
};

/**
 * How the transcript scrolls while an assistant response streams in.
 *
 * - `"anchor-top"` (default): on send, scroll the user's message near the top
 *   of the viewport and hold it there while the response streams in beneath it
 *   (ChatGPT-style). When a turn has no user send to anchor to (a proactive
 *   greeting, an injected assistant message, a resubmit, or first-load
 *   streaming), it falls back to `"follow"` for that turn so content never
 *   streams in off-screen.
 * - `"follow"`: keep the newest content pinned to the bottom of the viewport,
 *   pausing when the user scrolls up and resuming when they return to the
 *   bottom. This was the default before 4.x.
 * - `"none"`: never auto-scroll; the scroll-to-bottom affordance is the only
 *   way back to the latest content.
 */
export type AgentWidgetScrollMode = "follow" | "anchor-top" | "none";

/**
 * Where the transcript lands when a *saved* conversation is reopened (restored
 * from the storage adapter / `initialMessages`), as opposed to a fresh send.
 *
 * - `"bottom"` (default): jump to the absolute end of the transcript, matching
 *   the historical behavior.
 * - `"last-user-turn"`: pin the last user message near the top of the viewport
 *   (the last point the reader was actively driving the conversation) so a long
 *   restored thread opens at a readable place rather than at the very bottom.
 */
export type AgentWidgetScrollRestorePosition = "bottom" | "last-user-turn";

export type AgentWidgetScrollBehaviorFeature = {
  /** Scroll behavior during streamed responses. @default "anchor-top" */
  mode?: AgentWidgetScrollMode;
  /**
   * Gap (px) kept between the anchored user message and the top of the
   * viewport in `"anchor-top"` mode. Also used as the gap for
   * `restorePosition: "last-user-turn"`.
   * @default 16
   */
  anchorTopOffset?: number;
  /**
   * Where to land when a saved conversation reopens. Additive and opt-in: the
   * default preserves the historical "jump to the bottom" behavior.
   * @default "bottom"
   */
  restorePosition?: AgentWidgetScrollRestorePosition;
  /**
   * When true, interactions beyond text selection — keyboard navigation
   * (PageUp/PageDown/Home/End/arrows) inside the transcript and focusing a
   * link or other interactive element within it — also pause auto-follow in
   * `"follow"` mode. Treats "the reader is doing something here" as intent to
   * stay put, not just "the reader dragged a selection". Opt-in; default keeps
   * only the existing wheel/scroll/selection triggers.
   * @default false
   */
  pauseOnInteraction?: boolean;
  /**
   * When true, the scroll-to-bottom affordance also surfaces new-content and
   * still-streaming activity while the reader is pinned away from the latest
   * content in `"anchor-top"` mode. Lets the reader know a response is arriving
   * offscreen below. Defaults on alongside the `"anchor-top"` default; set
   * `false` to keep the count + streaming hint silent while pinned.
   * @default true
   */
  showActivityWhilePinned?: boolean;
  /**
   * When true, Persona maintains a visually-hidden `aria-live="polite"` region
   * that announces important transcript events — a response starting, a
   * response finishing, and "N new messages below" while the reader is scrolled
   * away — at a comfortable cadence (never token-by-token). Opt-in so existing
   * embeds don't suddenly gain screen-reader announcements.
   * @default false
   */
  announce?: boolean;
};

export type AgentWidgetScrollToBottomFeature = {
  /**
   * When true, Persona shows a scroll-to-bottom affordance when the user breaks
   * away from the latest transcript or event stream content.
   * @default true
   */
  enabled?: boolean;
  /**
   * Lucide icon name used for the affordance.
   * @default "arrow-down"
   */
  iconName?: string;
  /**
   * Optional label text shown next to the icon. Set to an empty string for an
   * icon-only affordance.
   * @default ""
   */
  label?: string;
};

export type AgentWidgetToolCallCollapsedMode =
  | "tool-call"
  | "tool-name"
  | "tool-preview";

/**
 * Animation mode applied to tool call header text while the tool is running.
 * Character-by-character modes (`shimmer`, `shimmer-color`, `rainbow`) wrap each
 * character in a span with staggered `animation-delay`. `pulse` applies to the
 * entire text container. Honors `prefers-reduced-motion`.
 */
export type AgentWidgetToolCallLoadingAnimation =
  | "none"
  | "pulse"
  | "shimmer"
  | "shimmer-color"
  | "rainbow";

export type AgentWidgetToolCallDisplayFeature = {
  /**
   * Controls what collapsed tool call rows show in their header/summary area.
   * @default "tool-call"
   */
  collapsedMode?: AgentWidgetToolCallCollapsedMode;
  /**
   * When true, active collapsed tool calls can render a lightweight preview block.
   * @default false
   */
  activePreview?: boolean;
  /**
   * Optional CSS min-height applied to active collapsed tool call rows.
   * @default undefined (no min-height)
   * @example "100px"
   */
  activeMinHeight?: string;
  /**
   * Maximum preview lines shown for collapsed active tool calls.
   * @default 3
   */
  previewMaxLines?: number;
  /**
   * When true, consecutive tool call rows can be visually grouped.
   * @default false
   */
  grouped?: boolean;
  /**
   * Controls how a grouped tool sequence is rendered.
   * - `"stack"`: show the group summary and each child tool row.
   * - `"summary"`: show one consolidated summary row only.
   * @default "stack"
   */
  groupedMode?: "stack" | "summary";
  /**
   * When false, tool call bubbles show only the collapsed summary with no
   * expand/collapse toggle. Users see tool awareness without full details.
   * @default true
   */
  expandable?: boolean;
  /**
   * Animation mode applied to the tool call header text while the tool is active.
   * - "none": static text, no animation
   * - "pulse": opacity pulse on the entire header text
   * - "shimmer": monochrome opacity sweep per character
   * - "shimmer-color": color gradient sweep per character
   * - "rainbow": rainbow color cycle per character
   * @default "none"
   */
  loadingAnimation?: AgentWidgetToolCallLoadingAnimation;
};

export type AgentWidgetReasoningDisplayFeature = {
  /**
   * When true, active collapsed reasoning rows can render a lightweight preview block.
   * @default false
   */
  activePreview?: boolean;
  /**
   * Optional CSS min-height applied to active collapsed reasoning rows.
   */
  activeMinHeight?: string;
  /**
   * Maximum preview lines shown for collapsed active reasoning rows.
   * @default 3
   */
  previewMaxLines?: number;
  /**
   * When false, reasoning bubbles show only the collapsed summary with no
   * expand/collapse toggle. Users see reasoning awareness without full details.
   * @default true
   */
  expandable?: boolean;
  /**
   * Animation mode applied to the reasoning header text while reasoning is active.
   * Reuses the same modes as tool call animations.
   * - "none": static text, no animation
   * - "pulse": opacity pulse on the entire header text
   * - "shimmer": monochrome opacity sweep per character
   * - "shimmer-color": color gradient sweep per character
   * - "rainbow": rainbow color cycle per character
   * @default "none"
   */
  loadingAnimation?: AgentWidgetToolCallLoadingAnimation;
};

/**
 * Reveal animation applied to assistant message text while it is streaming.
 *
 * Built-in types always available:
 * - `none`: text appears as tokens arrive (default).
 * - `typewriter`: characters fade in with a blinking caret.
 * - `pop-bubble`: the bubble scales in; text streams normally afterward.
 * - `letter-rise`: per-char translateY + fade reveal.
 * - `word-fade`: per-word blur + translateY fade-in.
 *
 * Subpath plugins (import from `@runtypelabs/persona/animations/*` to register):
 * - `wipe`, `glyph-cycle`.
 *
 * Custom types are allowed: register a plugin with any string name and
 * reference it by that name in `type`.
 */
export type AgentWidgetStreamAnimationBuiltinType =
  | "none"
  | "typewriter"
  | "word-fade"
  | "letter-rise"
  | "glyph-cycle"
  | "wipe"
  | "pop-bubble";

export type AgentWidgetStreamAnimationType =
  | AgentWidgetStreamAnimationBuiltinType
  | (string & {});

/**
 * Placeholder shown inside a streaming assistant bubble before the first token arrives.
 * - `none`: use the default typing-dots indicator (existing behavior).
 * - `skeleton`: shimmer bars, replaced by streaming content once it starts.
 */
export type AgentWidgetStreamAnimationPlaceholder = "none" | "skeleton";

/**
 * How much of the accumulated streaming content to display while tokens are
 * still arriving. Trimming to a boundary means in-progress words or lines
 * stay hidden until they complete: useful for animations that benefit from
 * unit-complete reveals (e.g. wipe, glyph-cycle).
 * - `none`: show every character as it arrives (default).
 * - `word`: trim to the last whitespace boundary.
 * - `line`: trim to the last newline boundary.
 */
export type AgentWidgetStreamAnimationBuffer = "none" | "word" | "line";

/**
 * Context passed to plugin lifecycle hooks. Carries the live DOM references
 * and resolved animation settings for the currently-streaming message.
 */
export type StreamAnimationContext = {
  /** The `.persona-message-content` element owning the streamed text. */
  container: HTMLElement;
  /** The outer message bubble element. */
  bubble: HTMLElement;
  /** ID of the streaming message. */
  messageId: string;
  /** Read-only reference to the message being streamed. */
  message: AgentWidgetMessage;
  /** Effective `speed` from `streamAnimation.speed`. */
  speed: number;
  /** Effective `duration` from `streamAnimation.duration`. */
  duration: number;
};

/**
 * Pluggable stream animation. Third-party packages and inline registrations
 * implement this interface to add custom reveal effects.
 *
 * Lifecycle:
 * - When the widget mounts and detects a plugin (either passed via config or
 *   auto-registered in the IIFE bundle), it injects `styles` once into the
 *   widget's style host.
 * - For each streaming assistant message whose `type` matches `name`, the
 *   widget applies `containerClass` / `bubbleClass`, wraps text per `wrap`,
 *   and, if `useCaret` is true, appends a blinking caret.
 * - Hooks fire after the live DOM is morphed; plugins use stable element IDs
 *   and `data-preserve-animation` to safely mutate per-char or per-word spans
 *   without idiomorph clobbering in-flight work.
 */
export type StreamAnimationPlugin = {
  /** Plugin identifier. Matches the `type` field in `streamAnimation`. */
  name: string;
  /** Class added to `.persona-message-content` while streaming. */
  containerClass?: string;
  /** Class added to the bubble element (e.g. a one-shot scale animation). */
  bubbleClass?: string;
  /** Wrap mode applied to text nodes during streaming. @default "none" */
  wrap?: "none" | "char" | "word";
  /**
   * HTML tags whose descendant text is skipped during wrapping. Defaults to
   * `["pre", "code", "a", "script", "style"]`: useful for keeping code
   * blocks legible and link click-targets intact. Plugins that want to
   * animate characters inside inline code (e.g. `glyph-cycle`) can narrow
   * the list.
   */
  skipTags?: string[];
  /** Append a blinking caret after the last rendered char/word. */
  useCaret?: boolean;
  /** CSS string injected into the widget style host on first activation. */
  styles?: string;
  /**
   * Optional custom buffering strategy. Returns the portion of `content`
   * that should be rendered during streaming. Use this for buffering
   * schemes beyond the built-in `word` / `line` strategies.
   */
  bufferContent?: (content: string, message: AgentWidgetMessage) => string;
  /**
   * Fires once when the plugin is first activated inside a widget instance.
   * Use this to set up MutationObservers or other long-lived listeners.
   * Return an optional cleanup function that runs on widget destroy.
   */
  onAttach?: (root: HTMLElement | ShadowRoot) => (() => void) | void;
  /** Fires after each render that reaches the live DOM. */
  onAfterRender?: (ctx: StreamAnimationContext) => void;
  /** Fires when a streamed message's `streaming` flag flips to false. */
  onStreamComplete?: (ctx: StreamAnimationContext) => void;
  /**
   * Report whether the plugin still has in-flight animation work for a
   * message. When `true`, the widget keeps rendering the message in its
   * "streaming-animated" mode even after `message.streaming` flips false:   * preventing the final non-animated render from yanking the rug out from
   * under unfinished per-char cycles or reveals.
   */
  isAnimating?: (message: AgentWidgetMessage) => boolean;
};

export type AgentWidgetStreamAnimationFeature = {
  /** Reveal animation to apply while streaming. @default "none" */
  type?: AgentWidgetStreamAnimationType;
  /** Pre-first-token placeholder. @default "none" */
  placeholder?: AgentWidgetStreamAnimationPlaceholder;
  /**
   * Per-unit animation duration (ms) for `typewriter`, `letter-rise`, `word-fade`,
   * and per-unit plugin animations. Each arriving character/word animates from
   * invisible to visible over this duration, independent of its position: the
   * streaming cadence itself provides the visible stagger.
   * @default 120
   */
  speed?: number;
  /**
   * Total duration of container-level animations (`pop-bubble` and custom
   * plugin animations), in milliseconds.
   * @default 1800
   */
  duration?: number;
  /**
   * Trim the accumulated streaming content to a word or line boundary before
   * rendering. Hides in-progress units until they complete.
   * @default "none"
   */
  buffer?: AgentWidgetStreamAnimationBuffer;
  /**
   * Extra animation plugins available to this widget instance. Keys are
   * plugin names; the matching plugin activates when `type` is set to that
   * name. Built-in types (`typewriter`, `pop-bubble`) are always registered.
   */
  plugins?: Record<string, StreamAnimationPlugin>;
};

export type AgentWidgetFeatureFlags = {
  showReasoning?: boolean;
  showToolCalls?: boolean;
  showEventStreamToggle?: boolean;
  /**
   * Up/Down arrow navigation through previously sent user messages in the
   * composer, for quick re-entry or editing (shell / Slack style). History is
   * only entered when the caret is at the start of the input, so normal
   * multi-line cursor movement is preserved. Set to `false` to disable.
   * @default true
   */
  composerHistory?: boolean;
  /** Shared transcript + event stream scroll-to-bottom affordance. */
  scrollToBottom?: AgentWidgetScrollToBottomFeature;
  /** Transcript scroll behavior during streamed responses. */
  scrollBehavior?: AgentWidgetScrollBehaviorFeature;
  /** Collapsed transcript behavior for tool call rows. */
  toolCallDisplay?: AgentWidgetToolCallDisplayFeature;
  /** Collapsed transcript behavior for reasoning rows. */
  reasoningDisplay?: AgentWidgetReasoningDisplayFeature;
  /** Configuration for the Event Stream inspector view */
  eventStream?: EventStreamConfig;
  /** Optional artifact sidebar (split pane / mobile drawer) */
  artifacts?: AgentWidgetArtifactsFeature;
  /** Reveal animation for streaming assistant text. */
  streamAnimation?: AgentWidgetStreamAnimationFeature;
  /**
   * Built-in interactive answer-pill sheet shown when the assistant invokes
   * the `ask_user_question` tool. Slides up over the composer with tappable
   * pills + optional free-text input.
   */
  askUserQuestion?: AgentWidgetAskUserQuestionFeature;
  /**
   * Built-in `suggest_replies` quick-reply chips. When the assistant invokes
   * the tool, the widget shows the suggestions as tappable chips above the
   * composer (reusing the suggestion-chips surface) and immediately resumes
   * the execution: fire-and-forget, no user input awaited.
   */
  suggestReplies?: AgentWidgetSuggestRepliesFeature;
};

/**
 * Feature config for the built-in `suggest_replies` quick-reply chips.
 * Chips render in the existing suggestions slot above the composer and are
 * styled by the widget-level `suggestionChipsConfig`. A tapped chip is sent
 * verbatim as the user's next message; chips clear once any user message
 * follows them.
 */
export type AgentWidgetSuggestRepliesFeature = {
  /**
   * Enable the feature. Defaults to true. When false, `suggest_replies`
   * renders as a regular tool bubble and is NOT auto-resumed: only set this
   * with no server-side `suggest_replies` declaration, or the execution
   * parks awaiting a resume that never comes.
   */
  enabled?: boolean;
  /**
   * Advertise the built-in `suggest_replies` tool to the agent on every
   * dispatch via `clientTools[]`: no server-side `runtimeTools` declaration
   * needed. Defaults to `false`: flows that already declare the tool via
   * `runtimeTools` would otherwise present it to the model twice. Ignored
   * when `enabled` is `false`.
   */
  expose?: boolean;
};

/**
 * Single selectable option in an `ask_user_question` prompt.
 * Mirrors Anthropic's AskUserQuestion schema.
 */
export type AskUserQuestionOption = {
  /** Pill label (required). */
  label: string;
  /** Optional long-form description (shown as a subtitle on tap-hover). */
  description?: string;
  /** Optional rich preview: reserved for future rendering; ignored in v1. */
  preview?: string;
};

/**
 * A single question in an `ask_user_question` tool call.
 * The tool may carry 1–8 prompts. When more than one is supplied, the built-in
 * renderer paginates them as a "Question N of M" stepper with Back / Next /
 * Submit-all controls; single-question payloads render without stepper chrome.
 */
export type AskUserQuestionPrompt = {
  /** The question text shown to the user. */
  question: string;
  /** Optional short header label (≤12 chars) used as a compact group title. */
  header?: string;
  /** 2–4 selectable options. */
  options: AskUserQuestionOption[];
  /** When true, the user can pick multiple options and submit together. Default false. */
  multiSelect?: boolean;
  /** When true, a free-text "Other…" pill expands to an input. Default true. */
  allowFreeText?: boolean;
};

/** Parsed payload of an `ask_user_question` tool call. */
export type AskUserQuestionPayload = {
  /** 1–8 questions. Anything beyond the renderer's cap is truncated with a console warning. */
  questions: AskUserQuestionPrompt[];
};

/**
 * Style overrides for the answer-pill sheet. All values are raw CSS strings
 * and are plumbed through as CSS custom properties on the sheet root.
 */
export type AgentWidgetAskUserQuestionStyles = {
  sheetBackground?: string;
  sheetBorder?: string;
  sheetShadow?: string;
  pillBackground?: string;
  pillBackgroundSelected?: string;
  pillTextColor?: string;
  pillTextColorSelected?: string;
  pillBorderRadius?: string;
  customInputBackground?: string;
};

/**
 * Feature config for the built-in `ask_user_question` answer-pill sheet.
 * When a tool call with the name `ask_user_question` arrives, the widget
 * renders an interactive sheet over the composer in place of the generic
 * tool bubble.
 */
export type AgentWidgetAskUserQuestionFeature = {
  /** Enable the feature. Defaults to true. When false, `ask_user_question` renders as a regular tool bubble. */
  enabled?: boolean;
  /**
   * Advertise the built-in `ask_user_question` tool to the agent on every
   * dispatch via `clientTools[]`: no server-side `runtimeTools` declaration
   * needed. The tool ships with a model-facing description and JSON schema
   * matching {@link AskUserQuestionPayload}; when the model calls it, the
   * existing answer-pill sheet renders and the answer resumes the execution.
   *
   * Defaults to `false`: flows that already declare `ask_user_question` via
   * `runtimeTools` would otherwise present the tool to the model twice.
   * Ignored when `enabled` is `false`: never offer the agent a question
   * tool the widget can't render an answer UI for.
   */
  expose?: boolean;
  /** Slide-in animation duration in ms. Defaults to 180. */
  slideInMs?: number;
  /** Label for the free-text pill. Defaults to "Other…". */
  freeTextLabel?: string;
  /** Placeholder text in the free-text input. Defaults to "Type your answer…". */
  freeTextPlaceholder?: string;
  /** Button label for submitting multi-select / free-text answers. Defaults to "Send". */
  submitLabel?: string;
  /** Button label advancing to the next question in grouped (paginated) payloads. Defaults to "Next". */
  nextLabel?: string;
  /** Button label moving back to the previous question in grouped payloads. Defaults to "Back". */
  backLabel?: string;
  /** Button label submitting all answers from the final page of a grouped payload. Defaults to "Submit all". */
  submitAllLabel?: string;
  /**
   * In grouped (multi-question) mode, auto-advance to the next page after a
   * single-select pill pick or free-text submit on intermediate pages.
   * Defaults to `true`. The final page never auto-submits: users always
   * confirm with an explicit "Submit all" click. Multi-select pages always
   * require an explicit Next regardless of this setting.
   */
  groupedAutoAdvance?: boolean;
  /**
   * Visual layout for the option list.
   * - `"rows"` (default): full-width stacked rows with always-visible
   *   descriptions, right-edge number badges (single-select) or checkboxes
   *   (multi-select), and an always-visible inline "Other" input.
   * - `"pills"`: legacy compact pill list with horizontal wrap; description
   *   surfaces as a tooltip and the "Other…" pill expands on click.
   */
  layout?: "rows" | "pills";
  /**
   * Button label for skipping the current question in grouped payloads.
   * Defaults to "Skip". On intermediate pages Skip advances without recording
   * an answer; on the final page Skip submits the partial answer record
   * (skipped questions absent from the resolved object). For single-question
   * payloads Skip behaves like dismiss.
   */
  skipLabel?: string;
  /** Style overrides for the sheet and pills. */
  styles?: AgentWidgetAskUserQuestionStyles;
};

export type SSEEventRecord = {
  id: string;
  type: string;
  timestamp: number;
  payload: string;
};

// ============================================================================
// Event Stream Configuration Types
// ============================================================================

/**
 * Badge color configuration for event stream event types.
 */
export type EventStreamBadgeColor = {
  /** Background color (CSS value) */
  bg: string;
  /** Text color (CSS value) */
  text: string;
};

/**
 * Configuration for the Event Stream inspector view.
 */
export type EventStreamConfig = {
  /**
   * Custom badge color mappings by event type prefix or exact type.
   * Keys are matched as exact match first, then prefix match (keys ending with "_").
   * @example { "flow_": { bg: "#dcfce7", text: "#166534" }, "error": { bg: "#fecaca", text: "#991b1b" } }
   */
  badgeColors?: Record<string, EventStreamBadgeColor>;
  /**
   * Timestamp display format.
   * - "relative": Shows time offset from first event (+0.000s, +0.361s)
   * - "absolute": Shows wall-clock time (HH:MM:SS.mmm)
   * @default "relative"
   */
  timestampFormat?: "absolute" | "relative";
  /**
   * Whether to show sequential event numbers (1, 2, 3...).
   * @default true
   */
  showSequenceNumbers?: boolean;
  /**
   * Maximum events to keep in the ring buffer.
   * @default 500
   */
  maxEvents?: number;
  /**
   * Fields to extract from event payloads for description text.
   * The first matching field value is displayed after the badge.
   * @default ["flowName", "stepName", "name", "tool", "toolName"]
   */
  descriptionFields?: string[];
  /**
   * Custom CSS class names to append to event stream UI elements.
   * Each value is a space-separated class string appended to the element's default classes.
   */
  classNames?: {
    /** The toggle button in the widget header (activity icon). */
    toggleButton?: string;
    /** Additional classes applied to the toggle button when the event stream is open. */
    toggleButtonActive?: string;
    /** The outer event stream panel/container. */
    panel?: string;
    /** The toolbar header bar (title, filter, copy all). */
    headerBar?: string;
    /** The search bar wrapper. */
    searchBar?: string;
    /** The search text input. */
    searchInput?: string;
    /** Each event row wrapper. */
    eventRow?: string;
    /** The "new events" scroll indicator pill. */
    scrollIndicator?: string;
  };
};

/**
 * Context for the renderEventStreamView plugin hook.
 */
export type EventStreamViewRenderContext = {
  config: AgentWidgetConfig;
  events: SSEEventRecord[];
  defaultRenderer: () => HTMLElement;
  onClose?: () => void;
};

/**
 * Context for the renderEventStreamRow plugin hook.
 */
export type EventStreamRowRenderContext = {
  event: SSEEventRecord;
  index: number;
  config: AgentWidgetConfig;
  defaultRenderer: () => HTMLElement;
  isExpanded: boolean;
  onToggleExpand: () => void;
};

/**
 * Context for the renderEventStreamToolbar plugin hook.
 */
export type EventStreamToolbarRenderContext = {
  config: AgentWidgetConfig;
  defaultRenderer: () => HTMLElement;
  eventCount: number;
  filteredCount: number;
  onFilterChange: (type: string) => void;
  onSearchChange: (term: string) => void;
};

/**
 * Context for the renderEventStreamPayload plugin hook.
 */
export type EventStreamPayloadRenderContext = {
  event: SSEEventRecord;
  config: AgentWidgetConfig;
  defaultRenderer: () => HTMLElement;
  parsedPayload: unknown;
};

export type AgentWidgetDockConfig = {
  /**
   * Side of the wrapped container where the docked panel should render.
   * @default "right"
   */
  side?: "left" | "right";
  /**
   * Expanded width of the docked panel.
   * @default "420px"
   */
  width?: string;
  /**
   * When false, the dock column snaps between `0` and `width` with no CSS transition so main
   * content does not reflow during the open/close animation.
   * @default true
   */
  animate?: boolean;
  /**
   * How the dock panel is shown.
   * - `"resize"` (default): a flex column grows/shrinks between `0` and `width` (main content reflows).
   * - `"overlay"`: panel is absolutely positioned and translates in/out **over** full-width content.
   * - `"push"`: a wide inner track `[content at shell width][panel]` translates horizontally so the panel
   *   appears to push the workspace aside **without** animating the content column width (Shopify-style).
   * - `"emerge"`: like `"resize"`, the flex column animates so **page content reflows**; the chat
   *   panel keeps a **fixed** `dock.width` (not squeezed while the column grows), clipped by the slot so
   *   it appears to emerge at full width like a floating widget.
   */
  reveal?: "resize" | "overlay" | "push" | "emerge";
  /**
   * Maximum height of the dock panel, applied as a viewport-overflow guard.
   *
   * The docked shell sizes itself with `height: 100%`, which only resolves when
   * an ancestor (usually `html, body { height: 100% }`) provides a definite
   * height. Without one, the dock column would otherwise grow with the
   * conversation and scroll off the page. This cap clamps the panel to the
   * viewport (and keeps the `resize`/`emerge` reveals pinned with
   * `position: sticky`; `push`/`overlay` get the cap only, since their
   * transform/absolute contexts defeat sticky) so a missing height chain
   * degrades gracefully instead of breaking the chat.
   *
   * - Set a CSS length (e.g. `"600px"`, `"80vh"`) to override the cap.
   * - Set `false` to disable the guard entirely (the panel then sizes purely
   *   from the surrounding layout: make sure your page provides a definite
   *   height all the way down to the dock target's parent).
   *
   * @default "100dvh"
   */
  maxHeight?: string | false;
};

/**
 * Layout configuration for `mountMode: "composer-bar"`. Controls how the
 * collapsed pill is positioned and sized, and how the panel expands when
 * the user opens it.
 */
export type AgentWidgetComposerBarConfig = {
  /**
   * Max-width of the collapsed pill composer at the bottom of the viewport.
   * @default "720px"
   */
  collapsedMaxWidth?: string;
  /**
   * Bottom offset (CSS length) from the viewport edge in the collapsed state.
   * @default "16px"
   */
  bottomOffset?: string;
  /**
   * Auto-expand the panel when the user submits a message while the composer
   * is collapsed. When false, the message still sends but the panel remains
   * collapsed (the host can drive expansion programmatically).
   * @default true
   */
  expandOnSubmit?: boolean;
  /**
   * Size of the expanded chat panel.
   * - `"anchored"` (default): the pill stays at the bottom of the viewport
   *   and the chat history grows upward into a centered column above it.
   *   Width is driven by `expandedMaxWidth`; the panel's top edge sits at
   *   `expandedTopOffset` from the viewport top.
   * - `"fullscreen"`: covers the entire viewport (mobile-app style). Inner
   *   content is centered horizontally via `contentMaxWidth`.
   * - `"modal"`: centered sheet with margins; size driven by
   *   `modalMaxWidth` / `modalMaxHeight`.
   * @default "anchored"
   */
  expandedSize?: "anchored" | "fullscreen" | "modal";
  /**
   * When `expandedSize === "anchored"`, max-width of the expanded panel
   * column. Capped at `calc(100vw - 32px)` on narrow viewports.
   * @default "880px"
   */
  expandedMaxWidth?: string;
  /**
   * When `expandedSize === "anchored"`, distance from the viewport top to
   * the panel's top edge. Accepts any CSS length.
   * @default "5vh"
   */
  expandedTopOffset?: string;
  /**
   * Max-width applied to messages, composer form, suggestions, and
   * attachment previews so they center horizontally inside the expanded
   * panel. Falls back to `layout.contentMaxWidth` when set; otherwise
   * defaults to this value.
   * @default "720px"
   */
  contentMaxWidth?: string;
  /**
   * When `expandedSize === "modal"`, max-width of the expanded sheet.
   * @default "880px"
   */
  modalMaxWidth?: string;
  /**
   * When `expandedSize === "modal"`, max-height of the expanded sheet.
   * @default "min(90vh, 800px)"
   */
  modalMaxHeight?: string;
  /**
   * Configuration for the "peek" banner: the chrome-less row above the
   * collapsed pill that previews the most recent assistant message.
   */
  peek?: AgentWidgetComposerBarPeekConfig;
};

/**
 * Configuration for the composer-bar peek banner. Reuses the same
 * `streamAnimation` shape developers already configure for the main message
 * stream, so the surface for animations is identical across both contexts.
 *
 * Resolution order:
 * - If `peek.streamAnimation` is set, those values apply to the peek.
 * - Otherwise the peek inherits from `features.streamAnimation`.
 *
 * Per-surface carve-outs:
 * - `bubbleClass` from a plugin (used by `pop-bubble`) is ignored: the peek
 *   has no bubble analog.
 * - `containerClass`, `wrap` ("char" | "word"), `useCaret`, `placeholder`
 *   ("skeleton"), `buffer` ("word" | "line"), `speed`, `duration`, and
 *   custom plugins all apply unchanged.
 */
export type AgentWidgetComposerBarPeekConfig = {
  /**
   * Reveal animation for the peek's trailing-message preview. Same shape as
   * `features.streamAnimation`. Omit to inherit from the main stream config.
   */
  streamAnimation?: AgentWidgetStreamAnimationFeature;
};

export type AgentWidgetLauncherConfig = {
  enabled?: boolean;
  title?: string;
  subtitle?: string;
  textHidden?: boolean;
  iconUrl?: string;
  agentIconText?: string;
  agentIconName?: string;
  agentIconHidden?: boolean;
  /**
   * Background color for the agent icon circle in the launcher button. Accepts
   * any CSS color value. When set, overrides the default primary-color
   * background (the `persona-bg-persona-primary` utility).
   */
  agentIconBackgroundColor?: string;
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /**
   * Controls how the launcher panel is mounted relative to the host page.
   * - "floating": default floating launcher / panel behavior
   * - "docked": wraps the target container and renders as a sibling dock
   * - "composer-bar": persistent rounded-pill composer fixed to the bottom of
   *   the viewport that morphs into a fullscreen (or modal) chat panel on
   *   submit and minimizes back to the pill on close.
   *
   * @default "floating"
   */
  mountMode?: "floating" | "docked" | "composer-bar";
  /**
   * Layout configuration for docked mode.
   */
  dock?: AgentWidgetDockConfig;
  /**
   * Layout configuration for composer-bar mode.
   * Only applies when `mountMode === "composer-bar"`.
   */
  composerBar?: AgentWidgetComposerBarConfig;
  autoExpand?: boolean;
  width?: string;
  /**
   * When true, the widget panel will fill the full height of its container.
   * Useful for sidebar layouts where the chat should take up the entire viewport height.
   * The widget will use flex layout to ensure header stays at top, messages scroll in middle,
   * and composer stays fixed at bottom.
   * 
   * @default false
   */
  fullHeight?: boolean;
  /**
   * When true, the widget panel will be positioned as a sidebar flush with the viewport edges.
   * The panel will have:
   * - No border-radius (square corners)
   * - No margins (flush with top, left/right, and bottom edges)
   * - Full viewport height
   * - Subtle shadow on the edge facing the content
   * - No border between footer and messages
   * 
   * Use with `position` to control which side ('bottom-left' for left sidebar, 'bottom-right' for right sidebar).
   * Automatically enables fullHeight when true.
   * 
   * @default false
   */
  sidebarMode?: boolean;
  /**
   * When true, the widget panel renders as a detached card inset within its region,
   * with rounded corners on all sides and elevation (shadow plus hairline border),
   * instead of sitting flush against the region edges.
   *
   * The gap around the card is themed via `theme.components.panel.inset`. The
   * background revealed behind it is themed via `theme.components.panel.canvasBackground`
   * in docked and inline embed modes. In sidebar mode the gap stays click-through, so the
   * host page shows through it the same way it does in floating mode, and canvasBackground
   * is a no-op there.
   *
   * Applies to sidebar, docked, and inline embed modes. Ignored in mobile fullscreen,
   * where chrome is already suppressed. Floating mode is unchanged, since it already
   * renders as a detached card.
   *
   * @default false
   */
  detachedPanel?: boolean;
  /**
   * Width of the sidebar panel when sidebarMode is true.
   * @default "420px"
   */
  sidebarWidth?: string;
  /**
   * Offset (in pixels) to subtract from the calculated panel height.
   * Useful for adjusting the panel height when there are other fixed elements on the page.
   * Only applies when not in fullHeight or sidebarMode.
   * 
   * @default 0
   */
  heightOffset?: number;
  /**
   * When true, the widget panel expands to fill the full viewport on mobile devices.
   * Removes border-radius, margins, and shadows for a native app-like experience.
   * Applies when viewport width is at or below `mobileBreakpoint`.
   *
   * @default true
   */
  mobileFullscreen?: boolean;
  /**
   * Viewport width (in pixels) at or below which the widget enters mobile fullscreen mode.
   * Only applies when `mobileFullscreen` is true.
   *
   * @default 640
   */
  mobileBreakpoint?: number;
  /**
   * CSS z-index applied to the widget wrapper and launcher button in all
   * positioned modes (floating panel, mobile fullscreen, sidebar, docked
   * mobile fullscreen). Increase this value if other elements on the host
   * page appear on top of the widget.
   *
   * In viewport-covering modes (sidebar, mobile fullscreen), the widget
   * also elevates the host element's stacking context and locks
   * document scroll to prevent background scrolling.
   *
   * @default 100000
   */
  zIndex?: number;
  callToActionIconText?: string;
  callToActionIconName?: string;
  callToActionIconColor?: string;
  callToActionIconBackgroundColor?: string;
  callToActionIconHidden?: boolean;
  callToActionIconPadding?: string;
  agentIconSize?: string;
  callToActionIconSize?: string;
  headerIconSize?: string;
  headerIconName?: string;
  headerIconHidden?: boolean;
  closeButtonSize?: string;
  closeButtonColor?: string;
  closeButtonBackgroundColor?: string;
  closeButtonBorderWidth?: string;
  closeButtonBorderColor?: string;
  closeButtonBorderRadius?: string;
  closeButtonPaddingX?: string;
  closeButtonPaddingY?: string;
  closeButtonPlacement?: "inline" | "top-right";
  closeButtonIconName?: string;
  closeButtonIconText?: string;
  closeButtonTooltipText?: string;
  closeButtonShowTooltip?: boolean;
  clearChat?: AgentWidgetClearChatConfig;
  /**
   * Border style for the launcher button.
   * @example "1px solid #e5e7eb" | "2px solid #3b82f6" | "none"
   * @default "1px solid #e5e7eb"
   */
  border?: string;
  /**
   * Box shadow for the launcher button.
   * @example "0 10px 15px -3px rgba(0,0,0,0.1)" | "none"
   * @default "0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)"
   */
  shadow?: string;
  /**
   * CSS `max-width` for the floating launcher button when the panel is closed.
   * Title and subtitle each truncate with an ellipsis when space is tight; full strings are available via the native `title` tooltip. Does not affect the open chat panel (`width` / `launcherWidth`).
   *
   * @example "min(380px, calc(100vw - 48px))"
   */
  collapsedMaxWidth?: string;
};

export type AgentWidgetSendButtonConfig = {
  borderWidth?: string;
  borderColor?: string;
  paddingX?: string;
  paddingY?: string;
  iconText?: string;
  iconName?: string;
  useIcon?: boolean;
  tooltipText?: string;
  showTooltip?: boolean;
  backgroundColor?: string;
  textColor?: string;
  size?: string;
  /** Lucide icon name shown while a response is streaming. Clicking the button in this state aborts the stream. Default: "square". */
  stopIconName?: string;
  /** Tooltip text shown while streaming. Default: "Stop generating". */
  stopTooltipText?: string;
};

/** Optional composer UI state for custom `renderComposer` implementations. */
export type AgentWidgetComposerConfig = {
  models?: Array<{ id: string; label: string }>;
  /** Current selection; host or plugin may update this at runtime. */
  selectedModelId?: string;
};

export type AgentWidgetClearChatConfig = {
  enabled?: boolean;
  placement?: "inline" | "top-right";
  iconName?: string;
  iconColor?: string;
  backgroundColor?: string;
  borderWidth?: string;
  borderColor?: string;
  borderRadius?: string;
  size?: string;
  paddingX?: string;
  paddingY?: string;
  tooltipText?: string;
  showTooltip?: boolean;
};

export type AgentWidgetStatusIndicatorConfig = {
  visible?: boolean;
  /** Text alignment. Default: 'right'. */
  align?: 'left' | 'center' | 'right';
  idleText?: string;
  /** URL to open in a new tab when the idle text is clicked. */
  idleLink?: string;
  connectingText?: string;
  connectedText?: string;
  errorText?: string;
  /** Status text while a dropped durable stream is awaiting reconnect. */
  pausedText?: string;
  /** Status text while a reconnect attempt is in flight. */
  resumingText?: string;
};

export type AgentWidgetVoiceRecognitionConfig = {
  enabled?: boolean;
  pauseDuration?: number;
  /** Text shown in the user message placeholder while voice is being processed. Default: "Processing voice..." */
  processingText?: string;
  /** Text shown in the assistant message if voice processing fails. Default: "Voice processing failed. Please try again." */
  processingErrorText?: string;
  iconName?: string;
  iconSize?: string;
  iconColor?: string;
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  paddingX?: string;
  paddingY?: string;
  tooltipText?: string;
  showTooltip?: boolean;
  recordingIconColor?: string;
  recordingBackgroundColor?: string;
  recordingBorderColor?: string;
  showRecordingIndicator?: boolean;

  // Processing state (after recording stops, waiting for agent response)
  /** Icon name shown while processing voice input. Default: "loader" */
  processingIconName?: string;
  /** Icon color during processing. Inherits idle iconColor if not set */
  processingIconColor?: string;
  /** Button background color during processing. Inherits idle backgroundColor if not set */
  processingBackgroundColor?: string;
  /** Button border color during processing. Inherits idle borderColor if not set */
  processingBorderColor?: string;

  // Speaking state (agent TTS audio is playing)
  /** Icon name shown while agent is speaking. Default: "volume-2" (or "square" in cancel mode) */
  speakingIconName?: string;
  /** Icon color while speaking. Inherits idle iconColor if not set */
  speakingIconColor?: string;
  /** Button background color while speaking. Inherits idle backgroundColor if not set */
  speakingBackgroundColor?: string;
  /** Button border color while speaking. Inherits idle borderColor if not set */
  speakingBorderColor?: string;
  autoResume?: boolean | "assistant";

  /**
   * Called with per-turn latency metrics on the realtime (`runtype`) voice path.
   * Fires once per turn after the reply completes.
   */
  onMetrics?: (metrics: VoiceMetrics) => void;

  // Voice provider configuration
  provider?: {
    type: 'browser' | 'runtype' | 'custom';
    browser?: {
      language?: string;
      continuous?: boolean;
    };
    runtype?: {
      agentId: string;
      /** Defaults to the widget's `clientToken` when omitted. */
      clientToken?: string;
      /** Defaults to the widget's `apiUrl` when omitted. */
      host?: string;
      voiceId?: string;
      /**
       * Optional custom streaming playback engine. Defaults to the built-in
       * `AudioPlaybackManager`. Import `createWorkletPlaybackEngine` from
       * `@runtypelabs/persona/voice-worklet-player` for a jitter-buffered engine.
       */
      createPlaybackEngine?: () => VoicePlaybackEngine | Promise<VoicePlaybackEngine>;
      /** @deprecated No-op on the realtime path: the server's STT owns turn-taking. */
      pauseDuration?: number;
      /** @deprecated No-op on the realtime path: the server's STT owns turn-taking. */
      silenceThreshold?: number;
    };
    /**
     * Bring-your-own voice provider. Set `type: 'custom'` and pass either a
     * ready {@link VoiceProvider} instance or a `() => VoiceProvider` factory
     * (the factory defers construction until voice is set up). STT-style
     * providers deliver a final transcript via `onResult` (sent as a user
     * message); full-duplex providers can drive `onTranscript`/`onMetrics` like
     * the realtime `runtype` provider.
     */
    custom?: VoiceProvider | (() => VoiceProvider);
  };
};

/**
 * Text-to-speech configuration for reading assistant messages aloud.
 * Currently supports the Web Speech API (`speechSynthesis`).
 *
 * @example
 * ```typescript
 * textToSpeech: {
 *   enabled: true,
 *   provider: 'browser',
 *   voice: 'Google US English',
 *   rate: 1.2,
 *   pitch: 1.0
 * }
 * ```
 */
export type TextToSpeechConfig = {
  /** Enable text-to-speech for assistant messages */
  enabled: boolean;
  /**
   * TTS provider.
   * - `'browser'`: Use the Web Speech API for all assistant messages (default).
   * - `'runtype'`: Use Runtype-hosted TTS. The realtime voice path speaks
   *   replies during a voice call, and the per-message "Read aloud" button (and
   *   auto-speak of text-typed replies) stream from Runtype's
   *   `POST {host}/v1/agents/:agentId/speak` endpoint via the built-in
   *   {@link SpeechEngine}. `host`/`agentId`/`clientToken` are derived from the
   *   widget config (see `agentId`/`host` below); unless `browserFallback` is
   *   `false`, a missing endpoint or transient failure falls back to the browser
   *   voice so the button is never broken.
   */
  provider?: 'browser' | 'runtype';
  /**
   * When `provider` is `'runtype'`:
   * - Read-aloud / auto-speak: acts as a safety net — if Runtype TTS is
   *   unreachable (no endpoint yet, network/auth failure) or the Runtype config
   *   is incomplete, speech falls back to the browser Web Speech API instead of
   *   erroring. Set to `false` to surface Runtype errors instead. **Defaults to
   *   on for this path.**
   * - Auto-speak of text-typed replies also requires this to be truthy (the
   *   realtime voice path already speaks voice-call replies).
   *
   * Has no effect when provider is `'browser'` (browser TTS is always used).
   */
  browserFallback?: boolean;
  /**
   * When `provider` is `'runtype'`, the agent whose configured voice synthesizes
   * read-aloud / auto-speak audio. Falls back to
   * `voiceRecognition.provider.runtype.agentId` when omitted. Required (here or
   * there) for Runtype TTS to activate; without it the browser voice is used.
   */
  agentId?: string;
  /**
   * When `provider` is `'runtype'`, the Runtype API host (e.g.
   * `https://api.runtype.com`). Defaults to the widget's `apiUrl`.
   */
  host?: string;
  /**
   * When `provider` is `'runtype'`, audio (ms) the streaming player buffers
   * before the first sample and after an underrun. Lower = snappier start;
   * higher = rides out delivery hiccups. Default 200. Applies to the default
   * in-bundle player; a custom `createPlaybackEngine` manages its own prebuffer.
   */
  prebufferMs?: number;
  /**
   * When `provider` is `'runtype'`, an optional factory for the streaming PCM
   * player that synthesizes read-aloud / auto-speak audio. Defaults to the
   * in-bundle, main-thread `AudioPlaybackManager` (smooth for steady Runtype
   * streams, no AudioWorklet — keeps the widget bundle lean).
   *
   * For the higher-quality, jitter-buffered AudioWorklet player, import
   * `createPcmStreamPlayer` from `@runtypelabs/persona/voice-worklet-player` and
   * pass it here — it then ships in your bundle, not Persona's:
   *
   * @example
   * import { createPcmStreamPlayer } from '@runtypelabs/persona/voice-worklet-player'
   * textToSpeech: {
   *   enabled: true,
   *   provider: 'runtype',
   *   createPlaybackEngine: () => createPcmStreamPlayer({ prebufferMs: 400 }),
   * }
   */
  createPlaybackEngine?: () => PcmStreamPlayer | Promise<PcmStreamPlayer>;
  /** Voice name to use for browser TTS (e.g., 'Google US English'). If not found, uses auto-detect. */
  voice?: string;
  /**
   * Custom voice picker called when `voice` is not set.
   * Receives the full list of available `SpeechSynthesisVoice` objects and
   * should return the one to use. If not provided, the SDK auto-detects the
   * best English voice.
   *
   * @example
   * ```typescript
   * pickVoice: (voices) => voices.find(v => v.lang === 'fr-FR') ?? voices[0]
   * ```
   */
  pickVoice?: (voices: SpeechSynthesisVoice[]) => SpeechSynthesisVoice;
  /** Speech rate (0.1 - 10). Default: 1 */
  rate?: number;
  /** Speech pitch (0 - 2). Default: 1 */
  pitch?: number;
  /**
   * Factory for a custom {@link SpeechEngine}, used by both the auto-speak path
   * and the per-message "Read aloud" action. When omitted, the browser Web
   * Speech API engine is used. Return a hosted engine here to use server-side
   * TTS (e.g. Runtype) — such an engine can stream audio through the realtime
   * voice {@link VoicePlaybackEngine}. May be async (it is resolved on first
   * playback, inside the user gesture).
   */
  createEngine?: () => SpeechEngine | Promise<SpeechEngine>;
};

/**
 * Playback state of the per-message "Read aloud" action.
 * - `idle`: not reading this message.
 * - `loading`: the engine is preparing audio (e.g. a hosted TTS fetch). Browser
 *   engines pass through this state almost instantly.
 * - `playing`: audio is playing.
 * - `paused`: playback is paused and resumable.
 */
export type ReadAloudState = "idle" | "loading" | "playing" | "paused";

/** A unit of speech handed to a {@link SpeechEngine}. */
export interface SpeechRequest {
  /** Plain text to speak. The widget strips Markdown before calling the engine. */
  text: string;
  /** Preferred voice identifier (engine-specific; browser = voice name). */
  voice?: string;
  /** Speech rate (engine-specific range; browser: 0.1–10, default 1). */
  rate?: number;
  /** Speech pitch (engine-specific range; browser: 0–2, default 1). */
  pitch?: number;
}

/** Lifecycle callbacks a {@link SpeechEngine} invokes during playback. */
export interface SpeechCallbacks {
  /** Audio has started playing. */
  onStart?: () => void;
  /** Playback finished naturally (or was canceled). */
  onEnd?: () => void;
  /** Playback failed. */
  onError?: (error: Error) => void;
}

/**
 * Pluggable text-to-speech engine behind the "Read aloud" message action.
 *
 * The widget ships a browser Web Speech API engine by default. Provide a hosted
 * engine (Runtype TTS, ElevenLabs, a server proxy, …) by implementing this
 * interface and returning it from {@link TextToSpeechConfig.createEngine}; a
 * server engine can stream audio into the realtime voice
 * {@link VoicePlaybackEngine}.
 */
export interface SpeechEngine {
  /** Stable identifier, e.g. `"browser"`, `"runtype"`, or a custom id. */
  readonly id: string;
  /**
   * Whether {@link pause}/{@link resume} are supported. When `false`, the UI
   * offers play/stop only (tapping a playing message stops it).
   */
  readonly supportsPause: boolean;
  /** Begin speaking. Drives the lifecycle through `callbacks`. */
  speak(request: SpeechRequest, callbacks: SpeechCallbacks): void;
  /** Pause playback (no-op if unsupported). */
  pause(): void;
  /** Resume paused playback (no-op if unsupported). */
  resume(): void;
  /** Stop playback and discard any queued audio. */
  stop(): void;
  /** Optional teardown of engine resources. */
  destroy?(): void;
}

// ============================================================================
// Voice Provider Types
// ============================================================================

/**
 * Voice recognition result with transcript and optional audio
 */
export type VoiceResult = {
  text: string;
  transcript?: string;
  audio?: {
    base64: string;
    format: 'wav' | 'mp3' | 'ogg' | 'webm';
    sampleRate: number;
    duration: number;
  };
  confidence?: number;
  provider: 'runtype' | 'browser' | 'custom';
};

/**
 * Voice provider status states
 */
export type VoiceStatus =
  | 'disconnected'
  | 'connected'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error'
  | 'idle';

/**
 * Per-turn latency metrics emitted by the realtime voice path.
 * The wire frame is snake_case (`metrics`); decoded to camelCase at the
 * provider boundary before being surfaced through `onMetrics`.
 */
export type VoiceMetrics = {
  /** LLM generation time (ms). */
  llmMs?: number;
  /** Text-to-speech synthesis time (ms). */
  ttsMs?: number;
  /** Time to first audio frame (ms). */
  firstAudioMs?: number;
  /** Total turn time (ms). */
  totalMs?: number;
};

/**
 * Streaming PCM playback engine used by the realtime voice provider.
 *
 * The provider feeds raw PCM16 LE mono @ 24kHz (WAV header already stripped)
 * via `enqueue`, signals end-of-reply with `markStreamEnd`, and learns when
 * playback has fully drained via `onFinished`. The default implementation is
 * `AudioPlaybackManager`; an optional jitter-buffered AudioWorklet engine ships
 * from `@runtypelabs/persona/voice-worklet-player` and can be injected via the
 * `runtype.createPlaybackEngine` config hook.
 */
export interface VoicePlaybackEngine {
  /** Enqueue a raw PCM16 LE mono @ 24kHz chunk (no WAV header). */
  enqueue(pcm: Uint8Array): void;
  /** Signal that no more chunks will arrive for the current reply. */
  markStreamEnd(): void;
  /** Immediately stop playback and discard queued audio. */
  flush(): void;
  /** Register a callback fired once all queued audio has finished playing. */
  onFinished(callback: () => void): void;
  /** Release all audio resources. */
  destroy(): Promise<void> | void;
}

/**
 * A {@link VoicePlaybackEngine} that also supports pause/resume. Returned by
 * `createPcmStreamPlayer` (`@runtypelabs/persona/voice-worklet-player`): a
 * jitter-buffered AudioWorklet player for raw PCM16 / 24 kHz / mono streams.
 * Reuse it inside a hosted {@link SpeechEngine} to get gapless playback with a
 * configurable prebuffer and graceful underrun handling — feed each streamed
 * chunk to {@link VoicePlaybackEngine.enqueue} and the worklet does the rest.
 */
export interface PcmStreamPlayer extends VoicePlaybackEngine {
  /** Pause playback; the audio clock suspends and {@link resume} continues in place. */
  pause(): void;
  /** Resume playback after {@link pause}. */
  resume(): void;
  /**
   * Register a callback fired once audible playback actually begins — i.e. the
   * prebuffer waterline filled and the first sample reached the output. Use this
   * (rather than "first chunk enqueued") to flip a UI from loading to playing, so
   * the spinner holds through the prebuffer. Fires once per playback session
   * (cleared by {@link VoicePlaybackEngine.flush}); a mid-reply underrun re-buffer
   * does not re-fire it.
   */
  onStarted(callback: () => void): void;
}

/**
 * Voice provider configuration
 * Determines which voice provider to use and its specific settings
 */
export type VoiceConfig = {
  type: 'browser' | 'runtype' | 'custom';
  browser?: {
    language?: string;
    continuous?: boolean;
  };
  runtype?: {
    agentId: string;
    /** Defaults to the widget's `clientToken` when omitted. */
    clientToken?: string;
    /** Defaults to the widget's `apiUrl` (as a ws(s):// base) when omitted. */
    host?: string;
    voiceId?: string;
    /**
     * Optional custom streaming playback engine. Defaults to the built-in
     * `AudioPlaybackManager`. Import `createWorkletPlaybackEngine` from
     * `@runtypelabs/persona/voice-worklet-player` for a jitter-buffered engine.
     */
    createPlaybackEngine?: () => VoicePlaybackEngine | Promise<VoicePlaybackEngine>;
    /** @deprecated No-op on the realtime path: the server's STT owns turn-taking. */
    pauseDuration?: number;
    /** @deprecated No-op on the realtime path: the server's STT owns turn-taking. */
    silenceThreshold?: number;
  };
  /**
   * Bring-your-own voice provider for `type: 'custom'`: either a ready
   * {@link VoiceProvider} instance or a `() => VoiceProvider` factory. The
   * factory form defers construction (WebSocket/AudioContext/etc.) until
   * `createVoiceProvider` runs.
   */
  custom?: VoiceProvider | (() => VoiceProvider);
};

/**
 * Voice provider interface
 * Abstract interface for all voice providers in the Persona SDK
 */
export interface VoiceProvider {
  type: 'browser' | 'runtype' | 'custom';

  connect(): Promise<void>;
  disconnect(): Promise<void>;
  startListening(): Promise<void>;
  stopListening(): Promise<void>;

  onResult(callback: (result: VoiceResult) => void): void;
  onError(callback: (error: Error) => void): void;
  onStatusChange(callback: (status: VoiceStatus) => void): void;

  /** Register a callback fired when recording stops and audio is about to be sent */
  onProcessingStart?(callback: () => void): void;

  /**
   * Register a callback for incremental transcript updates during a voice turn.
   * `isFinal=false` is a live interim update (user partials, or assistant deltas
   * on providers that stream them); `isFinal=true` finalizes that role's text.
   * On the realtime `runtype` path, interim updates fire for the `user` only and
   * the `assistant` arrives as a single final.
   */
  onTranscript?(
    callback: (role: 'user' | 'assistant', text: string, isFinal: boolean) => void,
  ): void;

  /** Register a callback for per-turn latency metrics (realtime path). */
  onMetrics?(callback: (metrics: VoiceMetrics) => void): void;

  /** Returns the current interruption mode (only meaningful for Runtype provider) */
  getInterruptionMode?(): "none" | "cancel" | "barge-in";

  /** Returns true if the barge-in mic stream is alive (hot mic between turns) */
  isBargeInActive?(): boolean;

  /** Tear down the barge-in mic pipeline: "hang up" the always-on mic */
  deactivateBargeIn?(): Promise<void>;

  /** Stop playback / cancel in-flight request without starting recording */
  stopPlayback?(): void;
}

/**
 * Extra context for an approval decision, surfaced to `onDecision` and to the
 * `approve`/`deny` callbacks passed to the `renderApproval` plugin hook.
 */
export type AgentWidgetApprovalDecisionOptions = {
  /**
   * The user chose a "remember this" affordance (e.g. an "Always allow"
   * button) rather than a one-time decision. The widget resolves the *current*
   * approval identically whether or not this is set: an approval bubble is a
   * single binary gate (`approved`/`denied`). Persisting a don't-ask-again
   * policy for *future* approvals (auto-resolving them, or not surfacing them)
   * is the integrator's responsibility, typically inside `onDecision`.
   * Defaults to absent/`false`.
   */
  remember?: boolean;
};

/**
 * Configuration for tool approval bubbles.
 * Controls styling, labels, and behavior of the approval UI.
 */
export type AgentWidgetApprovalConfig = {
  /** Background color of the approval bubble */
  backgroundColor?: string;
  /** Border color of the approval bubble */
  borderColor?: string;
  /** Box-shadow for the approval bubble; pass `"none"` to remove it. Overrides the default `persona-shadow-sm`. */
  shadow?: string;
  /** Color for the title text */
  titleColor?: string;
  /** Color for the description text */
  descriptionColor?: string;
  /** Background color for the approve button */
  approveButtonColor?: string;
  /** Text color for the approve button */
  approveButtonTextColor?: string;
  /** Background color for the deny button */
  denyButtonColor?: string;
  /** Text color for the deny button */
  denyButtonTextColor?: string;
  /** Background color for the parameters block */
  parameterBackgroundColor?: string;
  /** Text color for the parameters block */
  parameterTextColor?: string;
  /** Title text displayed above the description */
  title?: string;
  /** Label for the approve button */
  approveLabel?: string;
  /** Label for the deny button */
  denyLabel?: string;
  /**
   * Color for the agent-authored reason line (the agent's per-call
   * justification, shown attributed below the summary when present).
   */
  reasonColor?: string;
  /**
   * Label prefix for the agent-authored reason line.
   * Defaults to "Agent's stated reason:".
   */
  reasonLabel?: string;
  /**
   * How the technical details (the tool's agent-facing description and the
   * raw parameters JSON) are presented:
   * - `"collapsed"` (default): hidden behind a "Show details" toggle
   * - `"expanded"`: visible, with the toggle available to hide them
   * - `"hidden"`: never rendered
   */
  detailsDisplay?: "collapsed" | "expanded" | "hidden";
  /** Label for the toggle that reveals the technical details */
  showDetailsLabel?: string;
  /** Label for the toggle that hides the technical details */
  hideDetailsLabel?: string;
  /**
   * Offer an "Always allow" affordance in the default approval bubble.
   *
   * Default `false`. When `false`, the bubble shows a single "Allow" (allow
   * once) plus "Deny". When `true`, the primary action becomes a split control:
   * "Always allow" (resolves with `{ remember: true }`) with a dropdown for
   * "Allow once", plus "Deny", and keyboard shortcuts (Enter = Always allow,
   * Cmd/Ctrl+Enter = Allow once, Esc = Deny).
   *
   * Keep this off unless your backend actually persists the don't-ask-again
   * policy: "Always allow" only resolves the *current* approval — honoring it
   * for *future* calls is up to your `onDecision` handler (which receives
   * `options.remember`). Showing it without that wiring would mislead users.
   */
  enableAlwaysAllow?: boolean;
  /**
   * Build the user-facing summary line for an approval request. Overrides the
   * default "The assistant wants to use “Tool name”." copy. Return a falsy
   * value to fall back to the default for that approval. `displayTitle` is
   * the display name the tool declared via the WebMCP spec's
   * `ToolDescriptor.title`, when one exists.
   */
  formatDescription?: (approval: {
    toolName: string;
    toolType?: string;
    description: string;
    parameters?: unknown;
    displayTitle?: string;
    /**
     * Agent-authored justification for this specific call, when the agent
     * provided one. It is the agent's own claim: if you fold it into the
     * summary, keep it attributed to the agent.
     */
    reason?: string;
  }) => string | undefined;
  /**
   * Custom handler for approval decisions.
   * Return void to let the SDK auto-resolve via the API,
   * or return a Response/ReadableStream for custom handling.
   *
   * `options.remember` is `true` when the decision came from a "remember this"
   * affordance (e.g. an "Always allow" button in a custom `renderApproval`
   * plugin). Use it to persist a don't-ask-again policy for future approvals;
   * the current approval resolves the same way regardless.
   */
  onDecision?: (
    data: { approvalId: string; executionId: string; agentId: string; toolName: string },
    decision: 'approved' | 'denied',
    options?: AgentWidgetApprovalDecisionOptions
  ) => Promise<Response | ReadableStream<Uint8Array> | void>;
};

export type AgentWidgetToolCallConfig = {
  /** Box-shadow for tool-call bubbles; pass `"none"` to remove it. Overrides the `components.toolBubble.shadow` token / `--persona-tool-bubble-shadow`. */
  shadow?: string;
  /** Background color of the tool call bubble container. */
  backgroundColor?: string;
  /** Border color of the tool call bubble container. */
  borderColor?: string;
  /** Border width of the tool call bubble container (CSS value, e.g. `"1px"`). */
  borderWidth?: string;
  /** Border radius of the tool call bubble container (CSS value, e.g. `"12px"`). */
  borderRadius?: string;
  /** Background color of the collapsed header row. */
  headerBackgroundColor?: string;
  /** Text color of the collapsed header row (tool name / summary). */
  headerTextColor?: string;
  /** Horizontal padding of the collapsed header row (CSS value). */
  headerPaddingX?: string;
  /** Vertical padding of the collapsed header row (CSS value). */
  headerPaddingY?: string;
  /** Background color of the expanded content area. */
  contentBackgroundColor?: string;
  /** Text color of the expanded content area. */
  contentTextColor?: string;
  /** Horizontal padding of the expanded content area (CSS value). */
  contentPaddingX?: string;
  /** Vertical padding of the expanded content area (CSS value). */
  contentPaddingY?: string;
  /** Background color of code blocks (arguments / result) in the expanded area. */
  codeBlockBackgroundColor?: string;
  /** Border color of code blocks in the expanded area. */
  codeBlockBorderColor?: string;
  /** Text color of code blocks in the expanded area. */
  codeBlockTextColor?: string;
  /** Color of the expand/collapse toggle icon. */
  toggleTextColor?: string;
  /** Color of section labels ("Arguments", "Result", "Activity") in the expanded area. */
  labelTextColor?: string;
  /**
   * Override the collapsed summary row content for a tool call bubble.
   * Return `null` to fall back to the built-in summary for the active display mode.
   */
  renderCollapsedSummary?: (context: {
    message: AgentWidgetMessage;
    toolCall: AgentWidgetToolCall;
    defaultSummary: string;
    previewText: string;
    collapsedMode: AgentWidgetToolCallCollapsedMode;
    isActive: boolean;
    config: AgentWidgetConfig;
    /** Static elapsed time snapshot, e.g. "2.6s". */
    elapsed: string;
    /**
     * Returns a `<span>` whose text content is automatically updated every
     * 100ms by the widget's global timer. Place it anywhere in your returned
     * HTMLElement to get a live-ticking duration display.
     */
    createElapsedElement: () => HTMLElement;
  }) => HTMLElement | string | null;
  /**
   * Override the lightweight collapsed preview content shown for active tool rows.
   * Return `null` to fall back to the built-in preview text.
   */
  renderCollapsedPreview?: (context: {
    message: AgentWidgetMessage;
    toolCall: AgentWidgetToolCall;
    defaultPreview: string;
    isActive: boolean;
    config: AgentWidgetConfig;
  }) => HTMLElement | string | null;
  /**
   * Override the summary content for grouped consecutive tool-call containers.
   * Return `null` to fall back to the built-in `Called [x] tools` summary.
   */
  renderGroupedSummary?: (context: {
    messages: AgentWidgetMessage[];
    toolCalls: AgentWidgetToolCall[];
    defaultSummary: string;
    config: AgentWidgetConfig;
  }) => HTMLElement | string | null;
  /**
   * Template string for the header text while a tool call is active (running).
   *
   * **Placeholders:** `{toolName}` (tool name), `{duration}` (live-updating elapsed time).
   *
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**`: parsed at render time and
   * applied as styled `<span>` elements. Works with all animation modes.
   *
   * When not set, falls back to the current `collapsedMode` behavior.
   * @example "Calling {toolName}... ~{duration}~"
   * @example "**Searching** *{toolName}*..."
   */
  activeTextTemplate?: string;
  /**
   * Template string for the header text when a tool call is complete.
   *
   * **Placeholders:** `{toolName}` (tool name), `{duration}` (final elapsed time).
   *
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**`: same syntax as `activeTextTemplate`.
   *
   * When not set, falls back to the existing "Used tool for X seconds" text.
   * @example "Finished {toolName} ~{duration}~"
   */
  completeTextTemplate?: string;
  /**
   * Primary color for shimmer-color animation mode.
   * Defaults to the current text color.
   */
  loadingAnimationColor?: string;
  /**
   * Secondary/end color for shimmer-color animation mode.
   * Creates a gradient sweep between `loadingAnimationColor` and this color.
   * @default "#3b82f6"
   */
  loadingAnimationSecondaryColor?: string;
  /**
   * Duration of one full animation cycle in milliseconds.
   * Applies to pulse, shimmer, shimmer-color, and rainbow modes.
   * @default 2000
   */
  loadingAnimationDuration?: number;
};

export type AgentWidgetReasoningConfig = {
  /**
   * Override the collapsed summary row content for a reasoning bubble.
   * Return `null` to fall back to the built-in summary.
   */
  renderCollapsedSummary?: (context: {
    message: AgentWidgetMessage;
    reasoning: AgentWidgetReasoning;
    defaultSummary: string;
    previewText: string;
    isActive: boolean;
    config: AgentWidgetConfig;
    /** Static elapsed time snapshot, e.g. "2.6s". */
    elapsed: string;
    /**
     * Returns a `<span>` whose text content is automatically updated every
     * 100ms by the widget's global timer. Place it anywhere in your returned
     * HTMLElement to get a live-ticking duration display.
     */
    createElapsedElement: () => HTMLElement;
  }) => HTMLElement | string | null;
  /**
   * Override the lightweight collapsed preview content shown for active reasoning rows.
   * Return `null` to fall back to the built-in preview text.
   */
  renderCollapsedPreview?: (context: {
    message: AgentWidgetMessage;
    reasoning: AgentWidgetReasoning;
    defaultPreview: string;
    isActive: boolean;
    config: AgentWidgetConfig;
  }) => HTMLElement | string | null;
  /**
   * Template string for the header text while reasoning is active (streaming).
   *
   * **Placeholders:** `{duration}` (live-updating elapsed time).
   *
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**`: parsed at render time.
   *
   * When not set, falls back to the default "Thinking..." text.
   * @example "Thinking... ~{duration}~"
   */
  activeTextTemplate?: string;
  /**
   * Template string for the header text when reasoning is complete.
   *
   * **Placeholders:** `{duration}` (final elapsed time).
   *
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**`: same syntax as `activeTextTemplate`.
   *
   * When not set, falls back to the default "Thought for X seconds" text.
   * @example "Thought for ~{duration}~"
   */
  completeTextTemplate?: string;
  /**
   * Primary color for shimmer-color animation mode.
   * Defaults to the current text color.
   */
  loadingAnimationColor?: string;
  /**
   * Secondary/end color for shimmer-color animation mode.
   * Creates a gradient sweep between `loadingAnimationColor` and this color.
   * @default "#3b82f6"
   */
  loadingAnimationSecondaryColor?: string;
  /**
   * Duration of one full animation cycle in milliseconds.
   * Applies to pulse, shimmer, shimmer-color, and rainbow modes.
   * @default 2000
   */
  loadingAnimationDuration?: number;
};

export type AgentWidgetSuggestionChipsConfig = {
  fontFamily?: "sans-serif" | "serif" | "mono";
  fontWeight?: string;
  paddingX?: string;
  paddingY?: string;
};

/**
 * Interface for pluggable stream parsers that extract text from streaming responses.
 * Parsers handle incremental parsing to extract text values from structured formats (JSON, XML, etc.).
 * 
 * @example
 * ```typescript
 * const jsonParser: AgentWidgetStreamParser = {
 *   processChunk: async (content) => {
 *     // Extract text from JSON - return null if not JSON or text not available yet
 *     if (!content.trim().startsWith('{')) return null;
 *     const match = content.match(/"text"\s*:\s*"([^"]*)"/);
 *     return match ? match[1] : null;
 *   },
 *   getExtractedText: () => extractedText
 * };
 * ```
 */
export interface AgentWidgetStreamParserResult {
  /**
   * The extracted text to display (may be partial during streaming)
   */
  text: string | null;
  
  /**
   * The raw accumulated content. Built-in parsers always populate this so
   * downstream middleware (action handlers, logging, etc.) can
   * inspect/parse the original structured payload.
   */
  raw?: string;
}

export interface AgentWidgetStreamParser {
  /**
   * Process a chunk of content and return the extracted text (if available).
   * This method is called for each chunk as it arrives during streaming.
   * Return null if the content doesn't match this parser's format or if text is not yet available.
   * 
   * @param accumulatedContent - The full accumulated content so far (including new chunk)
   * @returns The extracted text value and optionally raw content, or null if not yet available or format doesn't match
   */
  processChunk(accumulatedContent: string): Promise<AgentWidgetStreamParserResult | string | null> | AgentWidgetStreamParserResult | string | null;
  
  /**
   * Get the currently extracted text value (may be partial).
   * This is called synchronously to get the latest extracted text without processing.
   * 
   * @returns The currently extracted text value, or null if not yet available
   */
  getExtractedText(): string | null;
  
  /**
   * Clean up any resources when parsing is complete.
   */
  close?(): Promise<void> | void;
}


/**
 * Component renderer function signature for custom components
 */
export type AgentWidgetComponentRenderer = (
  props: Record<string, unknown>,
  context: {
    message: AgentWidgetMessage;
    config: AgentWidgetConfig;
    updateProps: (newProps: Record<string, unknown>) => void;
  }
) => HTMLElement;

/**
 * Result from custom SSE event parser
 */
export type AgentWidgetSSEEventResult = {
  /** Text content to display */
  text?: string;
  /** Whether the stream is complete */
  done?: boolean;
  /** Error message if an error occurred */
  error?: string;
  /** Text segment identity: when this changes, a new assistant message bubble is created */
  partId?: string;
} | null;

/**
 * Custom SSE event parser function
 * Allows transforming non-standard SSE event formats to persona's expected format
 */
export type AgentWidgetSSEEventParser = (
  eventData: unknown
) => AgentWidgetSSEEventResult | Promise<AgentWidgetSSEEventResult>;

/**
 * Custom fetch function for full control over API requests
 * Use this for custom authentication, request transformation, etc.
 */
export type AgentWidgetCustomFetch = (
  url: string,
  init: RequestInit,
  payload: AgentWidgetRequestPayload
) => Promise<Response>;

/**
 * Dynamic headers function - called before each request
 */
export type AgentWidgetHeadersFunction = () => Record<string, string> | Promise<Record<string, string>>;

// ============================================================================
// Client Token Types
// ============================================================================

/**
 * Session information returned after client token initialization.
 * Contains session ID, expiry time, flow info, and config from the server.
 */
export type ClientSession = {
  /** Unique session identifier */
  sessionId: string;
  /** When the session expires */
  expiresAt: Date;
  /** Flow information */
  flow: {
    id: string;
    name: string;
    description: string | null;
  };
  /** Configuration from the server */
  config: {
    welcomeMessage: string | null;
    placeholder: string;
    theme: Record<string, unknown> | null;
  };
};

/**
 * Raw API response from /v1/client/init endpoint
 */
export type ClientInitResponse = {
  sessionId: string;
  expiresAt: string;
  flow: {
    id: string;
    name: string;
    description: string | null;
  };
  config: {
    welcomeMessage: string | null;
    placeholder: string;
    theme: Record<string, unknown> | null;
  };
};

/**
 * Request payload for /v1/client/chat endpoint
 */
export type ClientChatRequest = {
  sessionId: string;
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: MessageContent;
  }>;
  /** ID for the expected assistant response message */
  assistantMessageId?: string;
  metadata?: Record<string, unknown>;
  /** Per-turn inputs for Runtype prompt templates (e.g. {{page_url}}). */
  inputs?: Record<string, unknown>;
  context?: Record<string, unknown>;
  /** WebMCP page-discovered tools: same shape as `dispatch.clientTools[]`. */
  clientTools?: ClientToolDefinition[];
  /**
   * Diff-only / send-once: order-independent fingerprint of the client tool set.
   * When the set is unchanged from the previous turn the widget sends this
   * WITHOUT `clientTools` and the server reuses its stored set. On a cache miss
   * the server replies `409 { error: 'client_tools_resend_required' }` and the
   * widget retries once with the full `clientTools[]`.
   */
  clientToolsFingerprint?: string;
  /** Stable client-owned turn ID for stale stream suppression (from Core public OpenAPI). */
  turnId?: RuntypeClientChatRequest['turnId'];
  /** Whether this turn should interrupt a prior in-flight response (from Core public OpenAPI). */
  submitMode?: RuntypeClientChatRequest['submitMode'];
};

/**
 * Body the server returns (HTTP 409) when it holds no stored tool set matching
 * a fingerprint-only `/client/chat` turn. The widget retries once with the full
 * `clientTools[]` (and the fingerprint).
 */
export type ClientToolsResendRequiredResponse = {
  error: 'client_tools_resend_required';
};

/**
 * Feedback types supported by the API
 */
export type ClientFeedbackType = RuntypeClientFeedbackRequest['type'];

/**
 * Request payload for /v1/client/feedback endpoint
 */
export type ClientFeedbackRequest = {
  sessionId: string;
  /** Required for upvote, downvote, copy feedback types */
  messageId?: string;
  type: ClientFeedbackType;
  /** Required for csat (1-5) and nps (0-10) feedback types */
  rating?: number;
  /** Optional comment for any feedback type */
  comment?: string;
};

// ============================================================================
// Layout Configuration Types
// ============================================================================

/** Icon button in the header title row (minimal layout). */
export type AgentWidgetHeaderTrailingAction = {
  id: string;
  /** Lucide icon name, e.g. `chevron-down` */
  icon?: string;
  label?: string;
  ariaLabel?: string;
  /**
   * When set, clicking this action opens a dropdown menu.
   * Menu item selections fire `onAction(menuItemId)`.
   */
  menuItems?: Array<{
    id: string;
    label: string;
    icon?: string;
    destructive?: boolean;
    dividerBefore?: boolean;
  }>;
};

/**
 * Context provided to header render functions
 */
export type HeaderRenderContext = {
  config: AgentWidgetConfig;
  onClose?: () => void;
  onClearChat?: () => void;
  /** Built from `layout.header.trailingActions` for custom `render` implementations. */
  trailingActions?: AgentWidgetHeaderTrailingAction[];
  /** Fired when a built-in trailing action is activated (same as `layout.header.onAction`). */
  onAction?: (actionId: string) => void;
};

/**
 * Context provided to message render functions
 */
export type MessageRenderContext = {
  message: AgentWidgetMessage;
  config: AgentWidgetConfig;
  streaming: boolean;
};

/**
 * Context provided to slot render functions
 */
export type SlotRenderContext = {
  config: AgentWidgetConfig;
  defaultContent: () => HTMLElement | null;
};

/**
 * Header layout configuration
 * Allows customization of the header section appearance and behavior
 */
export type AgentWidgetHeaderLayoutConfig = {
  /**
   * Layout preset: "default" | "minimal"
   * - default: Standard layout with icon, title, subtitle, and buttons
   * - minimal: Simplified layout with just title and close button
   */
  layout?: "default" | "minimal";
  /** Show/hide the header icon */
  showIcon?: boolean;
  /** Show/hide the title */
  showTitle?: boolean;
  /** Show/hide the subtitle */
  showSubtitle?: boolean;
  /** Show/hide the close button */
  showCloseButton?: boolean;
  /** Show/hide the clear chat button */
  showClearChat?: boolean;
  /**
   * Custom renderer for complete header override
   * When provided, replaces the entire header with custom content
   */
  render?: (context: HeaderRenderContext) => HTMLElement;
  /**
   * Shown after the title in `minimal` header layout (e.g. chevron menu affordance).
   */
  trailingActions?: AgentWidgetHeaderTrailingAction[];
  /** Called when a `trailingActions` button is clicked. */
  onAction?: (actionId: string) => void;
  /**
   * Called when the header title row is clicked.
   * Useful for dropdown menus or navigation triggered from the header.
   * When set, the title row becomes visually interactive (cursor: pointer).
   */
  onTitleClick?: () => void;
  /** Style config for the title row hover effect (minimal layout). */
  titleRowHover?: {
    /** Hover background color. */
    background?: string;
    /** Hover border color. */
    border?: string;
    /** Border radius for the pill shape. */
    borderRadius?: string;
    /** Padding inside the pill. */
    padding?: string;
  };
  /**
   * Replaces the title with a combo button (label + chevron + dropdown menu).
   * When set, `trailingActions`, `onTitleClick`, and `titleRowHover` are ignored
   * since the combo button handles all of these internally.
   */
  titleMenu?: {
    /** Dropdown menu items. */
    menuItems: Array<{
      id: string;
      label: string;
      icon?: string;
      destructive?: boolean;
      dividerBefore?: boolean;
    }>;
    /** Called when a menu item is selected. */
    onSelect: (id: string) => void;
    /** Hover pill style. */
    hover?: {
      background?: string;
      border?: string;
      borderRadius?: string;
      padding?: string;
    };
  };
};

/**
 * Avatar configuration for message bubbles
 */
export type AgentWidgetAvatarConfig = {
  /** Whether to show avatars */
  show?: boolean;
  /** Position of avatar relative to message bubble */
  position?: "left" | "right";
  /** URL or emoji for user avatar */
  userAvatar?: string;
  /** URL or emoji for assistant avatar */
  assistantAvatar?: string;
};

/**
 * Timestamp configuration for message bubbles
 */
export type AgentWidgetTimestampConfig = {
  /** Whether to show timestamps */
  show?: boolean;
  /** Position of timestamp relative to message */
  position?: "inline" | "below";
  /** Custom formatter for timestamp display */
  format?: (date: Date) => string;
};

/**
 * Message layout configuration
 * Allows customization of how chat messages are displayed
 */
export type AgentWidgetMessageLayoutConfig = {
  /**
   * Layout preset: "bubble" | "flat" | "minimal"
   * - bubble: Standard chat bubble appearance (default)
   * - flat: Flat messages without bubble styling
   * - minimal: Minimal styling with reduced padding/borders
   */
  layout?: "bubble" | "flat" | "minimal";
  /** Avatar configuration */
  avatar?: AgentWidgetAvatarConfig;
  /** Timestamp configuration */
  timestamp?: AgentWidgetTimestampConfig;
  /** Group consecutive messages from the same role */
  groupConsecutive?: boolean;
  /**
   * Custom renderer for user messages
   * When provided, replaces the default user message rendering
   */
  renderUserMessage?: (context: MessageRenderContext) => HTMLElement;
  /**
   * Custom renderer for assistant messages
   * When provided, replaces the default assistant message rendering
   */
  renderAssistantMessage?: (context: MessageRenderContext) => HTMLElement;
};

/**
 * Available layout slots for content injection
 */
export type WidgetLayoutSlot =
  | "header-left"
  | "header-center"
  | "header-right"
  | "body-top"
  | "messages"
  | "body-bottom"
  | "footer-top"
  | "composer"
  | "footer-bottom";

/**
 * Slot renderer function signature
 * Returns HTMLElement to render in the slot, or null to use default content
 */
export type SlotRenderer = (context: SlotRenderContext) => HTMLElement | null;

/**
 * Main layout configuration
 * Provides comprehensive control over widget layout and appearance
 * 
 * @example
 * ```typescript
 * config: {
 *   layout: {
 *     header: { layout: "minimal" },
 *     messages: {
 *       avatar: { show: true, assistantAvatar: "/bot.png" },
 *       timestamp: { show: true, position: "below" }
 *     },
 *     slots: {
 *       "footer-top": () => {
 *         const el = document.createElement("div");
 *         el.textContent = "Powered by AI";
 *         return el;
 *       }
 *     }
 *   }
 * }
 * ```
 */
export type AgentWidgetLayoutConfig = {
  /** Header layout configuration */
  header?: AgentWidgetHeaderLayoutConfig;
  /** Message layout configuration */
  messages?: AgentWidgetMessageLayoutConfig;
  /** Slot renderers for custom content injection */
  slots?: Partial<Record<WidgetLayoutSlot, SlotRenderer>>;
  /**
   * Show/hide the header section entirely.
   * When false, the header (including icon, title, buttons) is completely hidden.
   * @default true
   */
  showHeader?: boolean;
  /**
   * Show/hide the footer/composer section entirely.
   * When false, the footer (including input field, send button, suggestions) is completely hidden.
   * Useful for read-only conversation previews.
   * @default true
   */
  showFooter?: boolean;
  /**
   * Max width for the content area (messages + composer).
   * Applied with `margin: 0 auto` for centering.
   * Accepts any CSS width value (e.g. "90ch", "720px", "80%").
   */
  contentMaxWidth?: string;
};

// ============================================================================
// Markdown Configuration Types
// ============================================================================

/**
 * Token types for marked renderer methods
 */
export type AgentWidgetMarkdownHeadingToken = {
  type: "heading";
  raw: string;
  depth: 1 | 2 | 3 | 4 | 5 | 6;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownCodeToken = {
  type: "code";
  raw: string;
  text: string;
  lang?: string;
  escaped?: boolean;
};

export type AgentWidgetMarkdownBlockquoteToken = {
  type: "blockquote";
  raw: string;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownTableToken = {
  type: "table";
  raw: string;
  header: Array<{ text: string; tokens: unknown[] }>;
  rows: Array<Array<{ text: string; tokens: unknown[] }>>;
  align: Array<"left" | "center" | "right" | null>;
};

export type AgentWidgetMarkdownLinkToken = {
  type: "link";
  raw: string;
  href: string;
  title: string | null;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownImageToken = {
  type: "image";
  raw: string;
  href: string;
  title: string | null;
  text: string;
};

export type AgentWidgetMarkdownListToken = {
  type: "list";
  raw: string;
  ordered: boolean;
  start: number | "";
  loose: boolean;
  items: unknown[];
};

export type AgentWidgetMarkdownListItemToken = {
  type: "list_item";
  raw: string;
  task: boolean;
  checked?: boolean;
  loose: boolean;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownParagraphToken = {
  type: "paragraph";
  raw: string;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownCodespanToken = {
  type: "codespan";
  raw: string;
  text: string;
};

export type AgentWidgetMarkdownStrongToken = {
  type: "strong";
  raw: string;
  text: string;
  tokens: unknown[];
};

export type AgentWidgetMarkdownEmToken = {
  type: "em";
  raw: string;
  text: string;
  tokens: unknown[];
};

/**
 * Custom renderer overrides for markdown elements.
 * Each method receives the token and should return an HTML string.
 * Return `false` to use the default renderer.
 * 
 * @example
 * ```typescript
 * renderer: {
 *   heading(token) {
 *     return `<h${token.depth} class="custom-heading">${token.text}</h${token.depth}>`;
 *   },
 *   link(token) {
 *     return `<a href="${token.href}" target="_blank" rel="noopener">${token.text}</a>`;
 *   }
 * }
 * ```
 */
export type AgentWidgetMarkdownRendererOverrides = {
  /** Override heading rendering (h1-h6) */
  heading?: (token: AgentWidgetMarkdownHeadingToken) => string | false;
  /** Override code block rendering */
  code?: (token: AgentWidgetMarkdownCodeToken) => string | false;
  /** Override blockquote rendering */
  blockquote?: (token: AgentWidgetMarkdownBlockquoteToken) => string | false;
  /** Override table rendering */
  table?: (token: AgentWidgetMarkdownTableToken) => string | false;
  /** Override link rendering */
  link?: (token: AgentWidgetMarkdownLinkToken) => string | false;
  /** Override image rendering */
  image?: (token: AgentWidgetMarkdownImageToken) => string | false;
  /** Override list rendering (ul/ol) */
  list?: (token: AgentWidgetMarkdownListToken) => string | false;
  /** Override list item rendering */
  listitem?: (token: AgentWidgetMarkdownListItemToken) => string | false;
  /** Override paragraph rendering */
  paragraph?: (token: AgentWidgetMarkdownParagraphToken) => string | false;
  /** Override inline code rendering */
  codespan?: (token: AgentWidgetMarkdownCodespanToken) => string | false;
  /** Override strong/bold rendering */
  strong?: (token: AgentWidgetMarkdownStrongToken) => string | false;
  /** Override emphasis/italic rendering */
  em?: (token: AgentWidgetMarkdownEmToken) => string | false;
  /** Override horizontal rule rendering */
  hr?: () => string | false;
  /** Override line break rendering */
  br?: () => string | false;
  /** Override deleted/strikethrough rendering */
  del?: (token: { type: "del"; raw: string; text: string; tokens: unknown[] }) => string | false;
  /** Override checkbox rendering (in task lists) */
  checkbox?: (token: { checked: boolean }) => string | false;
  /** Override HTML passthrough */
  html?: (token: { type: "html"; raw: string; text: string }) => string | false;
  /** Override text rendering */
  text?: (token: { type: "text"; raw: string; text: string }) => string | false;
};

/**
 * Markdown parsing options (subset of marked options)
 */
export type AgentWidgetMarkdownOptions = {
  /** 
   * Enable GitHub Flavored Markdown (tables, strikethrough, autolinks).
   * @default true 
   */
  gfm?: boolean;
  /** 
   * Convert \n in paragraphs into <br>.
   * @default true 
   */
  breaks?: boolean;
  /** 
   * Conform to original markdown.pl as much as possible.
   * @default false 
   */
  pedantic?: boolean;
  /** 
   * Add id attributes to headings.
   * @default false 
   */
  headerIds?: boolean;
  /** 
   * Prefix for heading id attributes.
   * @default "" 
   */
  headerPrefix?: string;
  /** 
   * Mangle email addresses for spam protection.
   * @default true 
   */
  mangle?: boolean;
  /** 
   * Silent mode - don't throw on parse errors.
   * @default false 
   */
  silent?: boolean;
};

/**
 * Markdown configuration for customizing how markdown is rendered in chat messages.
 * Provides three levels of control:
 * 
 * 1. **CSS Variables** - Override styles via `--cw-md-*` CSS custom properties
 * 2. **Parsing Options** - Configure marked behavior via `options`
 * 3. **Custom Renderers** - Full control via `renderer` overrides
 * 
 * @example
 * ```typescript
 * // Level 2: Configure parsing options
 * config: {
 *   markdown: {
 *     options: {
 *       gfm: true,
 *       breaks: true,
 *       headerIds: true
 *     }
 *   }
 * }
 * ```
 * 
 * @example
 * ```typescript
 * // Level 3: Custom renderers
 * config: {
 *   markdown: {
 *     renderer: {
 *       heading(token) {
 *         return `<h${token.depth} class="custom-h${token.depth}">${token.text}</h${token.depth}>`;
 *       },
 *       link(token) {
 *         return `<a href="${token.href}" target="_blank">${token.text}</a>`;
 *       },
 *       table(token) {
 *         // Wrap tables in a scrollable container
 *         return `<div class="table-scroll">${this.parser.parse(token.tokens)}</div>`;
 *       }
 *     }
 *   }
 * }
 * ```
 */
export type AgentWidgetMarkdownConfig = {
  /**
   * Markdown parsing options.
   * These are passed directly to the marked parser.
   */
  options?: AgentWidgetMarkdownOptions;
  
  /**
   * Custom renderer overrides for specific markdown elements.
   * Each method receives a token object and should return an HTML string.
   * Return `false` to fall back to the default renderer.
   */
  renderer?: AgentWidgetMarkdownRendererOverrides;
  
  /**
   * Disable default markdown CSS styles.
   * When true, the widget won't apply any default styles to markdown elements,
   * allowing you to provide your own CSS.
   * 
   * @default false
   */
  disableDefaultStyles?: boolean;
};

/**
 * Configuration for file attachments in the composer.
 * Enables users to attach images to their messages.
 *
 * @example
 * ```typescript
 * config: {
 *   attachments: {
 *     enabled: true,
 *     allowedTypes: ['image/png', 'image/jpeg', 'image/gif', 'image/webp'],
 *     maxFileSize: 5 * 1024 * 1024, // 5MB
 *     maxFiles: 4
 *   }
 * }
 * ```
 */
export type AgentWidgetAttachmentsConfig = {
  /**
   * Enable/disable file attachments.
   * @default false
   */
  enabled?: boolean;
  /**
   * Allowed MIME types for attachments.
   * @default ['image/png', 'image/jpeg', 'image/gif', 'image/webp']
   */
  allowedTypes?: string[];
  /**
   * Maximum file size in bytes.
   * @default 10485760 (10MB)
   */
  maxFileSize?: number;
  /**
   * Maximum number of files per message.
   * @default 4
   */
  maxFiles?: number;
  /**
   * Button icon name (from Lucide icons).
   * @default 'image-plus'
   */
  buttonIconName?: string;
  /**
   * Tooltip text for the attachment button.
   * @default 'Attach image'
   */
  buttonTooltipText?: string;
  /**
   * Callback when a file is rejected (wrong type or too large).
   */
  onFileRejected?: (file: File, reason: 'type' | 'size' | 'count') => void;
  /**
   * Customize the drag-and-drop overlay that appears when files are dragged over the widget.
   */
  dropOverlay?: {
    /** Background color/value of the overlay. @default 'rgba(59, 130, 246, 0.08)' */
    background?: string;
    /** Backdrop blur applied behind the overlay (CSS value). @default '8px' */
    backdropBlur?: string;
    /** Border style shown during drag. @default '2px dashed rgba(59, 130, 246, 0.4)' */
    border?: string;
    /** Border radius of the overlay. @default 'inherit' */
    borderRadius?: string;
    /** Inset/margin pulling the overlay away from the container edges (CSS value). @default '0' */
    inset?: string;
    /** Lucide icon name displayed in the center. @default 'upload' */
    iconName?: string;
    /** Icon size (CSS value). @default '48px' */
    iconSize?: string;
    /** Icon stroke color. @default 'rgba(59, 130, 246, 0.6)' */
    iconColor?: string;
    /** Icon stroke width. @default 0.5 */
    iconStrokeWidth?: number;
    /** Optional label text shown below the icon. */
    label?: string;
    /** Label font size. @default '0.875rem' */
    labelSize?: string;
    /** Label color. @default 'rgba(59, 130, 246, 0.8)' */
    labelColor?: string;
  };
};

/**
 * Configuration for persisting widget state across page navigations.
 * Stores open/closed state, voice recognition state, and voice mode in browser storage.
 * 
 * @example
 * ```typescript
 * config: {
 *   persistState: true  // Use defaults: sessionStorage, persist open state
 * }
 * ```
 * 
 * @example
 * ```typescript
 * config: {
 *   persistState: {
 *     storage: 'local',  // Use localStorage instead of sessionStorage
 *     keyPrefix: 'myapp-',  // Custom prefix for storage keys
 *     persist: {
 *       openState: true,
 *       voiceState: true,
 *       focusInput: true
 *     },
 *     clearOnChatClear: true
 *   }
 * }
 * ```
 */
export type AgentWidgetPersistStateConfig = {
  /**
   * Storage type to use.
   * @default 'session'
   */
  storage?: 'local' | 'session';
  /**
   * Prefix for storage keys.
   * @default 'persona-'
   */
  keyPrefix?: string;
  /**
   * What state to persist.
   */
  persist?: {
    /**
     * Persist widget open/closed state.
     * @default true
     */
    openState?: boolean;
    /**
     * Persist voice recognition state.
     * @default true
     */
    voiceState?: boolean;
    /**
     * Focus input when restoring open state.
     * @default true
     */
    focusInput?: boolean;
  };
  /**
   * Clear persisted state when chat is cleared.
   * @default true
   */
  clearOnChatClear?: boolean;
};

// ============================================================================
// Loading Indicator Types
// ============================================================================

/**
 * Context provided to loading indicator render functions.
 * Used for customizing the loading indicator appearance.
 */
export type LoadingIndicatorRenderContext = {
  /**
   * Full widget configuration for accessing theme, etc.
   */
  config: AgentWidgetConfig;
  /**
   * Current streaming state (always true when indicator is shown)
   */
  streaming: boolean;
  /**
   * Location where the indicator is rendered:
   * - 'inline': Inside a streaming assistant message bubble (when content is empty)
   * - 'standalone': Separate bubble while waiting for stream to start
   */
  location: 'inline' | 'standalone';
  /**
   * Function to render the default 3-dot bouncing indicator.
   * Call this if you want to use the default for certain cases.
   */
  defaultRenderer: () => HTMLElement;
};

/**
 * Context provided to idle indicator render functions.
 * Used for customizing the idle state indicator appearance.
 */
export type IdleIndicatorRenderContext = {
  /**
   * Full widget configuration for accessing theme, etc.
   */
  config: AgentWidgetConfig;
  /**
   * The last message in the conversation (if any).
   * Useful for conditional rendering based on who spoke last.
   */
  lastMessage: AgentWidgetMessage | undefined;
  /**
   * Total number of messages in the conversation.
   */
  messageCount: number;
};

/**
 * Configuration for customizing the loading indicator.
 * The loading indicator is shown while waiting for a response or
 * when an assistant message is streaming but has no content yet.
 *
 * @example
 * ```typescript
 * // Custom animated spinner
 * config: {
 *   loadingIndicator: {
 *     render: ({ location }) => {
 *       const el = document.createElement('div');
 *       el.innerHTML = '<svg class="spinner">...</svg>';
 *       el.setAttribute('data-preserve-animation', 'true');
 *       return el;
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Different indicators by location
 * config: {
 *   loadingIndicator: {
 *     render: ({ location, defaultRenderer }) => {
 *       if (location === 'inline') {
 *         return defaultRenderer(); // Use default for inline
 *       }
 *       // Custom for standalone
 *       const el = document.createElement('div');
 *       el.textContent = 'Thinking...';
 *       return el;
 *     }
 *   }
 * }
 * ```
 *
 * @example
 * ```typescript
 * // Hide loading indicator entirely
 * config: {
 *   loadingIndicator: {
 *     render: () => null
 *   }
 * }
 * ```
 */
export type AgentWidgetLoadingIndicatorConfig = {
  /**
   * Whether to show the bubble background and border around the standalone loading indicator.
   * Set to false to render the loading indicator without any bubble styling.
   * @default true
   */
  showBubble?: boolean;

  /**
   * Custom render function for the loading indicator.
   * Return an HTMLElement to display, or null to hide the indicator.
   *
   * For custom animations, add `data-preserve-animation="true"` attribute
   * to prevent the DOM morpher from interrupting the animation.
   */
  render?: (context: LoadingIndicatorRenderContext) => HTMLElement | null;

  /**
   * Render function for the idle state indicator.
   * Called when the widget is idle (not streaming) and has at least one message.
   * Return an HTMLElement to display, or null to hide (default).
   *
   * For animations, add `data-preserve-animation="true"` attribute
   * to prevent the DOM morpher from interrupting the animation.
   *
   * @example
   * ```typescript
   * loadingIndicator: {
   *   renderIdle: ({ lastMessage }) => {
   *     // Only show idle indicator after assistant messages
   *     if (lastMessage?.role !== 'assistant') return null;
   *     const el = document.createElement('div');
   *     el.className = 'pulse-dot';
   *     el.setAttribute('data-preserve-animation', 'true');
   *     return el;
   *   }
   * }
   * ```
   */
  renderIdle?: (context: IdleIndicatorRenderContext) => HTMLElement | null;
};

export type AgentWidgetConfig = {
  apiUrl?: string;
  flowId?: string;
  /**
   * Persisted Runtype agent ID to execute.
   *
   * This is the primary Runtype entry point for simple agent-backed widgets.
   * It is mutually exclusive with `flowId` and with inline `agent` configs.
   * Voice and Runtype TTS providers inherit this value unless they specify their
   * own feature-scoped agent ID.
   */
  agentId?: string;
  /**
   * Normalized, backend-neutral routing target. A single string that selects
   * the backend resource to talk to, optimized for portability across
   * frameworks (it is always serializable: no live objects).
   *
   * Shapes:
   * - Runtype TypeID (no prefix): `"agent_…"` / `"flow_…"` route to the
   *   Runtype agent/flow paths (the prefix is self-describing).
   * - Provider-prefixed: `"<provider>:<id>"` is resolved by
   *   `targetProviders[provider]` (e.g. `"eve:support"`). `"runtype:…"` is a
   *   built-in that re-detects a TypeID.
   * - Bare name: `"support"` requires a `targetProviders.default` resolver.
   *
   * Mutually exclusive with `agentId`, `flowId`, and inline `agent`. Prefer
   * `target` for backend-agnostic apps; use `agentId`/`flowId` for the explicit
   * Runtype path.
   *
   * @example
   * ```typescript
   * config: { target: "agent_01k..." }            // Runtype agent
   * config: { target: "flow_01k..." }             // Runtype flow
   * config: {                                       // custom backend
   *   apiUrl: "/api/chat",
   *   target: "eve:support",
   *   targetProviders: { eve: (id) => ({ payload: { assistant: id } }) },
   * }
   * ```
   */
  target?: string;
  /**
   * Prefix-keyed resolvers for `target` strings of the form
   * `"<provider>:<id>"`. Each resolver maps the id to the dispatch-payload
   * fragment its backend expects. Register a `default` resolver to also accept
   * bare (unprefixed, non-TypeID) target names. The built-in `runtype` provider
   * is always available and does not need to be registered.
   */
  targetProviders?: Record<string, TargetResolver>;
  /**
   * Override the assistant-bubble copy shown when a dispatch fails before any
   * response streams back (connection refused, CORS, 4xx/5xx, malformed
   * stream). Provide a static string, or a function of the error so you can
   * tailor the message per failure and decide whether to surface the raw
   * reason. When omitted, a default message is shown that includes the
   * underlying error detail.
   *
   * Returning an empty string suppresses the fallback bubble entirely (the
   * `onError` callback still fires).
   *
   * @example
   * ```typescript
   * config: {
   *   // Static
   *   errorMessage: "We're having trouble connecting. Please try again."
   *   // Or dynamic
   *   errorMessage: (error) =>
   *     error.message.includes("Failed to fetch")
   *       ? "You appear to be offline."
   *       : "Something went wrong. Please try again."
   * }
   * ```
   */
  errorMessage?: string | ((error: Error) => string);
  /**
   * Agent configuration for agent execution mode.
   * When provided, the widget uses agent loop execution instead of flow dispatch.
   * Mutually exclusive with `flowId`.
   *
   * Note: `@runtypelabs/persona-proxy` rejects a client-supplied `agent` (it was
   * an open relay). This option is only for endpoints authorized to accept a
   * client agent — your own backend, or token-scoped direct-to-Runtype dispatch.
   * For the proxy, pin the agent server-side with `agentConfig`/`agentId`.
   *
   * @example
   * ```typescript
   * config: {
   *   agent: {
   *     name: 'Assistant',
   *     model: 'openai:gpt-4o-mini',
   *     systemPrompt: 'You are a helpful assistant.',
    *     loopConfig: { maxTurns: 5 }
   *   }
   * }
   * ```
   */
  agent?: AgentConfig;
  /**
   * Options for agent execution requests.
   * Only used when `agent` is configured.
   *
   * @default { streamResponse: true, recordMode: 'virtual' }
   */
  agentOptions?: AgentRequestOptions;
  /**
   * Controls how multiple agent iterations are displayed in the chat UI.
   * Only used when `agent` is configured.
   *
   * - `'separate'`: Each iteration creates a new assistant message bubble
   * - `'merged'`: All iterations stream into a single assistant message
   *
   * @default 'separate'
   */
  iterationDisplay?: 'separate' | 'merged';
  /**
   * Client token for direct browser-to-API communication.
   * When set, the widget uses /v1/client/* endpoints instead of /v1/dispatch.
   * Mutually exclusive with apiKey/headers authentication.
   * 
   * @example
   * ```typescript
   * config: {
   *   clientToken: 'ct_live_flow01k7_a8b9c0d1e2f3g4h5i6j7k8l9'
   * }
   * ```
   */
  clientToken?: string;
  /**
   * Callback when session is initialized (client token mode only).
   * Receives session info including expiry time.
   * 
   * @example
   * ```typescript
   * config: {
   *   onSessionInit: (session) => {
   *     console.log('Session started:', session.sessionId);
   *   }
   * }
   * ```
   */
  onSessionInit?: (session: ClientSession) => void;
  /**
   * Callback when session expires or errors (client token mode only).
   * Widget should prompt user to refresh.
   * 
   * @example
   * ```typescript
   * config: {
   *   onSessionExpired: () => {
   *     alert('Your session has expired. Please refresh the page.');
   *   }
   * }
   * ```
   */
  onSessionExpired?: () => void;
  /**
   * Get stored session ID for session resumption (client token mode only).
   * Called when initializing a new session to check if there's a previous session_id
   * that should be passed to /client/init to resume the same conversation record.
   * 
   * @example
   * ```typescript
   * config: {
   *   getStoredSessionId: () => {
   *     const stored = localStorage.getItem('session_id');
   *     return stored || null;
   *   }
   * }
   * ```
   */
  getStoredSessionId?: () => string | null;
  /**
   * Store session ID for session resumption (client token mode only).
   * Called when a new session is initialized to persist the session_id
   * so it can be used to resume the conversation later.
   * 
   * @example
   * ```typescript
   * config: {
   *   setStoredSessionId: (sessionId) => {
   *     localStorage.setItem('session_id', sessionId);
   *   }
   * }
   * ```
   */
  setStoredSessionId?: (sessionId: string) => void;
  /**
   * Static headers to include with each request.
   * For dynamic headers (e.g., auth tokens), use `getHeaders` instead.
   */
  headers?: Record<string, string>;
  /**
   * Dynamic headers function - called before each request.
   * Useful for adding auth tokens that may change.
   * @example
   * ```typescript
   * getHeaders: async () => ({
   *   'Authorization': `Bearer ${await getAuthToken()}`
   * })
   * ```
   */
  getHeaders?: AgentWidgetHeadersFunction;
  copy?: {
    welcomeTitle?: string;
    welcomeSubtitle?: string;
    inputPlaceholder?: string;
    sendButtonLabel?: string;
    /** Button label shown in text mode while a response is streaming. Default: "Stop". */
    stopButtonLabel?: string;
    /**
     * When false, the welcome / intro card is not shown above the message list.
     * @default true
     */
    showWelcomeCard?: boolean;
    /**
     * Per-stop-reason copy for the inline notice rendered on assistant
     * bubbles when the runtime reports a non-natural stop (e.g. the agent
     * loop hit `max_tool_calls` and was cut off mid-loop). Each key is
     * optional: keys you omit fall back to the built-in defaults. Set a
     * key to an empty string to suppress the notice for that reason.
     */
    stopReasonNotice?: Partial<Record<StopReasonKind, string>>;
  };
  /**
   * Semantic design tokens (`palette`, `semantic`, `components`).
   * Omit for library defaults.
   */
  theme?: DeepPartial<PersonaTheme>;
  /**
   * Dark-mode token overrides. Merged over `theme` when the active scheme is dark.
   */
  darkTheme?: DeepPartial<PersonaTheme>;
  /**
   * Color scheme mode for the widget.
   * - 'light': Always use light theme (default)
   * - 'dark': Always use dark theme
   * - 'auto': Automatically detect from page (HTML class or prefers-color-scheme)
   * 
   * When 'auto', detection order:
   * 1. Check if `<html>` has 'dark' class
   * 2. Fall back to `prefers-color-scheme: dark` media query
   * 
   * @default 'light'
   */
  colorScheme?: 'auto' | 'light' | 'dark';
  features?: AgentWidgetFeatureFlags;
  /**
   * When true, focus the chat input after the panel opens and the open animation completes.
   * Applies to launcher mode (user click, controller.open(), autoExpand) and inline mode (on init).
   * Skip when voice is active to avoid stealing focus from voice UI.
   * @default false
   */
  autoFocusInput?: boolean;
  launcher?: AgentWidgetLauncherConfig;
  initialMessages?: AgentWidgetMessage[];
  /**
   * Artifacts to hydrate into the pane at init. Typically populated from
   * `storageAdapter.load()` alongside `initialMessages` so the artifact pane
   * survives a page refresh.
   */
  initialArtifacts?: PersonaArtifactRecord[];
  /**
   * Which artifact id (if any) should be selected in the pane at init. Paired
   * with `initialArtifacts`.
   */
  initialSelectedArtifactId?: string | null;
  suggestionChips?: string[];
  suggestionChipsConfig?: AgentWidgetSuggestionChipsConfig;
  debug?: boolean;
  formEndpoint?: string;
  launcherWidth?: string;
  sendButton?: AgentWidgetSendButtonConfig;
  statusIndicator?: AgentWidgetStatusIndicatorConfig;
  voiceRecognition?: AgentWidgetVoiceRecognitionConfig;
  /**
   * Text-to-speech configuration for reading assistant messages aloud.
   * Uses the browser's Web Speech API (`speechSynthesis`).
   *
   * @example
   * ```typescript
   * config: {
   *   textToSpeech: {
   *     enabled: true,
   *     voice: 'Google US English',
   *     rate: 1.0,
   *     pitch: 1.0
   *   }
   * }
   * ```
   */
  textToSpeech?: TextToSpeechConfig;
  toolCall?: AgentWidgetToolCallConfig;
  reasoning?: AgentWidgetReasoningConfig;
  /**
   * Configuration for tool approval bubbles.
   * Set to `false` to disable built-in approval handling entirely.
   *
   * @example
   * ```typescript
   * config: {
   *   approval: {
   *     title: "Permission Required",
   *     approveLabel: "Allow",
   *     denyLabel: "Block",
   *     approveButtonColor: "#16a34a"
   *   }
   * }
   * ```
   */
  approval?: AgentWidgetApprovalConfig | false;
  /**
   * WebMCP: consume page-registered tools (`document.modelContext.registerTool`).
   * When `enabled`, the widget installs `@mcp-b/webmcp-polyfill`, snapshots the
   * registry on every dispatch, ships it as `clientTools[]`, and executes
   * returned `webmcp:*` tool calls with confirm-by-default gating.
   *
   * Server-side policy on the chat surface is the source of truth: these
   * fields layer on top.
   *
   * @example
   * ```typescript
   * config: {
   *   webmcp: {
   *     enabled: true,
   *     allowlist: ['search_*', 'list_*'],
   *   }
   * }
   * ```
   */
  webmcp?: AgentWidgetWebMcpConfig;
  postprocessMessage?: (context: {
    text: string;
    message: AgentWidgetMessage;
    streaming: boolean;
    raw?: string;
  }) => string;
  plugins?: AgentWidgetPlugin[];
  contextProviders?: AgentWidgetContextProvider[];
  /**
   * Context mentions: let users explicitly pull external context into a turn by
   * typing `@` or clicking a visible composer button, both opening one shared
   * searchable menu of host-provided sources. Selecting a mention adds a
   * removable pill chip; resolved content reaches the model via `llmAppend`
   * (default) or the opt-in structured `context` channel.
   *
   * Disabled by default. When enabled, the mention runtime is lazy-loaded from a
   * sibling chunk on first use, so sites that leave it off pay no bundle cost.
   * See `docs/context-mentions-plan.md`.
   */
  contextMentions?: AgentWidgetContextMentionConfig;
  requestMiddleware?: AgentWidgetRequestMiddleware;
  actionParsers?: AgentWidgetActionParser[];
  actionHandlers?: AgentWidgetActionHandler[];
  storageAdapter?: AgentWidgetStorageAdapter;
  /**
   * Called after state is loaded from the storage adapter, but before the widget
   * initializes with that state. Use this to transform or inject messages based
   * on external state (e.g., navigation flags, checkout returns).
   *
   * This hook runs synchronously and must return the (potentially modified) state.
   *
   * Returning `{ state, open: true }` also signals that the widget panel should
   * open after initialization: useful when injecting a post-navigation message
   * that the user should immediately see.
   *
   * @example
   * ```typescript
   * // Plain state transform (existing form, still supported)
   * config: {
   *   onStateLoaded: (state) => {
   *     const navMessage = consumeNavigationFlag();
   *     if (navMessage) {
   *       return {
   *         ...state,
   *         messages: [...(state.messages || []), {
   *           id: `nav-${Date.now()}`,
   *           role: 'assistant',
   *           content: navMessage,
   *           createdAt: new Date().toISOString()
   *         }]
   *       };
   *     }
   *     return state;
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Return { state, open: true } to also open the panel
   * config: {
   *   onStateLoaded: (state) => {
   *     const navMessage = consumeNavigationFlag();
   *     if (navMessage) {
   *       return {
   *         state: {
   *           ...state,
   *           messages: [...(state.messages || []), {
   *             id: `nav-${Date.now()}`,
   *             role: 'assistant',
   *             content: navMessage,
   *             createdAt: new Date().toISOString()
   *           }]
   *         },
   *         open: true
   *       };
   *     }
   *     return state;
   *   }
   * }
   * ```
   */
  onStateLoaded?: (state: AgentWidgetStoredState) =>
    AgentWidgetStoredState | { state: AgentWidgetStoredState; open?: boolean };
  /**
   * Registry of custom components that can be rendered from JSON directives.
   * Components are registered by name and can be invoked via JSON responses
   * with the format: `{"component": "ComponentName", "props": {...}}`
   * 
   * @example
   * ```typescript
   * config: {
   *   components: {
   *     ProductCard: (props, context) => {
   *       const card = document.createElement("div");
   *       card.innerHTML = `<h3>${props.title}</h3><p>$${props.price}</p>`;
   *       return card;
   *     }
   *   }
   * }
   * ```
   */
  components?: Record<string, AgentWidgetComponentRenderer>;
  /**
   * Enable component streaming. When true, component props will be updated
   * incrementally as they stream in from the JSON response.
   * 
   * @default true
   */
  enableComponentStreaming?: boolean;
  /**
   * When false, JSON component directives render without the default bubble chrome
   * (surface background, border, extra padding). Use for wide custom cards in the transcript.
   * @default true
   */
  wrapComponentDirectiveInBubble?: boolean;
  /**
   * Custom stream parser for extracting text from streaming structured responses.
   * Handles incremental parsing of JSON, XML, or other formats.
   * If not provided, uses the default JSON parser.
   * 
   * @example
   * ```typescript
   * streamParser: () => ({
   *   processChunk: async (content) => {
   *     // Return null if not your format, or extracted text if available
   *     if (!content.trim().startsWith('{')) return null;
   *     return extractText(content);
   *   },
   *   getExtractedText: () => extractedText
   * })
   * ```
   */
  streamParser?: () => AgentWidgetStreamParser;
  /**
   * Additional localStorage key to clear when the clear chat button is clicked.
   * The widget automatically clears `"persona-chat-history"` by default.
   * Use this option to clear additional keys (e.g., if you're using a custom storage key).
   * 
   * @example
   * ```typescript
   * config: {
   *   clearChatHistoryStorageKey: "my-custom-chat-history"
   * }
   * ```
   */
  clearChatHistoryStorageKey?: string;
  /**
   * Built-in parser type selector. Provides an easy way to choose a parser without importing functions.
   * If both `parserType` and `streamParser` are provided, `streamParser` takes precedence.
   * 
   * - `"plain"` - Plain text parser (default). Passes through text as-is.
   * - `"json"` - JSON parser using partial-json. Extracts `text` field from JSON objects incrementally.
   * - `"regex-json"` - Regex-based JSON parser. Less robust but faster fallback for simple JSON.
   * - `"xml"` - XML parser. Extracts text content from XML tags.
   * 
   * @example
   * ```typescript
   * config: {
   *   parserType: "json"  // Use built-in JSON parser
   * }
   * ```
   * 
   * @example
   * ```typescript
   * config: {
   *   parserType: "json",
   *   streamParser: () => customParser()  // Custom parser overrides parserType
   * }
   * ```
   */
  parserType?: "plain" | "json" | "regex-json" | "xml";
  /**
   * Custom fetch function for full control over API requests.
   * Use this for custom authentication, request/response transformation, etc.
   *
   * When provided, this function is called instead of the default fetch.
   * You receive the URL, RequestInit, and the payload that would be sent.
   *
   * @example
   * ```typescript
   * config: {
   *   customFetch: async (url, init, payload) => {
   *     // Transform request for your API format
   *     const myPayload = {
   *       flow: { id: 'my-flow-id' },
   *       messages: payload.messages,
   *       options: { stream_response: true }
   *     };
   *
   *     // Add auth header
   *     const token = await getAuthToken();
   *
   *     return fetch('/my-api/dispatch', {
   *       method: 'POST',
   *       headers: {
   *         'Content-Type': 'application/json',
   *         'Authorization': `Bearer ${token}`
   *       },
   *       body: JSON.stringify(myPayload),
   *       signal: init.signal
   *     });
   *   }
   * }
   * ```
   */
  customFetch?: AgentWidgetCustomFetch;
  /**
   * Durable-session reconnect transport (host-owned, symmetric to
   * {@link customFetch}). When a durable agent stream drops mid-turn (any
   * resumable, server-persisted execution, e.g. Claude Managed agents or
   * async/background runs), the widget calls this to fetch the read-only
   * reconnect stream and pipes its body through the normal event pipeline to
   * resume from where it left off.
   *
   * The host closure owns `agentId` / `conversationId` / base URL / auth and
   * builds the events request, e.g.:
   *
   * ```typescript
   * reconnectStream: ({ executionId, after, signal }) =>
   *   fetch(
   *     `${baseUrl}/v1/agents/${agentId}/executions/${executionId}` +
   *       `/events?conversationId=${conversationId}&after=${after}`,
   *     { headers: { Authorization: `Bearer ${token}`, "X-Persona-Version": ver }, signal }
   *   )
   * ```
   *
   * Resolve with a `text/event-stream` `Response`. Throw or resolve non-ok to
   * signal "this attempt failed" (the widget backs off and retries, then gives
   * up after the bounded attempts). Reconnect only ever arms on the durable
   * lane (streams carrying SSE `id:` lines); without this hook a drop finalizes
   * exactly as before.
   */
  reconnectStream?: (ctx: {
    executionId: string;
    after: string;
    signal: AbortSignal;
  }) => Promise<Response>;
  /**
   * Tuning for the auto-reconnect backoff. Defaults to ~5 attempts over ~30s
   * (`backoffMs: [1000, 2000, 4000, 8000, 8000]`).
   */
  reconnect?: {
    /** Max reconnect attempts before giving up and finalizing. @default backoffMs.length */
    maxAttempts?: number;
    /** Per-attempt delay (ms) before each retry. @default [1000, 2000, 4000, 8000, 8000] */
    backoffMs?: number[];
  };
  /**
   * Called whenever the durable resume handle changes: created when a durable
   * turn starts streaming, updated as the cursor advances (throttled), and
   * `null` when the turn finishes, errors, or is torn down. Persist
   * `{ executionId, lastEventId }` next to your `conversationId` and pass it
   * back via {@link resume} on the next mount to survive a tab reload.
   */
  onExecutionState?: (handle: ResumableHandle | null) => void;
  /**
   * Resume a durable turn on boot (tab-reload path). When present alongside
   * {@link reconnectStream}, the widget enters `resuming` immediately on mount
   * and reconnects from `after`, replaying everything past the cursor into the
   * restored conversation.
   */
  resume?: { executionId: string; after: string };
  /**
   * Custom SSE event parser for non-standard streaming response formats.
   *
   * Use this when your API returns SSE events in a different format than expected.
   * Return `{ text }` for text chunks, `{ done: true }` for completion,
   * `{ error }` for errors, or `null` to ignore the event.
   *
   * @example
   * ```typescript
   * // For Runtype API format
   * config: {
   *   parseSSEEvent: (data) => {
   *     if ((data.type === 'step_delta' || data.type === 'step_chunk') && (data.delta || data.chunk)) {
   *       return { text: data.delta ?? data.chunk };
   *     }
   *     if (data.type === 'flow_complete') {
   *       return { done: true };
   *     }
   *     if (data.type === 'step_error') {
   *       return { error: data.error };
   *     }
   *     return null; // Ignore other events
   *   }
   * }
   * ```
   */
  parseSSEEvent?: AgentWidgetSSEEventParser;
  /**
   * Called for every parsed SSE frame (after JSON parse), before native handling.
   * Use for lightweight side effects (e.g. telemetry). Does not replace native
   * streaming; pair with {@link parseSSEEvent} only when you need to override text mapping.
   *
   * When the event stream inspector is enabled, this runs in the same order as
   * events are appended to the inspector buffer.
   */
  onSSEEvent?: (eventType: string, payload: unknown) => void;
  /**
   * Layout configuration for customizing widget appearance and structure.
   * Provides control over header, messages, and content slots.
   * 
   * @example
   * ```typescript
   * config: {
   *   layout: {
   *     header: { layout: "minimal" },
   *     messages: { avatar: { show: true } }
   *   }
   * }
   * ```
   */
  layout?: AgentWidgetLayoutConfig;
  
  /**
   * Markdown rendering configuration.
   * Customize how markdown is parsed and rendered in chat messages.
   * 
   * Override methods:
   * 1. **CSS Variables** - Override `--cw-md-*` variables in your stylesheet
   * 2. **Options** - Configure marked parser behavior
   * 3. **Renderers** - Custom rendering functions for specific elements
   * 4. **postprocessMessage** - Complete control over message transformation
   * 
   * @example
   * ```typescript
   * config: {
   *   markdown: {
   *     options: { breaks: true, gfm: true },
   *     renderer: {
   *       link(token) {
   *         return `<a href="${token.href}" target="_blank">${token.text}</a>`;
   *       }
   *     }
   *   }
   * }
   * ```
   */
  markdown?: AgentWidgetMarkdownConfig;

  /**
   * HTML sanitization for rendered message content.
   *
   * The widget renders AI-generated markdown as HTML. By default, all HTML
   * output is sanitized using DOMPurify to prevent XSS attacks.
   *
   * - `true` (default): sanitize using built-in DOMPurify
   * - `false`: disable sanitization (only use with fully trusted content sources)
   * - `(html: string) => string`: custom sanitizer function
   *
   * @default true
   */
  sanitize?: boolean | ((html: string) => string);

  /**
   * Configuration for message action buttons (copy, upvote, downvote).
   * Shows action buttons on assistant messages for user feedback.
   *
   * @example
   * ```typescript
   * config: {
   *   messageActions: {
   *     enabled: true,
   *     showCopy: true,
   *     showUpvote: true,
   *     showDownvote: true,
   *     visibility: 'hover',
   *     onFeedback: (feedback) => {
   *       console.log('Feedback:', feedback.type, feedback.messageId);
   *     },
   *     onCopy: (message) => {
   *       console.log('Copied message:', message.id);
   *     }
   *   }
   * }
   * ```
   */
  messageActions?: AgentWidgetMessageActionsConfig;

  /**
   * Configuration for file attachments in the composer.
   * When enabled, users can attach images to their messages.
   *
   * @example
   * ```typescript
   * config: {
   *   attachments: {
   *     enabled: true,
   *     maxFileSize: 5 * 1024 * 1024, // 5MB
   *     maxFiles: 4
   *   }
   * }
   * ```
   */
  attachments?: AgentWidgetAttachmentsConfig;

  /**
   * Composer extras for custom `renderComposer` plugins (model picker, etc.).
   * `selectedModelId` may be updated at runtime by the host.
   */
  composer?: AgentWidgetComposerConfig;

  /**
   * Persist widget state (open/closed, voice mode) across page navigations.
   * When `true`, uses default settings with sessionStorage.
   * When an object, allows customizing storage type, key prefix, and what to persist.
   *
   * Setting this to `false` is the explicit kill-switch: it disables UI-state
   * persistence **and** message-history persistence. When `false`, any
   * `storageAdapter` you configure is ignored and the default localStorage
   * adapter is not created: no chat history is read or written. Pass `true`
   * (or omit) to keep the default behavior of persisting messages via the
   * configured `storageAdapter` (or the built-in localStorage adapter).
   *
   * @example
   * ```typescript
   * // Simple usage - persist open state in sessionStorage
   * config: {
   *   persistState: true
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Advanced usage
   * config: {
   *   persistState: {
   *     storage: 'local',  // Use localStorage
   *     persist: {
   *       openState: true,
   *       voiceState: true,
   *       focusInput: true
   *     }
   *   }
   * }
   * ```
   *
   * @example
   * ```typescript
   * // Ephemeral widget: no message history written anywhere
   * config: {
   *   persistState: false
   * }
   * ```
   */
  persistState?: boolean | AgentWidgetPersistStateConfig;

  /**
   * Configuration for customizing the loading indicator.
   * The loading indicator is shown while waiting for a response or
   * when an assistant message is streaming but has no content yet.
   *
   * @example
   * ```typescript
   * config: {
   *   loadingIndicator: {
   *     render: ({ location, defaultRenderer }) => {
   *       if (location === 'standalone') {
   *         const el = document.createElement('div');
   *         el.textContent = 'Thinking...';
   *         return el;
   *       }
   *       return defaultRenderer();
   *     }
   *   }
   * }
   * ```
   */
  loadingIndicator?: AgentWidgetLoadingIndicatorConfig;
};

export type AgentWidgetMessageRole = "user" | "assistant" | "system";

export type AgentWidgetReasoning = {
  id: string;
  status: "pending" | "streaming" | "complete";
  chunks: string[];
  /**
   * Reasoning channel scope (wire spec). `"turn"` is ordinary per-turn
   * thinking; `"loop"` is a cross-iteration agent reflection (the fold that
   * replaced the legacy `agent_reflection` event). Absent for legacy streams.
   */
  scope?: "turn" | "loop";
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
};

export type AgentWidgetToolCall = {
  id: string;
  name?: string;
  status: "pending" | "running" | "complete";
  args?: unknown;
  chunks?: string[];
  result?: unknown;
  duration?: number;
  startedAt?: number;
  completedAt?: number;
  durationMs?: number;
};

/**
 * Represents a tool approval request in the chat conversation.
 * Created when the agent requires human approval before executing a tool.
 */
export type AgentWidgetApproval = {
  id: string;
  status: "pending" | "approved" | "denied" | "timeout";
  agentId: string;
  executionId: string;
  toolName: string;
  toolType?: string;
  description: string;
  /**
   * Agent-authored justification for this specific call (the agent's own
   * claim about its intent, extracted server-side from the reserved
   * `_approvalReason` parameter). Render it attributed to the agent and as
   * plain text: it is approver context, not a system statement.
   */
  reason?: string;
  parameters?: unknown;
  resolvedAt?: number;
};

export type AgentWidgetMessageVariant = "assistant" | "reasoning" | "tool" | "approval";

/**
 * Per-turn / per-step stop reason emitted by the runtime on
 * `agent_turn_complete` and `step_complete` SSE events. The vocabulary is
 * owned by the upstream Runtype API: do not extend without coordination.
 *
 * - `end_turn`: natural completion (no affordance needed)
 * - `max_tool_calls`: agent loop tripped the configured tool-call ceiling
 * - `length`: provider hit max output tokens
 * - `content_filter`: provider content filter intervened
 * - `error`: provider/runtime error (prefer existing error rendering)
 * - `unknown`: explicitly reported but uninformative
 *
 * Absent (`undefined`) means "not reported": distinct from `'unknown'`.
 */
export type StopReasonKind = RuntypeStopReasonKind;

/**
 * Represents a message in the chat conversation.
 *
 * @property id - Unique message identifier
 * @property role - Message role: "user", "assistant", or "system"
 * @property content - Message text content (for display)
 * @property contentParts - Original multi-modal content parts (for API requests)
 * @property createdAt - ISO timestamp when message was created
 * @property streaming - Whether message is still streaming (for assistant messages)
 * @property variant - Message variant for assistant messages: "assistant", "reasoning", or "tool"
 * @property sequence - Message ordering number
 * @property reasoning - Reasoning data for assistant reasoning messages
 * @property toolCall - Tool call data for assistant tool messages
 * @property tools - Array of tool calls
 * @property viaVoice - Set to `true` when a user message is sent via voice recognition.
 *                      Useful for implementing voice-specific behaviors like auto-reactivation.
 */
export type AgentWidgetMessage = {
  id: string;
  role: AgentWidgetMessageRole;
  content: string;
  createdAt: string;
  /**
   * Original multi-modal content parts for this message.
   * When present, this is sent to the API instead of `content`.
   * The `content` field contains the text-only representation for display.
   */
  contentParts?: ContentPart[];
  /**
   * Context mentions attached to this (user) message, for transcript fidelity +
   * chip rendering in the sent bubble. Refs only — the resolved payloads are
   * merged into `llmContent`/`contentParts` (model-visible) at send time.
   */
  contextMentions?: AgentWidgetContextMentionRef[];
  /**
   * Resolved opt-in structured mention context for this (user) message, merged
   * into the request `context` under `mentions.<sourceId>.<itemId>` by the
   * client. Internal: set at send time from each source's `resolve().context`.
   */
  mentionContext?: Record<string, unknown>;
  streaming?: boolean;
  variant?: AgentWidgetMessageVariant;
  sequence?: number;
  reasoning?: AgentWidgetReasoning;
  toolCall?: AgentWidgetToolCall;
  tools?: AgentWidgetToolCall[];
  /** Approval data for messages with variant "approval" */
  approval?: AgentWidgetApproval;
  viaVoice?: boolean;
  /**
   * Set to `true` on placeholder messages injected during Runtype voice processing.
   * Use this in `messageTransform` to detect and customize voice processing placeholders.
   *
   * @example
   * messageTransform: ({ text, message }) => {
   *   if (message.voiceProcessing && message.role === 'user') {
   *     return '<div class="my-voice-spinner">Transcribing...</div>';
   *   }
   *   return text;
   * }
   */
  voiceProcessing?: boolean;
  /**
   * Raw structured payload for this message (e.g., JSON action response).
   * Populated automatically when structured parsers run.
   */
  rawContent?: string;
  /**
   * LLM-specific content for API requests.
   * When present, this is sent to the LLM instead of `content`.
   *
   * Priority for API payload:
   * 1. `contentParts` (if present, used as-is for multi-modal)
   * 2. `llmContent` (if present, sent as string)
   * 3. `rawContent` (backward compatibility with structured parsers)
   * 4. `content` (fallback - display content)
   *
   * The `content` field is always used for UI display.
   *
   * @example
   * // Show full details to user, send summary to LLM
   * {
   *   content: "**Product:** iPhone 15 Pro\n**Price:** $1,199\n**SKU:** IP15P-256",
   *   llmContent: "[Product search: iPhone 15 Pro, $1199]"
   * }
   */
  llmContent?: string;
  /**
   * Text segment identity for chronological ordering.
   * When present, identifies which text segment this message represents
   * (e.g., "text_0", "text_1") for messages split at tool boundaries.
   */
  partId?: string;
  /**
   * Metadata for messages created during agent loop execution.
   * Contains execution context like iteration number and turn ID.
   */
  agentMetadata?: AgentMessageMetadata;
  /**
   * Per-turn stop reason reported by the runtime on `agent_turn_complete`
   * (agent-loop path) or the last `step_complete` for a prompt step
   * (dispatch / flow path). Absent when the API did not report a value.
   *
   * When set to a non-natural value (`max_tool_calls`, `length`,
   * `content_filter`, `error`), the widget renders an inline notice on
   * the assistant bubble. See `config.copy.stopReasonNotice` to override
   * the default copy.
   */
  stopReason?: StopReasonKind;
};

// ============================================================================
// Message Injection Types
// ============================================================================

/**
 * Options for injecting a message into the conversation.
 * Supports dual-content where UI display differs from LLM context.
 *
 * @example
 * // Same content for user and LLM
 * {
 *   role: 'assistant',
 *   content: 'Here are your search results...'
 * }
 *
 * @example
 * // Different content: user sees full details, LLM sees summary
 * {
 *   role: 'assistant',
 *   content: '**Found 3 products:**\n- iPhone 15 Pro ($1,199)\n- iPhone 15 ($999)',
 *   llmContent: '[Search results: 3 iPhones, $999-$1199]'
 * }
 */
export type InjectMessageOptions = {
  /**
   * Message role: "assistant", "user", or "system"
   */
  role: AgentWidgetMessageRole;

  /**
   * Content displayed to the user in the chat UI.
   * This is what appears in the message bubble.
   */
  content: string;

  /**
   * Content sent to the LLM in API requests.
   * When omitted, `content` is used for both display and LLM.
   *
   * Use cases:
   * - Redacted content: Show full product details to user, send summary to LLM
   * - Structured data: Show formatted markdown to user, send JSON to LLM
   * - Token optimization: Show verbose content to user, send concise version to LLM
   */
  llmContent?: string;

  /**
   * Multi-modal content parts for the LLM (images, files).
   * Takes precedence over `llmContent` when present.
   * The `content` field is still used for UI display.
   */
  contentParts?: ContentPart[];

  /**
   * Optional message ID. If omitted, auto-generated based on role.
   */
  id?: string;

  /**
   * Optional creation timestamp (ISO string). If omitted, uses current time.
   */
  createdAt?: string;

  /**
   * Optional sequence number for ordering.
   */
  sequence?: number;

  /**
   * Whether the message is still streaming (for incremental updates).
   * @default false
   */
  streaming?: boolean;

  /**
   * Mark this message as a voice processing placeholder.
   * Consumers can detect this in `messageTransform` to render custom UI.
   */
  voiceProcessing?: boolean;

  /**
   * Raw structured payload (typically a JSON string) representing the
   * full directive that produced this message: e.g. `{ "text": "...",
   * "component": "Foo", "props": {...} }`.
   *
   * Mirrors the field populated by stream parsers during normal LLM
   * responses. Set this when injecting a message that should render as a
   * component directive (`hasComponentDirective` /
   * `extractComponentDirectiveFromMessage` look at `rawContent` first).
   *
   * Priority for the API payload remains:
   * `contentParts > llmContent > rawContent > content`. Pass `llmContent`
   * alongside `rawContent` if the LLM should see something other than the
   * raw directive.
   */
  rawContent?: string;
};

/**
 * Options for injecting assistant messages (most common case).
 * Role defaults to 'assistant'.
 */
export type InjectAssistantMessageOptions = Omit<InjectMessageOptions, "role">;

/**
 * Options for injecting user messages.
 * Role defaults to 'user'.
 */
export type InjectUserMessageOptions = Omit<InjectMessageOptions, "role">;

/**
 * Options for injecting system messages.
 * Role defaults to 'system'.
 */
export type InjectSystemMessageOptions = Omit<InjectMessageOptions, "role">;

/**
 * Options for injecting an assistant message that renders as a component
 * directive: sugar over `injectAssistantMessage` for the common case of
 * "render this registered component, same as if the LLM had emitted it".
 *
 * Equivalent to calling `injectAssistantMessage({ content: text, rawContent:
 * JSON.stringify({ text, component, props }), llmContent })`.
 *
 * @example
 * widget.injectComponentDirective({
 *   component: "DynamicForm",
 *   props: { title: "Book a demo", fields: [...] },
 *   text: "Share your details to book a demo.",
 *   llmContent: "[Showed booking form]"
 * });
 */
export type InjectComponentDirectiveOptions = {
  /**
   * Name of a renderer registered via `componentRegistry.register(...)`.
   */
  component: string;

  /**
   * Props passed to the component renderer.
   */
  props?: Record<string, unknown>;

  /**
   * Bubble copy displayed above (or with) the rendered component.
   * Mirrors the `text` field in a streamed JSON directive.
   * @default ""
   */
  text?: string;

  /**
   * Content sent to the LLM in API requests. When omitted, the raw
   * directive JSON is what the LLM would see (per the standard
   * priority chain). Provide a redacted/short version to avoid sending
   * the full directive in subsequent turns.
   */
  llmContent?: string;

  /**
   * Optional message ID. If omitted, an assistant id is auto-generated.
   */
  id?: string;

  /**
   * Optional creation timestamp (ISO string). If omitted, uses current time.
   */
  createdAt?: string;

  /**
   * Optional sequence number for ordering.
   */
  sequence?: number;
};

/**
 * Optional file metadata attached to a markdown artifact that represents a
 * concrete file written by a Claude Managed agent (e.g. `/mnt/session/outputs/cat.html`).
 * Additive: the artifact content stays a fenced code block on the wire for
 * backward compatibility; new widgets use this to recover the raw source and
 * offer a preview. Mirrors the `file` field on the core `artifact_start` event.
 */
export type PersonaArtifactFileMeta = {
  /** Full path of the written file (also used as the artifact title). */
  path: string;
  /** MIME type of the file (used for download and preview decisions). */
  mimeType: string;
  /** Fence language the content was encoded with (html/xml/md/text). */
  language?: string;
};

export type PersonaArtifactRecord = {
  id: string;
  artifactType: PersonaArtifactKind;
  title?: string;
  status: "streaming" | "complete";
  markdown?: string;
  component?: string;
  props?: Record<string, unknown>;
  /** Present when this markdown artifact is a previewable file (see PersonaArtifactFileMeta). */
  file?: PersonaArtifactFileMeta;
};

/** Programmatic artifact upsert (controller / window API) */
export type PersonaArtifactManualUpsert =
  | {
      id?: string;
      artifactType: "markdown";
      title?: string;
      content: string;
      /** Optional file metadata for previewable file artifacts. */
      file?: PersonaArtifactFileMeta;
      /** Set false to update the registry/pane without a transcript block (pre-4.x behavior). */
      transcript?: boolean;
    }
  | {
      id?: string;
      artifactType: "component";
      title?: string;
      component: string;
      props?: Record<string, unknown>;
      /** Set false to update the registry/pane without a transcript block (pre-4.x behavior). */
      transcript?: boolean;
    };

export type AgentWidgetEvent =
  | { type: "message"; message: AgentWidgetMessage }
  | {
      type: "status";
      status: "connecting" | "connected" | "error" | "idle";
      /**
       * Set on the `idle` emitted from a graceful execution terminal
       * (`execution_complete`). Distinguishes a real finish from the plain
       * `idle` the dispatch wrappers emit in their `finally` on a dropped
       * connection. The durable-reconnect drop detection keys off this.
       */
      terminal?: boolean;
    }
  | { type: "error"; error: Error }
  /**
   * Durable-session reconnect cursor. Carries the SSE `id:` line (the durable
   * row seq) of a fully-parsed frame so the session can track `lastEventId`
   * and resume from `?after=<id>` after a drop. Only emitted on the durable
   * lane (any resumable execution that stamps `id:` lines, e.g. Claude Managed
   * agents or async/background runs).
   */
  | { type: "cursor"; id: string }
  | {
      type: "artifact_start";
      id: string;
      artifactType: PersonaArtifactKind;
      title?: string;
      component?: string;
      /** Present when this markdown artifact is a previewable file. */
      file?: PersonaArtifactFileMeta;
    }
  | { type: "artifact_delta"; id: string; artDelta: string }
  | {
      type: "artifact_update";
      id: string;
      props: Record<string, unknown>;
      component?: string;
    }
  | { type: "artifact_complete"; id: string };

export type AgentWidgetInitOptions = {
  target: string | HTMLElement;
  config?: AgentWidgetConfig;
  useShadowDom?: boolean;
  /** Fired when the widget controller is mounted and its API is callable. */
  onChatReady?: () => void;
  windowKey?: string; // If provided, stores the controller on window[windowKey] for global access
  debugTools?: boolean;
};
