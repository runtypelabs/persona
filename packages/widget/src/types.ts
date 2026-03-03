import type { AgentWidgetPlugin } from "./plugins/types";

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
};

// ============================================================================
// Agent Execution Types
// ============================================================================

/**
 * Configuration for agent loop behavior.
 */
export type AgentLoopConfig = {
  /** Maximum number of reasoning iterations */
  maxIterations: number;
  /** Stop condition: 'auto' for automatic detection, or a custom JS expression */
  stopCondition?: 'auto' | string;
  /** Enable periodic reflection during execution */
  enableReflection?: boolean;
  /** Number of iterations between reflections */
  reflectionInterval?: number;
};

/**
 * Agent configuration for agent execution mode.
 * When provided in the widget config, enables agent loop execution instead of flow dispatch.
 */
export type AgentConfig = {
  /** Agent display name */
  name: string;
  /** Model identifier (e.g., 'openai:gpt-4o-mini') */
  model: string;
  /** System prompt for the agent */
  systemPrompt: string;
  /** Temperature for model responses */
  temperature?: number;
  /** Loop configuration for multi-iteration execution */
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
  maxIterations: number;
  startedAt?: number;
  completedAt?: number;
  stopReason?: 'max_iterations' | 'complete' | 'error' | 'manual';
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

export type AgentWidgetFeatureFlags = {
  showReasoning?: boolean;
  showToolCalls?: boolean;
  showEventStreamToggle?: boolean;
  /** Configuration for the Event Stream inspector view */
  eventStream?: EventStreamConfig;
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

export type AgentWidgetTheme = {
  primary?: string;
  secondary?: string;
  surface?: string;
  muted?: string;
  accent?: string;
  container?: string;
  border?: string;
  divider?: string;
  messageBorder?: string;
  inputBackground?: string;
  callToAction?: string;
  callToActionBackground?: string;
  sendButtonBackgroundColor?: string;
  sendButtonTextColor?: string;
  sendButtonBorderColor?: string;
  closeButtonColor?: string;
  closeButtonBackgroundColor?: string;
  closeButtonBorderColor?: string;
  clearChatIconColor?: string;
  clearChatBackgroundColor?: string;
  clearChatBorderColor?: string;
  tooltipBackground?: string;
  tooltipForeground?: string;
  micIconColor?: string;
  micBackgroundColor?: string;
  micBorderColor?: string;
  recordingIconColor?: string;
  recordingBackgroundColor?: string;
  recordingBorderColor?: string;
  inputFontFamily?: "sans-serif" | "serif" | "mono";
  inputFontWeight?: string;
  radiusSm?: string;
  radiusMd?: string;
  radiusLg?: string;
  launcherRadius?: string;
  buttonRadius?: string;
  /**
   * Border style for the chat panel container.
   * @example "1px solid #e5e7eb" | "none"
   * @default "1px solid var(--tvw-cw-border)"
   */
  panelBorder?: string;
  /**
   * Box shadow for the chat panel container.
   * @example "0 25px 50px -12px rgba(0,0,0,0.25)" | "none"
   * @default "0 25px 50px -12px rgba(0,0,0,0.25)"
   */
  panelShadow?: string;
  /**
   * Border radius for the chat panel container.
   * @example "16px" | "0"
   * @default "16px"
   */
  panelBorderRadius?: string;
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
  idleText?: string;
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
  backgroundColor?: string;
  borderColor?: string;
  borderWidth?: string;
  borderRadius?: string;
  headerBackgroundColor?: string;
  headerTextColor?: string;
  headerPaddingX?: string;
  headerPaddingY?: string;
  contentBackgroundColor?: string;
  contentTextColor?: string;
  contentPaddingX?: string;
  contentPaddingY?: string;
  codeBlockBackgroundColor?: string;
  codeBlockBorderColor?: string;
  codeBlockTextColor?: string;
  toggleTextColor?: string;
  labelTextColor?: string;
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

/**
 * Context provided to header render functions
 */
export type HeaderRenderContext = {
  config: AgentWidgetConfig;
  onClose?: () => void;
  onClearChat?: () => void;
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
   * Layout preset: "default" | "minimal" | "expanded"
   * - default: Standard layout with icon, title, subtitle, and buttons
   * - minimal: Simplified layout with just title and close button
   * - expanded: Full branding area with additional content space
   */
  layout?: "default" | "minimal" | "expanded";
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
   *     loopConfig: { maxIterations: 3, stopCondition: 'auto' }
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
  };
  theme?: AgentWidgetTheme;
  /**
   * Theme colors for dark mode. Applied when dark mode is detected
   * (when colorScheme is 'dark' or 'auto' with dark mode active).
   * If not provided, falls back to `theme` colors.
   * 
   * @example
   * ```typescript
   * config: {
   *   theme: { primary: '#111827', surface: '#ffffff' },
   *   darkTheme: { primary: '#f9fafb', surface: '#1f2937' },
   *   colorScheme: 'auto'
   * }
   * ```
   */
  darkTheme?: AgentWidgetTheme;
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
   * @example
   * ```typescript
   * config: {
   *   onStateLoaded: (state) => {
   *     // Check for pending navigation message
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
   */
  onStateLoaded?: (state: AgentWidgetStoredState) => AgentWidgetStoredState;
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

export type AgentWidgetEvent =
  | { type: "message"; message: AgentWidgetMessage }
  | { type: "status"; status: "connecting" | "connected" | "error" | "idle" }
  | { type: "error"; error: Error };

export type AgentWidgetInitOptions = {
  target: string | HTMLElement;
  config?: AgentWidgetConfig;
  useShadowDom?: boolean;
  onReady?: () => void;
  windowKey?: string; // If provided, stores the controller on window[windowKey] for global access
  debugTools?: boolean;
};
