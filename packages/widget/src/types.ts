import type { AgentWidgetPlugin } from "./plugins/types";
import type { DeepPartial, PersonaTheme } from "./types/theme";

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
  data: string; // base64 data URI
  mimeType: string;
  filename: string;
};

/**
 * Union type for all content part types
 */
export type ContentPart = TextContentPart | ImageContentPart | FileContentPart;

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

export type AgentWidgetRequestPayloadMessage = {
  role: AgentWidgetMessageRole;
  content: MessageContent;
  createdAt: string;
};

export type AgentWidgetRequestPayload = {
  messages: AgentWidgetRequestPayloadMessage[];
  flowId?: string;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  /** Per-turn template variables for /v1/client/chat (merged as root-level {{var}} in Runtype). */
  inputs?: Record<string, unknown>;
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
  /** Tool approval configuration for human-in-the-loop workflows */
  approval?: {
    /** Tool names/patterns to require approval for, or true for all tools */
    require: string[] | boolean;
    /** Approval timeout in milliseconds (default: 300000 / 5 minutes) */
    timeout?: number;
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
  /** Persona artifacts — sibling of tools (virtual agent / API parity) */
  artifacts?: ArtifactConfigPayload;
  /** Loop configuration for multi-turn execution */
  loopConfig?: AgentLoopConfig;
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
  agent: AgentConfig;
  messages: AgentWidgetRequestPayloadMessage[];
  options: AgentRequestOptions;
  context?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
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
 * Metadata attached to messages created during agent execution.
 */
export type AgentMessageMetadata = {
  executionId?: string;
  iteration?: number;
  turnId?: string;
  agentName?: string;
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

export type AgentWidgetActionEventPayload = {
  action: AgentWidgetParsedAction;
  message: AgentWidgetMessage;
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
  "action:detected": AgentWidgetActionEventPayload;
  "action:resubmit": AgentWidgetActionEventPayload;
  "widget:opened": AgentWidgetStateEvent;
  "widget:closed": AgentWidgetStateEvent;
  "widget:state": AgentWidgetStateSnapshot;
  "message:feedback": AgentWidgetMessageFeedback;
  "message:copy": AgentWidgetMessage;
  "eventStream:opened": { timestamp: number };
  "eventStream:closed": { timestamp: number };
  "approval:requested": { approval: AgentWidgetApproval; message: AgentWidgetMessage };
  "approval:resolved": { approval: AgentWidgetApproval; decision: string };
};

/**
 * Layout for the artifact split / drawer (CSS lengths unless noted).
 *
 * **Close behavior:** In desktop split mode, the artifact chrome `Close` control uses the same
 * dismiss path as the mobile drawer (`onDismiss` on the artifact pane): the pane is hidden until
 * new artifact content arrives or the host calls `showArtifacts()` on the widget handle.
 */
export type AgentWidgetArtifactsLayoutConfig = {
  /** Flex gap between chat column and artifact pane. @default 0.5rem */
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
   * Visual treatment for the artifact column in split mode.
   * - `'panel'` — bordered sidebar with left border, gap, and shadow (default).
   * - `'seamless'` — flush with chat: no border or shadow, container background, zero gap.
   * @default 'panel'
   */
  paneAppearance?: "panel" | "seamless";
  /** Border radius on the artifact pane (CSS length). Works with any `paneAppearance`. */
  paneBorderRadius?: string;
  /** CSS `box-shadow` on the artifact pane. Set `"none"` to suppress the default shadow. */
  paneShadow?: string;
  /**
   * Full `border` shorthand for the artifact `<aside>` (all sides). Overrides default pane borders.
   * Example: `"1px solid #cccccc"`.
   */
  paneBorder?: string;
  /**
   * `border-left` shorthand only — typical for split view next to chat (with or without resizer).
   * Ignored if `paneBorder` is set. Example: `"1px solid #cccccc"`.
   */
  paneBorderLeft?: string;
  /**
   * Desktop split only (not narrow-host drawer / not ≤640px): square the **main chat card’s**
   * top-right and bottom-right radii, and round the **artifact pane’s** top-right and bottom-right
   * to match `persona-rounded-2xl` (`--persona-radius-lg`) so the two columns read as one shell.
   */
  unifiedSplitChrome?: boolean;
  /**
   * When `unifiedSplitChrome` is true, outer-right corner radius on the artifact column (CSS length).
   * @default matches theme large radius (`--persona-radius-lg`)
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
   * - `default` — "Artifacts" title, horizontal tabs, text close.
   * - `document` — view/source toggle, document title, copy / refresh / close; tab strip hidden when only one artifact.
   * @default 'default'
   */
  toolbarPreset?: "default" | "document";
  /**
   * When `toolbarPreset` is `document`, show a visible "Copy" label next to the copy icon.
   */
  documentToolbarShowCopyLabel?: boolean;
  /**
   * When `toolbarPreset` is `document`, show a small chevron after the copy control (e.g. menu affordance).
   */
  documentToolbarShowCopyChevron?: boolean;
  /** Document toolbar icon buttons (view, code, copy, refresh, close) — CSS color. Sets `--persona-artifact-doc-toolbar-icon-color` on the widget root. */
  documentToolbarIconColor?: string;
  /** Active view/source toggle background. Sets `--persona-artifact-doc-toggle-active-bg`. */
  documentToolbarToggleActiveBackground?: string;
  /** Active view/source toggle border color. Sets `--persona-artifact-doc-toggle-active-border`. */
  documentToolbarToggleActiveBorderColor?: string;
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

export type AgentWidgetArtifactsFeature = {
  /** When true, Persona shows the artifact pane and handles artifact_* SSE events */
  enabled?: boolean;
  /** If set, artifact events for other types are ignored */
  allowedTypes?: PersonaArtifactKind[];
  /** Split / drawer dimensions and launcher widen behavior */
  layout?: AgentWidgetArtifactsLayoutConfig;
  /**
   * Called when an artifact card action is triggered (open, download).
   * Return `true` to prevent the default behavior.
   */
  onArtifactAction?: (action: {
    type: 'open' | 'download';
    artifactId: string;
  }) => boolean | void;
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
   * When false, tool call bubbles show only the collapsed summary with no
   * expand/collapse toggle. Users see tool awareness without full details.
   * @default true
   */
  expandable?: boolean;
  /**
   * Animation mode applied to the tool call header text while the tool is active.
   * - "none" — static text, no animation
   * - "pulse" — opacity pulse on the entire header text
   * - "shimmer" — monochrome opacity sweep per character
   * - "shimmer-color" — color gradient sweep per character
   * - "rainbow" — rainbow color cycle per character
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
};

export type AgentWidgetFeatureFlags = {
  showReasoning?: boolean;
  showToolCalls?: boolean;
  showEventStreamToggle?: boolean;
  /** Shared transcript + event stream scroll-to-bottom affordance. */
  scrollToBottom?: AgentWidgetScrollToBottomFeature;
  /** Collapsed transcript behavior for tool call rows. */
  toolCallDisplay?: AgentWidgetToolCallDisplayFeature;
  /** Collapsed transcript behavior for reasoning rows. */
  reasoningDisplay?: AgentWidgetReasoningDisplayFeature;
  /** Configuration for the Event Stream inspector view */
  eventStream?: EventStreamConfig;
  /** Optional artifact sidebar (split pane / mobile drawer) */
  artifacts?: AgentWidgetArtifactsFeature;
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
  position?: "bottom-right" | "bottom-left" | "top-right" | "top-left";
  /**
   * Controls how the launcher panel is mounted relative to the host page.
   * - "floating": default floating launcher / panel behavior
   * - "docked": wraps the target container and renders as a sibling dock
   *
   * @default "floating"
   */
  mountMode?: "floating" | "docked";
  /**
   * Layout configuration for docked mode.
   */
  dock?: AgentWidgetDockConfig;
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
};

export type AgentWidgetVoiceRecognitionConfig = {
  enabled?: boolean;
  pauseDuration?: number;
  /** Text shown in the user message placeholder while voice is being processed. Default: "🎤 Processing voice..." */
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
  
  // Voice provider configuration
  provider?: {
    type: 'browser' | 'runtype' | 'custom';
    browser?: {
      language?: string;
      continuous?: boolean;
    };
    runtype?: {
      agentId: string;
      clientToken: string;
      host?: string;
      voiceId?: string;
      /** Duration of silence (ms) before auto-stopping recording. Default: 2000 */
      pauseDuration?: number;
      /** RMS volume threshold below which counts as silence. Default: 0.01 */
      silenceThreshold?: number;
    };
    custom?: any;
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
   * - `'browser'` — Use the Web Speech API for all assistant messages (default).
   * - `'runtype'` — Server handles TTS for voice interactions.
   *   Set `browserFallback: true` to also speak text-typed responses via the browser.
   */
  provider?: 'browser' | 'runtype';
  /**
   * When `provider` is `'runtype'`, fall back to browser TTS for assistant
   * messages that the server didn't already speak (e.g. text-typed messages).
   * Has no effect when provider is `'browser'` (browser TTS is always used).
   * @default false
   */
  browserFallback?: boolean;
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
};

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
    clientToken: string;
    host?: string;
    voiceId?: string;
    /** Duration of silence (ms) before auto-stopping recording. Default: 2000 */
    pauseDuration?: number;
    /** RMS volume threshold below which counts as silence. Default: 0.01 */
    silenceThreshold?: number;
  };
  custom?: any;
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

  /** Returns the current interruption mode (only meaningful for Runtype provider) */
  getInterruptionMode?(): "none" | "cancel" | "barge-in";

  /** Returns true if the barge-in mic stream is alive (hot mic between turns) */
  isBargeInActive?(): boolean;

  /** Tear down the barge-in mic pipeline — "hang up" the always-on mic */
  deactivateBargeIn?(): Promise<void>;

  /** Stop playback / cancel in-flight request without starting recording */
  stopPlayback?(): void;
}

/**
 * Configuration for tool approval bubbles.
 * Controls styling, labels, and behavior of the approval UI.
 */
export type AgentWidgetApprovalConfig = {
  /** Background color of the approval bubble */
  backgroundColor?: string;
  /** Border color of the approval bubble */
  borderColor?: string;
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
   * Custom handler for approval decisions.
   * Return void to let the SDK auto-resolve via the API,
   * or return a Response/ReadableStream for custom handling.
   */
  onDecision?: (
    data: { approvalId: string; executionId: string; agentId: string; toolName: string },
    decision: 'approved' | 'denied'
  ) => Promise<Response | ReadableStream<Uint8Array> | void>;
};

export type AgentWidgetToolCallConfig = {
  /** Box-shadow for tool-call bubbles; overrides `theme.toolBubbleShadow` when set. */
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
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**` — parsed at render time and
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
   * **Inline formatting:** `~dim~`, `*italic*`, `**bold**` — same syntax as `activeTextTemplate`.
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
  /** Text segment identity — when this changes, a new assistant message bubble is created */
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
};

/**
 * Feedback types supported by the API
 */
export type ClientFeedbackType = 'upvote' | 'downvote' | 'copy' | 'csat' | 'nps';

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
   * Agent configuration for agent execution mode.
   * When provided, the widget uses agent loop execution instead of flow dispatch.
   * Mutually exclusive with `flowId`.
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
    /**
     * When false, the welcome / intro card is not shown above the message list.
     * @default true
     */
    showWelcomeCard?: boolean;
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
  postprocessMessage?: (context: {
    text: string;
    message: AgentWidgetMessage;
    streaming: boolean;
    raw?: string;
  }) => string;
  plugins?: AgentWidgetPlugin[];
  contextProviders?: AgentWidgetContextProvider[];
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
   * open after initialization — useful when injecting a post-navigation message
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
  parameters?: unknown;
  resolvedAt?: number;
};

export type AgentWidgetMessageVariant = "assistant" | "reasoning" | "tool" | "approval";

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

export type PersonaArtifactRecord = {
  id: string;
  artifactType: PersonaArtifactKind;
  title?: string;
  status: "streaming" | "complete";
  markdown?: string;
  component?: string;
  props?: Record<string, unknown>;
};

/** Programmatic artifact upsert (controller / window API) */
export type PersonaArtifactManualUpsert =
  | { id?: string; artifactType: "markdown"; title?: string; content: string }
  | {
      id?: string;
      artifactType: "component";
      title?: string;
      component: string;
      props?: Record<string, unknown>;
    };

export type AgentWidgetEvent =
  | { type: "message"; message: AgentWidgetMessage }
  | { type: "status"; status: "connecting" | "connected" | "error" | "idle" }
  | { type: "error"; error: Error }
  | {
      type: "artifact_start";
      id: string;
      artifactType: PersonaArtifactKind;
      title?: string;
      component?: string;
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
  onReady?: () => void;
  windowKey?: string; // If provided, stores the controller on window[windowKey] for global access
  debugTools?: boolean;
};
