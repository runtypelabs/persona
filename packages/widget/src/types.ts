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
};

export type AgentWidgetActionContext = {
  message: AgentWidgetMessage;
  metadata: Record<string, unknown>;
  updateMetadata: (
    updater: (prev: Record<string, unknown>) => Record<string, unknown>
  ) => void;
  document: Document | null;
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
  "assistant:message": AgentWidgetMessage;
  "assistant:complete": AgentWidgetMessage;
  "voice:state": AgentWidgetVoiceStateEvent;
  "action:detected": AgentWidgetActionEventPayload;
  "widget:opened": AgentWidgetStateEvent;
  "widget:closed": AgentWidgetStateEvent;
  "widget:state": AgentWidgetStateSnapshot;
  "message:feedback": AgentWidgetMessageFeedback;
  "message:copy": AgentWidgetMessage;
};

export type AgentWidgetFeatureFlags = {
  showReasoning?: boolean;
  showToolCalls?: boolean;
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
  autoResume?: boolean | "assistant";
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
  session_id: string;
  expires_at: string;
  flow: {
    id: string;
    name: string;
    description: string | null;
  };
  config: {
    welcome_message: string | null;
    placeholder: string;
    theme: Record<string, unknown> | null;
  };
};

/**
 * Request payload for /v1/client/chat endpoint
 */
export type ClientChatRequest = {
  session_id: string;
  messages: Array<{
    id?: string;
    role: 'user' | 'assistant' | 'system';
    content: MessageContent;
  }>;
  /** ID for the expected assistant response message */
  assistant_message_id?: string;
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
  session_id: string;
  /** Required for upvote, downvote, copy feedback types */
  message_id?: string;
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

export type AgentWidgetConfig = {
  apiUrl?: string;
  flowId?: string;
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
  toolCall?: AgentWidgetToolCallConfig;
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
   *     if (data.type === 'step_chunk' && data.chunk) {
   *       return { text: data.chunk };
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

export type AgentWidgetMessageVariant = "assistant" | "reasoning" | "tool";

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
  viaVoice?: boolean;
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
