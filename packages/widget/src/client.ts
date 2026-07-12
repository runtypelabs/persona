import {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetEvent,
  AgentWidgetStreamParser,
  AgentWidgetStreamParserResult,
  AgentWidgetContextProvider,
  AgentWidgetRequestMiddleware,
  AgentWidgetRequestPayload,
  AgentWidgetAgentRequestPayload,
  AgentWidgetCustomFetch,
  AgentWidgetSSEEventParser,
  AgentWidgetHeadersFunction,
  AgentWidgetSSEEventResult as _AgentWidgetSSEEventResult,
  AgentExecutionState,
  StopReasonKind,
  ClientSession,
  ClientInitResponse,
  ClientChatRequest,
  ClientToolDefinition,
  ClientFeedbackRequest,
  ClientFeedbackType,
  PersonaArtifactKind,
  ContentPart,
  WebMcpConfirmHandler
} from "./types";
import { WebMcpBridge, computeClientToolsFingerprint, isWebMcpToolName } from "./webmcp-bridge";
import { resolveTarget } from "./utils/target";
import { builtInClientToolsForDispatch } from "./ask-user-question-tool";
import {
  extractTextFromJson,
  createPlainTextParser,
  createJsonStreamParser,
  createRegexJsonParser,
  createXmlParser
} from "./utils/formatting";
import { VERSION } from "./version";
// artifactsSidebarEnabled is used in ui.ts to gate the sidebar pane rendering;
// artifact events are always processed here regardless of config.

type DispatchOptions = {
  messages: AgentWidgetMessage[];
  signal?: AbortSignal;
  /** Pre-generated ID for the expected assistant response (for feedback tracking) */
  assistantMessageId?: string;
};

type SSEHandler = (event: AgentWidgetEvent) => void;

const DEFAULT_ENDPOINT = "https://api.runtype.com/v1/dispatch";
const DEFAULT_CLIENT_API_BASE = "https://api.runtype.com";

/**
 * Derive a download filename for `agent_media` parts that are delivered
 * without one. Maps a few well-known MIME types to friendly extensions and
 * falls back to `attachment.<subtype>` (or just `attachment` for opaque
 * types like `application/octet-stream`).
 */
function filenameFromMediaType(mediaType: string): string {
  // MIME types are case-insensitive (RFC 7231); compare against a lowercased
  // copy so callers that pass mixed casing still hit the friendly extensions.
  const lower = mediaType.toLowerCase();
  const knownExtensions: Record<string, string> = {
    "application/pdf": "pdf",
    "application/json": "json",
    "application/zip": "zip",
    "text/plain": "txt",
    "text/csv": "csv",
    "text/markdown": "md"
  };
  const ext = knownExtensions[lower];
  if (ext) return `attachment.${ext}`;
  const slash = lower.indexOf("/");
  if (slash > 0) {
    const subtype = lower.slice(slash + 1).split(";")[0]?.trim() ?? "";
    if (subtype && subtype !== "octet-stream" && /^[a-z0-9.+-]+$/i.test(subtype)) {
      return `attachment.${subtype}`;
    }
  }
  return "attachment";
}

/**
 * Check if a message has valid (non-empty) content for sending to the API.
 * Filters out messages with empty content that would cause validation errors.
 *
 */
const hasValidContent = (message: AgentWidgetMessage): boolean => {
  // Check contentParts (multi-modal content)
  if (message.contentParts && message.contentParts.length > 0) {
    return true;
  }
  // Check llmContent (explicit LLM content)
  if (message.llmContent && message.llmContent.trim().length > 0) {
    return true;
  }
  // Check rawContent (structured parser output)
  if (message.rawContent && message.rawContent.trim().length > 0) {
    return true;
  }
  // Check content (display content)
  if (message.content && message.content.trim().length > 0) {
    return true;
  }
  return false;
};

/**
 * Maps parserType string to the corresponding parser factory function
 */
function getParserFromType(parserType?: "plain" | "json" | "regex-json" | "xml"): () => AgentWidgetStreamParser {
  switch (parserType) {
    case "json":
      return createJsonStreamParser;
    case "regex-json":
      return createRegexJsonParser;
    case "xml":
      return createXmlParser;
    case "plain":
    default:
      return createPlainTextParser;
  }
}

export type SSEEventCallback = (eventType: string, payload: unknown) => void;

const looksStructured = (value: string) =>
  value.startsWith("{") || value.startsWith("[") || value.startsWith("<");

/**
 * Choose the best content source for sealed-segment reconciliation.
 * Prefers the final structured payload from step_complete when the raw
 * buffer is only a partial/unparseable prefix of the same structured format.
 */
export function preferFinalStructuredContent(
  rawBuffer: string | undefined,
  finalString: string
): string {
  if (!rawBuffer) return finalString;

  const rawTrimmed = rawBuffer.trim();
  const finalTrimmed = finalString.trim();
  if (rawTrimmed.length === 0) return finalString;
  if (finalTrimmed.length === 0) return rawBuffer;

  const rawLooksStructured = looksStructured(rawTrimmed);
  const finalLooksStructured = looksStructured(finalTrimmed);

  if (!finalLooksStructured) return rawBuffer;
  if (!rawLooksStructured) return finalString;
  if (finalTrimmed === rawTrimmed) return finalString;
  if (finalTrimmed.startsWith(rawTrimmed)) return finalString;

  const rawJsonText = extractTextFromJson(rawBuffer);
  const finalJsonText = extractTextFromJson(finalString);
  if (finalJsonText !== null && rawJsonText === null) return finalString;

  return rawBuffer;
}

export class AgentWidgetClient {
  private readonly apiUrl: string;
  private readonly headers: Record<string, string>;
  private readonly debug: boolean;
  private readonly createStreamParser: () => AgentWidgetStreamParser;
  private readonly contextProviders: AgentWidgetContextProvider[];
  private readonly requestMiddleware?: AgentWidgetRequestMiddleware;
  private readonly customFetch?: AgentWidgetCustomFetch;
  private readonly parseSSEEvent?: AgentWidgetSSEEventParser;
  private readonly getHeaders?: AgentWidgetHeadersFunction;
  private onSSEEvent?: SSEEventCallback;
  
  // Client token mode properties
  private clientSession: ClientSession | null = null;
  private sessionInitPromise: Promise<ClientSession> | null = null;

  // Diff-only / send-once WebMCP tool dispatch (client-token mode ONLY).
  // Fingerprint of the clientTools[] last *sent in full* and confirmed by a
  // successful stream start; null => the next client-token turn sends the full
  // array. Paired with the sessionId it was sent under so a session change
  // (silent re-init / expiry) forces a fresh full send.
  private lastSentClientToolsFingerprint: string | null = null;
  private clientToolsFingerprintSessionId: string | null = null;
  // Session under which a non-empty clientTools[] was last committed and not
  // yet confirmed cleared server-side. Distinct from the fingerprint above:
  // an empty-tool chat turn commits a null fingerprint, but OMITTING the
  // fields on chat doesn't clear the tools persisted for a still-paused
  // execution — so a later resume with an empty registry must still send the
  // explicit `clientTools: []` replace. Reset only by an explicit [] replace,
  // a session change, or a conversation reset.
  private sentNonEmptyClientToolsSessionId: string | null = null;

  // WebMCP: page-discovered tool consumption (see ./webmcp-bridge).
  // Constructed lazily: null when `config.webmcp?.enabled !== true`.
  private readonly webMcpBridge: WebMcpBridge | null;

  constructor(private config: AgentWidgetConfig = {}) {
    if (config.target && (config.agentId || config.flowId || config.agent)) {
      throw new Error(
        "[Persona] `target` is mutually exclusive with `agentId`, `flowId`, and `agent`. Set only one routing field.",
      );
    }
    this.apiUrl = config.apiUrl ?? DEFAULT_ENDPOINT;
    this.headers = {
      "Content-Type": "application/json",
      "X-Persona-Version": VERSION,
      ...config.headers
    };
    this.debug = Boolean(config.debug);
    // Use custom stream parser if provided, otherwise use parserType, or fall back to plain text parser
    this.createStreamParser = config.streamParser ?? getParserFromType(config.parserType);
    this.contextProviders = config.contextProviders ?? [];
    this.requestMiddleware = config.requestMiddleware;
    this.customFetch = config.customFetch;
    this.parseSSEEvent = config.parseSSEEvent;
    this.getHeaders = config.getHeaders;
    this.webMcpBridge =
      config.webmcp?.enabled === true ? new WebMcpBridge(config.webmcp) : null;
  }

  /**
   * Refresh config in place WITHOUT tearing down the live connection or the
   * WebMCP bridge. `AgentWidgetSession.updateConfig` calls this when only
   * connection-irrelevant fields changed (theme, copy, layout, suggestions, …),
   * so a UI update that lands mid-turn: e.g. a `webmcp:*` tool restyling the
   * widget while the agent's turn is still streaming: doesn't abandon the
   * in-flight stream/resume. Connection or request-shaping changes (apiUrl,
   * clientToken, webmcp, headers, parser, …) take the full client rebuild path
   * in the session instead, which is the only place the bridge is recreated.
   *
   * Only the live-read `config` is refreshed (e.g. `iterationDisplay`); the
   * constructor-derived request-shaping fields (apiUrl, headers, parser,
   * contextProviders, middleware, …) are left untouched because the session
   * routes any change to those down the full-rebuild path instead, so they are
   * guaranteed unchanged here. The `webMcpBridge` instance and its
   * installed-polyfill memo are deliberately preserved, which keeps any
   * in-flight resolve alive.
   */
  public updateConfig(next: AgentWidgetConfig): void {
    this.config = next;
  }

  /**
   * Set callback for capturing raw SSE events
   */
  public setSSEEventCallback(callback: SSEEventCallback): void {
    this.onSSEEvent = callback;
  }

  /**
   * WebMCP: wire (or replace) the confirm-bubble handler. Called from
   * `ui.ts` once the widget panel is built and the approval-bubble
   * chrome is ready to render.
   */
  public setWebMcpConfirmHandler(handler: WebMcpConfirmHandler | null): void {
    this.webMcpBridge?.setConfirmHandler(handler);
  }

  /**
   * WebMCP: `true` when the bridge installed the polyfill and can both
   * snapshot the page registry and execute returned `webmcp:*` tool calls.
   * `false` for any guard miss (no `document.modelContext`, polyfill not yet
   * installed, or `config.webmcp.enabled` not set).
   */
  public isWebMcpOperational(): boolean {
    return this.webMcpBridge?.isOperational() === true;
  }

  /**
   * WebMCP: execute a returned `webmcp:<name>` tool call against the page's
   * registry and return the normalized MCP-shaped result for `/resume`. The
   * bridge handles confirm-bubble gating, the 30s timeout, error
   * normalization, and `signal`-driven abort: callers never see throws.
   *
   * Returns `null` when WebMCP is not enabled on this client (signal to the
   * session that it should fall back to the legacy local-tool resume path,
   * if any).
   */
  public executeWebMcpToolCall(
    wireToolName: string,
    args: unknown,
    signal?: AbortSignal,
  ): Promise<import("./types").WebMcpToolResult> | null {
    if (!this.webMcpBridge) return null;
    return this.webMcpBridge.executeToolCall(wireToolName, args, signal);
  }

  /**
   * Get the current SSE event callback (used to preserve across client recreation)
   */
  public getSSEEventCallback(): SSEEventCallback | undefined {
    return this.onSSEEvent;
  }

  /**
   * Check if running in client token mode
   */
  public isClientTokenMode(): boolean {
    return !!this.config.clientToken;
  }

  /**
   * Resolve the effective backend routing for the current config. Combines the
   * explicit `agentId`/`flowId` fields with the normalized `target` string
   * (resolved via `resolveTarget`). Computed on demand so it stays correct
   * across `update()`; the `target`/explicit-field conflict is rejected in the
   * constructor, so at most one source is set here.
   */
  private routing(): {
    agentId?: string;
    flowId?: string;
    targetPayload?: Record<string, unknown>;
  } {
    const { agentId, flowId, target, targetProviders } = this.config;
    if (!target) {
      return { agentId, flowId };
    }
    const resolved = resolveTarget(target, targetProviders);
    if (resolved.kind === "agentId") return { agentId: resolved.agentId };
    if (resolved.kind === "flowId") return { flowId: resolved.flowId };
    return { targetPayload: resolved.payload };
  }

  /**
   * Check if operating in agent execution mode
   */
  public isAgentMode(): boolean {
    return !!(this.config.agent || this.routing().agentId);
  }

  /**
   * Get the appropriate API URL based on mode
   */
  private getClientApiUrl(endpoint: 'init' | 'chat' | 'resume'): string {
    const baseUrl = this.config.apiUrl?.replace(/\/+$/, '').replace(/\/v1\/dispatch$/, '') || DEFAULT_CLIENT_API_BASE;
    return `${baseUrl}/v1/client/${endpoint}`;
  }

  /**
   * Get the current client session (if any)
   */
  public getClientSession(): ClientSession | null {
    return this.clientSession;
  }

  /**
   * Initialize session for client token mode.
   * Called automatically on first message if not already initialized.
   */
  public async initSession(): Promise<ClientSession> {
    if (!this.isClientTokenMode()) {
      throw new Error('initSession() only available in client token mode');
    }

    // Return existing session if valid
    if (this.clientSession && new Date() < this.clientSession.expiresAt) {
      return this.clientSession;
    }

    // Deduplicate concurrent init calls
    if (this.sessionInitPromise) {
      return this.sessionInitPromise;
    }

    this.sessionInitPromise = this._doInitSession();
    try {
      const session = await this.sessionInitPromise;
      this.clientSession = session;
      // A freshly-minted session must resend the full WebMCP tool list on its
      // next turn: drop any diff-only fingerprint cached under a prior session,
      // so we never claim "unchanged" against a session the server didn't store
      // the set under. (Belt-and-suspenders with the sessionId comparison in the
      // send decision and the server's 409 resend signal.)
      this.resetClientToolsFingerprint();
      this.config.onSessionInit?.(session);
      return session;
    } finally {
      this.sessionInitPromise = null;
    }
  }

  private async _doInitSession(): Promise<ClientSession> {
    // Get stored session_id if available (for session resumption)
    const storedSessionId = this.config.getStoredSessionId?.() || null;
    
    const routed = this.routing();
    const sessionTargetId = routed.agentId ?? routed.flowId;
    const requestBody: Record<string, unknown> = {
      token: this.config.clientToken,
      ...(sessionTargetId && { flowId: sessionTargetId }),
      ...(storedSessionId && { sessionId: storedSessionId }),
    };

    const response = await fetch(this.getClientApiUrl('init'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Persona-Version': VERSION,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Session initialization failed' }));
      if (response.status === 401) {
        throw new Error(`Invalid client token: ${error.hint || error.error}`);
      }
      if (response.status === 403) {
        throw new Error(`Origin not allowed: ${error.hint || error.error}`);
      }
      throw new Error(error.error || 'Failed to initialize session');
    }

    const data: ClientInitResponse = await response.json();

    // Store the new sessionId for future resumption
    if (this.config.setStoredSessionId) {
      this.config.setStoredSessionId(data.sessionId);
    }

    return {
      sessionId: data.sessionId,
      expiresAt: new Date(data.expiresAt),
      flow: data.flow,
      config: {
        welcomeMessage: data.config.welcomeMessage,
        placeholder: data.config.placeholder,
        theme: data.config.theme,
      },
    };
  }

  /**
   * Clear the current client session
   */
  public clearClientSession(): void {
    this.clientSession = null;
    this.sessionInitPromise = null;
    this.resetClientToolsFingerprint();
  }

  /**
   * Forget the diff-only WebMCP tool fingerprint so the next client-token turn
   * resends the full `clientTools[]`. Called when the session is cleared and
   * when the conversation is reset (`WidgetSession.clearMessages`).
   */
  public resetClientToolsFingerprint(): void {
    this.lastSentClientToolsFingerprint = null;
    this.clientToolsFingerprintSessionId = null;
    this.sentNonEmptyClientToolsSessionId = null;
  }

  /**
   * Get the feedback API URL
   */
  private getFeedbackApiUrl(): string {
    const baseUrl = this.config.apiUrl?.replace(/\/+$/, '').replace(/\/v1\/dispatch$/, '') || DEFAULT_CLIENT_API_BASE;
    return `${baseUrl}/v1/client/feedback`;
  }

  /**
   * Send feedback for a message (client token mode only).
   * Supports upvote, downvote, copy, csat, and nps feedback types.
   * 
   * @param feedback - The feedback request payload
   * @returns Promise that resolves when feedback is sent successfully
   * @throws Error if not in client token mode or if session is invalid
   * 
   * @example
   * ```typescript
   * // Message feedback (upvote/downvote/copy)
   * await client.sendFeedback({
   *   sessionId: sessionId,
   *   messageId: messageId,
   *   type: 'upvote'
   * });
   *
   * // CSAT feedback (1-5 rating)
   * await client.sendFeedback({
   *   sessionId: sessionId,
   *   type: 'csat',
   *   rating: 5,
   *   comment: 'Great experience!'
   * });
   *
   * // NPS feedback (0-10 rating)
   * await client.sendFeedback({
   *   sessionId: sessionId,
   *   type: 'nps',
   *   rating: 9
   * });
   * ```
   */
  public async sendFeedback(feedback: ClientFeedbackRequest): Promise<void> {
    if (!this.isClientTokenMode()) {
      throw new Error('sendFeedback() only available in client token mode');
    }

    const session = this.getClientSession();
    if (!session) {
      throw new Error('No active session. Please initialize session first.');
    }

    // Validate messageId is provided for message-level feedback types
    const messageFeedbackTypes: ClientFeedbackType[] = ['upvote', 'downvote', 'copy'];
    if (messageFeedbackTypes.includes(feedback.type) && !feedback.messageId) {
      throw new Error(`messageId is required for ${feedback.type} feedback type`);
    }

    // Validate rating is provided for csat/nps feedback types
    if (feedback.type === 'csat') {
      if (feedback.rating === undefined || feedback.rating < 1 || feedback.rating > 5) {
        throw new Error('CSAT rating must be between 1 and 5');
      }
    }
    if (feedback.type === 'nps') {
      if (feedback.rating === undefined || feedback.rating < 0 || feedback.rating > 10) {
        throw new Error('NPS rating must be between 0 and 10');
      }
    }

    if (this.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] sending feedback", feedback);
    }

    // Scope the feedback request to the caller's client token, sourced the same
    // way as the chat/init requests. sendFeedback is client-token-mode only
    // (guarded above), so clientToken is always present here and an API key can
    // never leak into the body. Left undefined only when the embed has none.
    const requestBody = {
      ...feedback,
      ...(this.config.clientToken && { token: this.config.clientToken }),
    };

    const response = await fetch(this.getFeedbackApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Persona-Version': VERSION,
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Feedback submission failed' }));
      
      if (response.status === 401) {
        this.clientSession = null;
        this.config.onSessionExpired?.();
        throw new Error('Session expired. Please refresh to continue.');
      }
      
      throw new Error(errorData.error || 'Failed to submit feedback');
    }
  }

  /**
   * Submit message feedback (upvote, downvote, or copy).
   * Convenience method for sendFeedback with message-level feedback.
   * 
   * @param messageId - The ID of the message to provide feedback for
   * @param type - The feedback type: 'upvote', 'downvote', or 'copy'
   */
  public async submitMessageFeedback(
    messageId: string, 
    type: 'upvote' | 'downvote' | 'copy'
  ): Promise<void> {
    const session = this.getClientSession();
    if (!session) {
      throw new Error('No active session. Please initialize session first.');
    }

    return this.sendFeedback({
      sessionId: session.sessionId,
      messageId: messageId,
      type,
    });
  }

  /**
   * Submit CSAT (Customer Satisfaction) feedback.
   * Convenience method for sendFeedback with CSAT feedback.
   *
   * @param rating - Rating from 1 to 5
   * @param comment - Optional comment
   */
  public async submitCSATFeedback(rating: number, comment?: string): Promise<void> {
    const session = this.getClientSession();
    if (!session) {
      throw new Error('No active session. Please initialize session first.');
    }

    return this.sendFeedback({
      sessionId: session.sessionId,
      type: 'csat',
      rating,
      comment,
    });
  }

  /**
   * Submit NPS (Net Promoter Score) feedback.
   * Convenience method for sendFeedback with NPS feedback.
   *
   * @param rating - Rating from 0 to 10
   * @param comment - Optional comment
   */
  public async submitNPSFeedback(rating: number, comment?: string): Promise<void> {
    const session = this.getClientSession();
    if (!session) {
      throw new Error('No active session. Please initialize session first.');
    }

    return this.sendFeedback({
      sessionId: session.sessionId,
      type: 'nps',
      rating,
      comment,
    });
  }

  /**
   * Send a message - handles both proxy and client token modes
   */
  public async dispatch(options: DispatchOptions, onEvent: SSEHandler) {
    options.signal?.throwIfAborted();
    if (this.isClientTokenMode()) {
      return this.dispatchClientToken(options, onEvent);
    }
    if (this.isAgentMode()) {
      return this.dispatchAgent(options, onEvent);
    }
    return this.dispatchProxy(options, onEvent);
  }

  /**
   * Client token mode dispatch
   */
  private async dispatchClientToken(options: DispatchOptions, onEvent: SSEHandler) {
    onEvent({ type: "status", status: "connecting" });

    try {
      // Ensure session is initialized
      const session = await this.initSession();

      // Check if session is about to expire (within 1 minute)
      if (new Date() >= new Date(session.expiresAt.getTime() - 60000)) {
        // Session expired or expiring soon
        this.clearClientSession();
        this.config.onSessionExpired?.();
        const error = new Error('Session expired. Please refresh to continue.');
        onEvent({ type: "error", error });
        throw error;
      }

      // Build the standard payload to get context/metadata from middleware
      const basePayload = await this.buildPayload(options.messages);

      // Build the chat request payload with message IDs for feedback tracking
      // Filter out sessionId from metadata if present (it's only for local storage)
      const sanitizedMetadata = basePayload.metadata
        ? Object.fromEntries(
            Object.entries(basePayload.metadata).filter(([key]) => key !== 'sessionId' && key !== 'session_id')
          )
        : undefined;
      
      // Common (tools-independent) fields for the chat request.
      const baseChatRequest: Omit<ClientChatRequest, 'clientTools' | 'clientToolsFingerprint'> = {
        sessionId: session.sessionId,
        // Filter out messages with empty content to prevent validation errors
        messages: options.messages.filter(hasValidContent).map(m => ({
          id: m.id, // Include message ID for tracking
          role: m.role,
          // Priority: contentParts (multi-modal) > llmContent (explicit LLM content) > rawContent (structured parsers) > content (display)
          content: m.contentParts ?? m.llmContent ?? m.rawContent ?? m.content,
        })),
        // Include pre-generated assistant message ID if provided
        ...(options.assistantMessageId && { assistantMessageId: options.assistantMessageId }),
        // Include metadata/context from middleware if present (excluding sessionId)
        ...(sanitizedMetadata && Object.keys(sanitizedMetadata).length > 0 && { metadata: sanitizedMetadata }),
        ...(basePayload.inputs && Object.keys(basePayload.inputs).length > 0 && { inputs: basePayload.inputs }),
        ...(basePayload.context && { context: basePayload.context }),
      };

      // Diff-only / send-once WebMCP tool dispatch. `buildPayload()` already
      // snapshotted the full set; `sendWithClientToolsDiff` decides whether to
      // ship it again or just its fingerprint (retrying once on a 409 registry
      // miss). The cache is committed only after a successful stream start
      // (below), so a 409/failure leaves it untouched.
      const { response, commit: commitClientToolsFingerprint } =
        await this.sendWithClientToolsDiff(session.sessionId, basePayload.clientTools, (toolFields) => {
          const chatRequest: ClientChatRequest = { ...baseChatRequest, ...toolFields };

          if (this.debug) {
            // eslint-disable-next-line no-console
            console.debug("[AgentWidgetClient] client token dispatch", chatRequest);
          }

          return fetch(this.getClientApiUrl('chat'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Persona-Version': VERSION,
            },
            body: JSON.stringify(chatRequest),
            signal: options.signal,
          });
        });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Chat request failed' }));

        if (response.status === 401) {
          // Session expired
          this.clearClientSession();
          this.config.onSessionExpired?.();
          const error = new Error('Session expired. Please refresh to continue.');
          onEvent({ type: "error", error });
          throw error;
        }

        if (response.status === 429) {
          const error = new Error(data.hint || 'Message limit reached for this session.');
          onEvent({ type: "error", error });
          throw error;
        }

        const error = new Error(data.error || 'Failed to send message');
        onEvent({ type: "error", error });
        throw error;
      }

      if (!response.body) {
        const error = new Error('No response body received');
        onEvent({ type: "error", error });
        throw error;
      }

      // Stream is good: the server now holds this tool set under this
      // fingerprint for the session. Commit the cache so unchanged follow-up
      // turns can send fingerprint-only.
      commitClientToolsFingerprint();

      onEvent({ type: "status", status: "connected" });
      
      // Stream the response (same SSE handling as proxy mode)
      try {
        await this.streamResponse(response.body, onEvent, options.assistantMessageId);
      } finally {
        onEvent({ type: "status", status: "idle" });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Only emit error if it wasn't already emitted
      if (!err.message.includes('Session expired') && !err.message.includes('Message limit')) {
        onEvent({ type: "error", error: err });
      }
      throw err;
    }
  }

  /**
   * Proxy mode dispatch (original implementation)
   */
  private async dispatchProxy(options: DispatchOptions, onEvent: SSEHandler) {
    onEvent({ type: "status", status: "connecting" });

    const payload = await this.buildPayload(options.messages);

    if (this.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] dispatch payload", payload);
    }

    // Build headers - merge static headers with dynamic headers if provided
    let headers = { ...this.headers };
    if (this.getHeaders) {
      try {
        const dynamicHeaders = await this.getHeaders();
        headers = { ...headers, ...dynamicHeaders };
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] getHeaders error:", error);
        }
      }
    }

    // Use customFetch if provided, otherwise use default fetch
    let response: Response;
    if (this.customFetch) {
      try {
        response = await this.customFetch(
          this.apiUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: options.signal
          },
          payload
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onEvent({ type: "error", error: err });
        throw err;
      }
    } else {
      response = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: options.signal
      });
    }

    if (!response.ok || !response.body) {
      const error = new Error(
        `Chat backend request failed: ${response.status} ${response.statusText}`
      );
      onEvent({ type: "error", error });
      throw error;
    }

    onEvent({ type: "status", status: "connected" });
    try {
      await this.streamResponse(response.body, onEvent);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  /**
   * Agent mode dispatch
   */
  private async dispatchAgent(options: DispatchOptions, onEvent: SSEHandler) {
    onEvent({ type: "status", status: "connecting" });

    const payload = await this.buildAgentPayload(options.messages);

    if (this.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] agent dispatch payload", payload);
    }

    // Build headers - merge static headers with dynamic headers if provided
    let headers = { ...this.headers };
    if (this.getHeaders) {
      try {
        const dynamicHeaders = await this.getHeaders();
        headers = { ...headers, ...dynamicHeaders };
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] getHeaders error:", error);
        }
      }
    }

    // Use customFetch if provided, otherwise use default fetch
    let response: Response;
    if (this.customFetch) {
      try {
        response = await this.customFetch(
          this.apiUrl,
          {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
            signal: options.signal
          },
          payload as unknown as AgentWidgetRequestPayload
        );
      } catch (error) {
        const err = error instanceof Error ? error : new Error(String(error));
        onEvent({ type: "error", error: err });
        throw err;
      }
    } else {
      response = await fetch(this.apiUrl, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
        signal: options.signal
      });
    }

    if (!response.ok || !response.body) {
      const error = new Error(
        `Agent execution request failed: ${response.status} ${response.statusText}`
      );
      onEvent({ type: "error", error });
      throw error;
    }

    onEvent({ type: "status", status: "connected" });
    try {
      await this.streamResponse(response.body, onEvent, options.assistantMessageId);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  /**
   * Process an external SSE stream through the SDK's event pipeline.
   * This allows piping responses from endpoints like agent approval
   * through the same message/tool/reasoning handling as dispatch().
   */
  public async processStream(
    body: ReadableStream<Uint8Array>,
    onEvent: SSEHandler,
    assistantMessageId?: string,
    seedContent?: string
  ): Promise<void> {
    onEvent({ type: "status", status: "connected" });
    try {
      await this.streamResponse(body, onEvent, assistantMessageId, seedContent);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  /**
   * Send an approval decision to the API and return the response
   * for streaming continuation.
   */
  public async resolveApproval(
    approval: { agentId: string; executionId: string; approvalId: string },
    decision: 'approved' | 'denied'
  ): Promise<Response> {
    const baseUrl = this.config.apiUrl
      ?.replace(/\/+$/, '')
      .replace(/\/v1\/dispatch$/, '') || DEFAULT_CLIENT_API_BASE;
    const url = `${baseUrl}/v1/agents/${approval.agentId}/approve`;

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers
    };
    if (this.getHeaders) {
      Object.assign(headers, await this.getHeaders());
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        executionId: approval.executionId,
        approvalId: approval.approvalId,
        decision,
        streamResponse: true,
      }),
    });
  }

  /**
   * Resume a paused flow execution by supplying outputs for LOCAL
   * (client-executed) tools. Used by the built-in `ask_user_question`
   * answer-pill sheet, but generic enough for any LOCAL tool.
   *
   * Routes by mode:
   *  - **client-token mode**: POST `${apiBase}/v1/client/resume` (the
   *    session-authenticated sibling of `/v1/client/chat`; runtypelabs/core#3889),
   *    with the active `sessionId` in the body and no Bearer key: a browser
   *    client-token page holds no secret. The page's tool registry is
   *    re-snapshotted and sent alongside `toolOutputs` via the same diff-only
   *    `clientTools` / `clientToolsFingerprint` protocol as `/v1/client/chat`
   *    (runtypelabs/core#5361), so tools registered by a mid-run page
   *    navigation replace the run's dispatch-time set and become callable on
   *    the next model turn. Old servers strip the unknown fields and keep the
   *    frozen-at-dispatch behavior.
   *  - **dispatch / proxy mode**: POST `${apiUrl}/resume`: Runtype mounts
   *    resume as a child of `/v1/dispatch`, so the URL is `${apiUrl}/resume`,
   *    and proxies follow the same shape (`/api/chat/dispatch/resume`).
   *
   * Returns the raw Response so the caller can pipe its SSE body through
   * `connectStream()`.
   *
   * @param executionId - The paused execution id carried on `step_await`.
   * @param toolOutputs - Map keyed by per-call `toolCallId` (core#3878),
   *   falling back to tool name for legacy servers → the tool's result value.
   */
  /**
   * Diff-only / send-once WebMCP clientTools transport, shared by the
   * client-token chat (`/v1/client/chat`) and resume (`/v1/client/resume`)
   * paths — both routes speak the same protocol (runtypelabs/core#5361).
   *
   * Decides, against the shared fingerprint cache, whether this request ships
   * the full `clientTools[]` + fingerprint (first send under this session, or
   * a changed set) or the fingerprint alone (unchanged set; the server reuses
   * its stored copy). Runs `doFetch` with the chosen fields and retries
   * EXACTLY once with the full array on a
   * `409 { error: 'client_tools_resend_required' }` registry miss — the retry
   * is 409-*triggered*, never 409-*expected*, so servers predating the
   * protocol (which strip the unknown fields and never 409) work unchanged.
   * The 409 body is probed on a `clone()` so the original response body stays
   * readable by the caller's error handling.
   *
   * The cache is NOT committed here: callers invoke the returned `commit()`
   * only after the server has accepted the request (response OK / stream
   * started), so a failed request can never record a fingerprint the server
   * never stored. A resend-required miss invalidates the cached fingerprint
   * immediately so later turns keep resending in full until a clean success
   * commits a fresh one.
   *
   * `emptyMeansReplace` (resume only): when the live snapshot is empty but a
   * non-empty set was committed under this session and never explicitly
   * cleared (the paused tool navigated to a page with no tool registry), ship
   * an explicit `clientTools: []` so the server REPLACES the persisted
   * dispatch-time set with nothing and clears its stored registry. Chat keeps
   * its omit-when-empty behavior: on `/chat`, absent fields already mean "no
   * tools this turn", whereas on `/resume` absence means "keep the frozen
   * dispatch-time set".
   */
  private async sendWithClientToolsDiff(
    sessionId: string,
    fullClientTools: ClientToolDefinition[] | undefined,
    doFetch: (
      toolFields: Pick<ClientChatRequest, 'clientTools' | 'clientToolsFingerprint'>
    ) => Promise<Response>,
    opts?: { emptyMeansReplace?: boolean }
  ): Promise<{ response: Response; commit: () => void }> {
    const hasClientTools = !!(fullClientTools && fullClientTools.length > 0);
    const clientToolsFingerprint = hasClientTools
      ? computeClientToolsFingerprint(fullClientTools!)
      : undefined;
    const sameSession = this.clientToolsFingerprintSessionId === sessionId;
    const unchanged =
      hasClientTools && sameSession && this.lastSentClientToolsFingerprint === clientToolsFingerprint;
    // Keyed on `sentNonEmptyClientToolsSessionId`, NOT the fingerprint: an
    // interleaved empty-tool chat turn commits a null fingerprint without
    // clearing the tools persisted for a still-paused execution, so the
    // fingerprint alone would lose the pending clear. The dedicated flag
    // survives omitted-empty commits and is reset only once an explicit []
    // replace is confirmed.
    const sendEmptyReplace =
      !hasClientTools &&
      opts?.emptyMeansReplace === true &&
      this.sentNonEmptyClientToolsSessionId === sessionId;

    // `forceFull` flips to true after a 409 cache-miss so the single retry
    // resends the full list.
    let forceFull = false;
    let response: Response;
    for (let attempt = 0; ; attempt++) {
      const sendFull = hasClientTools && (forceFull || !unchanged);
      response = await doFetch({
        ...(sendFull && fullClientTools ? { clientTools: fullClientTools } : {}),
        ...(sendEmptyReplace ? { clientTools: [] } : {}),
        ...(clientToolsFingerprint ? { clientToolsFingerprint } : {}),
      });

      // Diff-only cache miss: the server has no stored tool set matching our
      // fingerprint. Retry exactly once with the full list. A second miss
      // falls through to the caller's normal error handling (no infinite loop).
      if (response.status === 409 && attempt === 0 && hasClientTools) {
        const body = (await response
          .clone()
          .json()
          .catch(() => null)) as { error?: string } | null;
        if (body?.error === 'client_tools_resend_required') {
          forceFull = true;
          // Invalidate so future turns also resend until a clean success
          // commits a fresh fingerprint.
          this.lastSentClientToolsFingerprint = null;
          continue;
        }
      }
      break;
    }

    return {
      response,
      commit: () => {
        this.lastSentClientToolsFingerprint = clientToolsFingerprint ?? null;
        this.clientToolsFingerprintSessionId = sessionId;
        if (hasClientTools) {
          this.sentNonEmptyClientToolsSessionId = sessionId;
        } else if (sendEmptyReplace) {
          // The explicit [] replaced the persisted set server-side; the
          // pending clear is done.
          this.sentNonEmptyClientToolsSessionId = null;
        }
        // Omitted-empty commits (chat with zero tools) leave the flag set:
        // they don't touch tools persisted for a paused execution.
      },
    };
  }

  public async resumeFlow(
    executionId: string,
    toolOutputs: Record<string, unknown>,
    options?: { streamResponse?: boolean; signal?: AbortSignal }
  ): Promise<Response> {
    const isClientToken = this.isClientTokenMode();
    const url = isClientToken
      ? this.getClientApiUrl('resume')
      : `${this.config.apiUrl?.replace(/\/+$/, '') || DEFAULT_CLIENT_API_BASE}/resume`;

    // The client-token resume route authenticates the session, not a Bearer
    // key. A WebMCP approval can sit awaiting user input for a long time, so by
    // the time we resume the original session may have expired. Re-validate (and
    // silently re-init if needed) via initSession(): which returns the live
    // session when `new Date() < expiresAt`, else mints a fresh one: instead of
    // trusting the possibly-stale `this.clientSession`. (core#3889; BugBot
    // PR #214 r3367875360.)
    let resumeSessionId: string | undefined;
    if (isClientToken) {
      resumeSessionId = (await this.initSession()).sessionId;
    }

    let headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...this.headers
    };
    if (this.getHeaders) {
      Object.assign(headers, await this.getHeaders());
    }

    const body: Record<string, unknown> = {
      executionId,
      toolOutputs,
      streamResponse: options?.streamResponse ?? true,
    };
    // Thread the (refreshed) sessionId through like `/v1/client/chat` does.
    if (resumeSessionId) {
      body.sessionId = resumeSessionId;
    }

    if (isClientToken && resumeSessionId) {
      // Mid-run WebMCP tool refresh (runtypelabs/core#5361): the paused tool
      // may have navigated the page, so the dispatch-time snapshot the server
      // persisted can be stale. Re-snapshot the registry — the same built-in +
      // bridge composition as the payload builders, so fingerprints computed
      // here and on chat turns describe the same tool space — and ship it via
      // the shared diff-only protocol. `emptyMeansReplace` sends an explicit
      // `clientTools: []` when the registry vanished after a non-empty send,
      // so the server replaces the persisted set instead of keeping it frozen.
      const fullClientTools = [
        ...builtInClientToolsForDispatch(this.config),
        ...((await this.webMcpBridge?.snapshotForDispatch()) ?? []),
      ];
      const { response, commit } = await this.sendWithClientToolsDiff(
        resumeSessionId,
        fullClientTools,
        (toolFields) => {
          const resumeRequest = { ...body, ...toolFields };
          if (this.debug) {
            // eslint-disable-next-line no-console
            console.debug("[AgentWidgetClient] client token resume", resumeRequest);
          }
          return fetch(url, {
            method: 'POST',
            headers,
            body: JSON.stringify(resumeRequest),
            signal: options?.signal,
          });
        },
        { emptyMeansReplace: true }
      );
      // The server stores the refreshed registry before running the
      // continuation pipeline, so an OK response means it holds this set under
      // this fingerprint. Mirror chat's commit-on-success discipline: a failed
      // resume must not record a fingerprint the server never stored.
      if (response.ok) {
        commit();
      }
      return response;
    }

    return fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify(body),
      signal: options?.signal,
    });
  }

  private async buildAgentPayload(
    messages: AgentWidgetMessage[]
  ): Promise<AgentWidgetAgentRequestPayload> {
    const routedAgentId = this.routing().agentId;
    if (!this.config.agent && !routedAgentId) {
      throw new Error('Agent configuration required for agent mode');
    }

    // Filter out messages with empty content and normalize
    const normalizedMessages = messages
      .slice()
      .filter(hasValidContent)
      .filter(m => m.role === "user" || m.role === "assistant" || m.role === "system")
      .filter(m => !m.variant || m.variant === "assistant")
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
      })
      .map((message) => ({
        role: message.role,
        content: message.contentParts ?? message.llmContent ?? message.rawContent ?? message.content,
        createdAt: message.createdAt
      }));

    const payload: AgentWidgetAgentRequestPayload = {
      agent: this.config.agent ?? { agentId: routedAgentId! },
      messages: normalizedMessages,
      options: {
        streamResponse: true,
        recordMode: 'virtual',
        ...this.config.agentOptions
      }
    };

    // Client tools: built-in widget tools (ask_user_question, when exposed)
    // plus the per-turn WebMCP page-registry snapshot. Name collisions are
    // impossible: WebMCP entries are `webmcp:`-prefixed server-side while
    // `sdk`-origin built-ins keep bare names. Both kinds ride the same
    // diff-only fingerprint path in client-token mode. Kept to a single await
    // so dispatch microtask timing is unchanged.
    const clientTools = [
      ...builtInClientToolsForDispatch(this.config),
      ...((await this.webMcpBridge?.snapshotForDispatch()) ?? []),
    ];
    if (clientTools.length > 0) {
      payload.clientTools = clientTools;
    }

    // Add context from providers
    if (this.contextProviders.length) {
      const contextAggregate: Record<string, unknown> = {};
      await Promise.all(
        this.contextProviders.map(async (provider) => {
          try {
            const result = await provider({
              messages,
              config: this.config
            });
            if (result && typeof result === "object") {
              Object.assign(contextAggregate, result);
            }
          } catch (error) {
            if (typeof console !== "undefined") {
              // eslint-disable-next-line no-console
              console.warn("[AgentWidget] Context provider failed:", error);
            }
          }
        })
      );

      if (Object.keys(contextAggregate).length) {
        payload.context = contextAggregate;
      }
    }

    return payload;
  }

  private async buildPayload(
    messages: AgentWidgetMessage[]
  ): Promise<AgentWidgetRequestPayload> {
    // Filter out messages with empty content to prevent validation errors
    const normalizedMessages = messages
      .slice()
      .filter(hasValidContent)
      .sort((a, b) => {
        const timeA = new Date(a.createdAt).getTime();
        const timeB = new Date(b.createdAt).getTime();
        return timeA - timeB;
      })
      .map((message) => ({
        role: message.role,
        // Priority: contentParts (multi-modal) > llmContent (explicit LLM content) > rawContent (structured parsers) > content (display)
        content: message.contentParts ?? message.llmContent ?? message.rawContent ?? message.content,
        createdAt: message.createdAt
      }));

    const routed = this.routing();
    const payload: AgentWidgetRequestPayload = {
      messages: normalizedMessages,
      ...(routed.agentId
        ? { agent: { agentId: routed.agentId } }
        : routed.flowId
          ? { flowId: routed.flowId }
          : {})
    };

    // Custom-provider targets (e.g. `eve:support`) resolve to a payload
    // fragment that is merged into the dispatch body so a BYO backend can read
    // whatever routing keys its resolver chose. `messages` is authoritative and
    // can never be overridden by a resolver.
    if (routed.targetPayload) {
      for (const [key, value] of Object.entries(routed.targetPayload)) {
        if (key === "messages") continue;
        (payload as Record<string, unknown>)[key] = value;
      }
    }

    // Client tools: same built-in + WebMCP merge as buildAgentPayload
    // (flow-dispatch path).
    const clientTools = [
      ...builtInClientToolsForDispatch(this.config),
      ...((await this.webMcpBridge?.snapshotForDispatch()) ?? []),
    ];
    if (clientTools.length > 0) {
      payload.clientTools = clientTools;
    }

    if (this.contextProviders.length) {
      const contextAggregate: Record<string, unknown> = {};
      await Promise.all(
        this.contextProviders.map(async (provider) => {
          try {
            const result = await provider({
              messages,
              config: this.config
            });
            if (result && typeof result === "object") {
              Object.assign(contextAggregate, result);
            }
          } catch (error) {
            if (typeof console !== "undefined") {
              // eslint-disable-next-line no-console
              console.warn("[AgentWidget] Context provider failed:", error);
            }
          }
        })
      );

      if (Object.keys(contextAggregate).length) {
        payload.context = contextAggregate;
      }
    }

    if (this.requestMiddleware) {
      try {
        const result = await this.requestMiddleware({
          payload: { ...payload },
          config: this.config
        });
        if (result && typeof result === "object") {
          const next = result as AgentWidgetRequestPayload;
          // Preserve `clientTools` if the middleware returned a fresh
          // payload object without it. Naive middlewares often rebuild
          // the payload by listing the fields they care about and
          // dropping `clientTools` accidentally; the WebMCP wire surface
          // is invisible to them. The integrator can still set
          // `clientTools: []` or `clientTools: undefined` explicitly to
          // strip them on purpose: we only fall back when the field is
          // entirely absent from the returned object.
          if (
            payload.clientTools !== undefined &&
            !("clientTools" in next)
          ) {
            next.clientTools = payload.clientTools;
          }
          return next;
        }
      } catch (error) {
        if (typeof console !== "undefined") {
          // eslint-disable-next-line no-console
          console.error("[AgentWidget] Request middleware error:", error);
        }
      }
    }

    return payload;
  }

  /**
   * Handle custom SSE event parsing via parseSSEEvent callback
   * Returns true if event was handled, false otherwise
   */
  private async handleCustomSSEEvent(
    payload: unknown,
    onEvent: SSEHandler,
    assistantMessageRef: { current: AgentWidgetMessage | null },
    emitMessage: (msg: AgentWidgetMessage) => void,
    nextSequence: () => number,
    partIdState: { current: string | null }
  ): Promise<boolean> {
    if (!this.parseSSEEvent) return false;

    try {
      const result = await this.parseSSEEvent(payload);
      if (result === null) return false; // Event should be ignored

      const createNewAssistant = (partId?: string): AgentWidgetMessage => {
        const msg: AgentWidgetMessage = {
          id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true,
          variant: "assistant",
          sequence: nextSequence(),
          ...(partId !== undefined && { partId })
        };
        assistantMessageRef.current = msg;
        emitMessage(msg);
        return msg;
      };

      const ensureAssistant = (partId?: string) => {
        if (assistantMessageRef.current) return assistantMessageRef.current;
        return createNewAssistant(partId);
      };

      if (result.text !== undefined) {
        // partId-based message segmentation: when partId changes, seal current
        // message and start a new one for chronological tool/text interleaving
        if (result.partId !== undefined && partIdState.current !== null && result.partId !== partIdState.current) {
          // Seal the current assistant message
          if (assistantMessageRef.current) {
            assistantMessageRef.current.streaming = false;
            emitMessage(assistantMessageRef.current);
          }
          // Create a new assistant message for the new text segment
          createNewAssistant(result.partId);
        }

        // Update partId tracking (only when partId is provided: backward compatible)
        if (result.partId !== undefined) {
          partIdState.current = result.partId;
        }

        const assistant = ensureAssistant(result.partId);
        // Tag the message with partId if present and not already set
        if (result.partId !== undefined && !assistant.partId) {
          assistant.partId = result.partId;
        }
        assistant.content += result.text;
        emitMessage(assistant);
      }

      if (result.done) {
        if (assistantMessageRef.current) {
          assistantMessageRef.current.streaming = false;
          emitMessage(assistantMessageRef.current);
        }
        partIdState.current = null;
        onEvent({ type: "status", status: "idle" });
      }

      if (result.error) {
        partIdState.current = null;
        onEvent({
          type: "error",
          error: new Error(result.error)
        });
      }

      return true; // Event was handled
    } catch (error) {
      if (typeof console !== "undefined") {
        // eslint-disable-next-line no-console
        console.error("[AgentWidget] parseSSEEvent error:", error);
      }
      return false;
    }
  }

  private async streamResponse(
    body: ReadableStream<Uint8Array>,
    onEvent: SSEHandler,
    assistantMessageId?: string,
    // Durable reconnect: seed the assistant accumulator with the text already
    // shown before the drop, so replayed post-cursor deltas APPEND to it
    // instead of a fresh stream clobbering it (the replay carries only
    // `seq > after`, i.e. the new deltas, not the full text).
    seedContent?: string
  ) {
    const reader = body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";

    const baseSequence = Date.now();
    let sequenceCounter = 0;
    const nextSequence = () => baseSequence + sequenceCounter++;

    const cloneMessage = (msg: AgentWidgetMessage): AgentWidgetMessage => {
      const reasoning = msg.reasoning
        ? {
            ...msg.reasoning,
            chunks: [...msg.reasoning.chunks]
          }
        : undefined;
      const toolCall = msg.toolCall
        ? {
            ...msg.toolCall,
            chunks: msg.toolCall.chunks ? [...msg.toolCall.chunks] : undefined
          }
        : undefined;
      const tools = msg.tools
        ? msg.tools.map((tool) => ({
            ...tool,
            chunks: tool.chunks ? [...tool.chunks] : undefined
          }))
        : undefined;

      return {
        ...msg,
        reasoning,
        toolCall,
        tools
      };
    };

    const shouldEmitMessage = (msg: AgentWidgetMessage): boolean => {
      if (msg.role !== "assistant" || msg.variant) return true;

      const hasContentParts =
        Array.isArray(msg.contentParts) && msg.contentParts.length > 0;
      const hasRawContent =
        typeof msg.rawContent === "string" && msg.rawContent.trim() !== "";
      const hasVisibleText =
        typeof msg.content === "string" && msg.content.trim() !== "";

      // Do not surface assistant text bubbles that only contain whitespace.
      // Some providers emit newline-only text parts around a leading tool call;
      // rendering those as normal messages creates an empty bubble above the
      // tool card. Keep media/component/stop-reason messages renderable.
      return hasVisibleText || hasContentParts || hasRawContent || Boolean(msg.stopReason);
    };

    const emitMessage = (msg: AgentWidgetMessage) => {
      if (!shouldEmitMessage(msg)) return;
      onEvent({
        type: "message",
        message: cloneMessage(msg)
      });
    };

    let assistantMessage: AgentWidgetMessage | null = null;
    // Tracks the most recently touched assistant text message for the
    // current agent turn so `agent_turn_complete.stopReason` can attach
    // to the final visible text segment even after `assistantMessage`
    // has been finalized at a tool-call boundary within the turn.
    let lastAssistantInTurn: AgentWidgetMessage | null = null;
    // Reference to track assistant message for custom event handler
    const assistantMessageRef = { current: null as AgentWidgetMessage | null };
    // Segmentation state for the `parseSSEEvent` extensibility callback (the
    // consumer's own `partId` field) — independent of the wire.
    const customParsePartId = { current: null as string | null };
    // Unified text-channel block id (from `text_start`/`text_delta` `id`). Drives
    // bubble-id segmentation on the wire in place of the legacy `partId`:
    // a new block id means a new bubble, sealed at `text_complete`/tool boundaries.
    let currentTextBlockId: string | null = null;
    // Raw text accumulated for the open flow block before its bubble is
    // materialized — lets a whitespace-only block resolve without a stray bubble.
    let pendingFlowRaw = "";
    // Nested flow-as-tool attribution (PR #4602): a text/reasoning block whose
    // `parentToolCallId` matches a `tool_start.toolCallId` belongs to a flow
    // running as that tool. Keyed by the wire block id, these route the block's
    // deltas into a message tagged `agentMetadata.parentToolId` (the parent tool's
    // row) instead of the top-level assistant/reasoning channel.
    const nestedBlockParent = new Map<string, string>();
    const nestedBlockMessages = new Map<string, AgentWidgetMessage>();
    const nestedBlockRaw = new Map<string, string>();
    const reasoningMessages = new Map<string, AgentWidgetMessage>();
    const toolMessages = new Map<string, AgentWidgetMessage>();
    const reasoningContext = {
      lastId: null as string | null,
      byStep: new Map<string, string>()
    };
    const toolContext = {
      lastId: null as string | null,
      byCall: new Map<string, string>()
    };

    const normalizeKey = (value: unknown): string | null => {
      if (value === null || value === undefined) return null;
      try {
        return String(value);
      } catch (error) {
        return null;
      }
    };

    const getStepKey = (payload: Record<string, any>) =>
      normalizeKey(
        payload.stepId ??
          payload.step_id ??
          payload.step ??
          payload.parentId ??
          payload.flowStepId ??
          payload.flow_step_id
      );

    const getToolCallKey = (payload: Record<string, any>) =>
      normalizeKey(
        payload.callId ??
          payload.call_id ??
          payload.requestId ??
          payload.request_id ??
          payload.toolCallId ??
          payload.tool_call_id ??
          payload.stepId ??
          payload.step_id
      );

    const baseAssistantId = assistantMessageId;
    let assistantIdConsumed = false;

    const ensureAssistantMessage = () => {
      if (assistantMessage) return assistantMessage;
      let id: string;
      let initialContent = "";
      const segment = currentTextBlockId;
      if (!assistantIdConsumed && baseAssistantId) {
        id = baseAssistantId;
        assistantIdConsumed = true;
        // First (and only) time we reuse the caller-supplied id: this is the
        // bubble a durable reconnect resumes into, so continue its text.
        initialContent = seedContent ?? "";
      } else if (baseAssistantId && segment) {
        id = `${baseAssistantId}_${segment}`;
      } else {
        id = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      assistantMessage = {
        id,
        role: "assistant",
        content: initialContent,
        createdAt: new Date().toISOString(),
        streaming: true,
        sequence: nextSequence()
      };
      emitMessage(assistantMessage);
      return assistantMessage;
    };

    const trackReasoningId = (stepKey: string | null, id: string) => {
      reasoningContext.lastId = id;
      if (stepKey) {
        reasoningContext.byStep.set(stepKey, id);
      }
    };

    const resolveReasoningId = (
      payload: Record<string, any>,
      allowCreate: boolean
    ): string | null => {
      const rawId = payload.reasoningId ?? payload.id;
      const stepKey = getStepKey(payload);
      if (rawId) {
        const resolved = String(rawId);
        trackReasoningId(stepKey, resolved);
        return resolved;
      }
      if (stepKey) {
        const existing = reasoningContext.byStep.get(stepKey);
        if (existing) {
          reasoningContext.lastId = existing;
          return existing;
        }
      }
      if (reasoningContext.lastId && !allowCreate) {
        return reasoningContext.lastId;
      }
      if (!allowCreate) {
        return null;
      }
      const generated = `reason-${nextSequence()}`;
      trackReasoningId(stepKey, generated);
      return generated;
    };

    const ensureReasoningMessage = (reasoningId: string) => {
      const existing = reasoningMessages.get(reasoningId);
      if (existing) {
        return existing;
      }

      const message: AgentWidgetMessage = {
        id: `reason-${reasoningId}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        variant: "reasoning",
        sequence: nextSequence(),
        reasoning: {
          id: reasoningId,
          status: "streaming",
          chunks: []
        }
      };

      reasoningMessages.set(reasoningId, message);
      emitMessage(message);
      return message;
    };

    const trackToolId = (callKey: string | null, id: string) => {
      toolContext.lastId = id;
      if (callKey) {
        toolContext.byCall.set(callKey, id);
      }
    };

    // Track tool call IDs for artifact emit tools so we can suppress their UI
    const artifactToolCallIds = new Set<string>();
    // Track artifact reference card messages so we can update them on artifact_complete
    const artifactCardMessages = new Map<string, AgentWidgetMessage>();
    // Track artifact IDs that already have a reference card (from auto-creation or transcript_insert)
    const artifactIdsWithCards = new Set<string>();
    // Accumulate artifact markdown content for embedding in card props on complete
    const artifactContent = new Map<string, { markdown: string; title?: string }>();
    const isArtifactEmitToolName = (name: string | undefined): boolean => {
      if (!name) return false;
      const normalized = name.replace(/_+/g, "_").replace(/^_|_$/g, "");
      return normalized === "emit_artifact_markdown" || normalized === "emit_artifact_component";
    };

    const resolveToolId = (
      payload: Record<string, any>,
      allowCreate: boolean
    ): string | null => {
      const rawId = payload.toolId ?? payload.id;
      const callKey = getToolCallKey(payload);
      if (rawId) {
        const resolved = String(rawId);
        trackToolId(callKey, resolved);
        return resolved;
      }
      if (callKey) {
        const existing = toolContext.byCall.get(callKey);
        if (existing) {
          toolContext.lastId = existing;
          return existing;
        }
      }
      if (toolContext.lastId && !allowCreate) {
        return toolContext.lastId;
      }
      if (!allowCreate) {
        return null;
      }
      const generated = `tool-${nextSequence()}`;
      trackToolId(callKey, generated);
      return generated;
    };

    const ensureToolMessage = (toolId: string) => {
      const existing = toolMessages.get(toolId);
      if (existing) {
        return existing;
      }

      const message: AgentWidgetMessage = {
        id: `tool-${toolId}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        variant: "tool",
        sequence: nextSequence(),
        toolCall: {
          id: toolId,
          status: "pending"
        }
      };

      toolMessages.set(toolId, message);
      emitMessage(message);
      return message;
    };

    const resolveTimestamp = (value: unknown) => {
      if (typeof value === "number" && Number.isFinite(value)) {
        return value;
      }
      if (typeof value === "string") {
        const parsed = Number(value);
        if (!Number.isNaN(parsed) && Number.isFinite(parsed)) {
          return parsed;
        }
        const dateParsed = Date.parse(value);
        if (!Number.isNaN(dateParsed)) {
          return dateParsed;
        }
      }
      return Date.now();
    };

    const ensureStringContent = (value: unknown): string => {
      if (typeof value === "string") {
        return value;
      }
      if (value === null || value === undefined) {
        return "";
      }
      // Convert objects/arrays to JSON string
      try {
        return JSON.stringify(value);
      } catch {
        return String(value);
      }
    };

    // Maintain stateful stream parsers per message for incremental parsing
    const streamParsers = new Map<string, AgentWidgetStreamParser>();
    // Track accumulated raw content for structured formats (JSON, XML, etc.)
    const rawContentBuffers = new Map<string, string>();
    // Rebuild incremental text by sequence so late arrivals can repair already-emitted
    // content after the reorder buffer's gap-timeout flush.
    const orderedChunkBuffers = new Map<string, Array<{ seq: number; text: string }>>();

    const insertOrderedChunk = (key: string, seq: number, text: string): string => {
      let chunks = orderedChunkBuffers.get(key);
      if (!chunks) {
        chunks = [];
        orderedChunkBuffers.set(key, chunks);
      }

      let lo = 0;
      let hi = chunks.length;
      while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        if (chunks[mid].seq < seq) {
          lo = mid + 1;
        } else {
          hi = mid;
        }
      }

      if (chunks[lo]?.seq === seq) {
        chunks[lo] = { seq, text };
      } else {
        chunks.splice(lo, 0, { seq, text });
      }

      let accumulated = "";
      for (let index = 0; index < chunks.length; index++) {
        accumulated += chunks[index].text;
      }
      return accumulated;
    };

    /**
     * After text_end + didSplitByPartId, merge the authoritative final response into the
     * sealed message when streaming left content short (e.g. async parser lag).
     */
    const reconcileSealedAssistantWithFinalResponse = (
      msg: AgentWidgetMessage,
      finalContent: unknown
    ) => {
      const finalString = ensureStringContent(finalContent);
      const rawBuffer = rawContentBuffers.get(msg.id);
      const contentToProcess = preferFinalStructuredContent(rawBuffer, finalString);
      msg.rawContent = contentToProcess;
      const parser = streamParsers.get(msg.id);

      const mergeIfBetter = (mergedDisplay: string) => {
        const cur = msg.content ?? "";
        if (mergedDisplay.trim() === "") return;
        // Only replace when empty, or when the stream left a strict prefix of the
        // authoritative final (truncation). Do not use length alone: multi-segment
        // flows can have a short last bubble whose content is not a prefix of the
        // full step response.
        if (
          cur.trim().length === 0 ||
          mergedDisplay.startsWith(cur) ||
          mergedDisplay.trimStart().startsWith(cur.trim())
        ) {
          msg.content = mergedDisplay;
        }
      };

      const finalizeCleanup = () => {
        if (parser) {
          const closeResult = parser.close?.();
          if (closeResult instanceof Promise) closeResult.catch(() => {});
        }
        streamParsers.delete(msg.id);
        rawContentBuffers.delete(msg.id);
        msg.streaming = false;
        emitMessage(msg);
      };

      if (!parser) {
        mergeIfBetter(finalString);
        finalizeCleanup();
        return;
      }

      // Prefer JSON fast path when the final payload is JSON-shaped
      const extractedFromJson = extractTextFromJson(contentToProcess);
      if (extractedFromJson !== null && extractedFromJson.trim() !== "") {
        mergeIfBetter(extractedFromJson);
        finalizeCleanup();
        return;
      }

      const bestDisplayText = (
        result: AgentWidgetStreamParserResult | string | null
      ): string => {
        const text =
          typeof result === "string" ? result : result?.text ?? null;
        if (text !== null && text.trim() !== "") return text;
        const extracted = parser.getExtractedText();
        if (extracted !== null && extracted.trim() !== "") return extracted;
        return finalString;
      };

      let parsedResult: ReturnType<typeof parser.processChunk>;
      try {
        parsedResult = parser.processChunk(contentToProcess);
      } catch {
        mergeIfBetter(finalString);
        finalizeCleanup();
        return;
      }

      if (parsedResult instanceof Promise) {
        parsedResult
          .then((result) => {
            mergeIfBetter(bestDisplayText(result));
            finalizeCleanup();
          })
          .catch(() => {
            mergeIfBetter(finalString);
            finalizeCleanup();
          });
        return;
      }

      mergeIfBetter(bestDisplayText(parsedResult));
      finalizeCleanup();
    };

    // === Unified flow text channel ===
    // Flow prompt-step text streams as `text_delta` blocks (segmented by
    // `text_start`/`text_complete`) and can be structured JSON, so each block
    // runs through the per-bubble structured-content parser — agent text stays
    // plain. This is the legacy step_delta parser core, re-keyed from `partId`
    // to the wire block-id bubble. The caller materializes the bubble lazily
    // (whitespace-only blocks around tool boundaries never leave a stray bubble)
    // and `step_complete.result.response` reconciles the authoritative final.
    let lastSealedFlowBubble: AgentWidgetMessage | null = null;

    // Stream one accumulated chunk of flow block text through the parser, setting
    // display `content` (extracted) + `rawContent` (raw) and emitting. Mirrors the
    // legacy step_delta chunk path; plain text bypasses the structured parser.
    const applyFlowTextChunk = (
      assistant: AgentWidgetMessage,
      accumulatedRaw: string,
      chunk: string,
      chunkSeq: number | undefined
    ) => {
      assistant.rawContent = accumulatedRaw;
      if (!streamParsers.has(assistant.id)) {
        streamParsers.set(assistant.id, this.createStreamParser());
      }
      const parser = streamParsers.get(assistant.id)!;
      const looksLikeJson =
        accumulatedRaw.trim().startsWith("{") || accumulatedRaw.trim().startsWith("[");
      if (looksLikeJson) {
        rawContentBuffers.set(assistant.id, accumulatedRaw);
      }
      const isPlainTextParser = (parser as any).__isPlainTextParser === true;
      if (isPlainTextParser) {
        assistant.content =
          chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
        rawContentBuffers.delete(assistant.id);
        streamParsers.delete(assistant.id);
        assistant.rawContent = undefined;
        emitMessage(assistant);
        return;
      }
      const parsedResult = parser.processChunk(accumulatedRaw);
      if (parsedResult instanceof Promise) {
        parsedResult
          .then((result) => {
            const text = typeof result === "string" ? result : result?.text ?? null;
            if (text !== null && text.trim() !== "") {
              assistant.content = text;
              emitMessage(assistant);
            } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith("<")) {
              assistant.content =
                chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
              rawContentBuffers.delete(assistant.id);
              streamParsers.delete(assistant.id);
              assistant.rawContent = undefined;
              emitMessage(assistant);
            }
          })
          .catch(() => {
            assistant.content =
              chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
            rawContentBuffers.delete(assistant.id);
            streamParsers.delete(assistant.id);
            assistant.rawContent = undefined;
            emitMessage(assistant);
          });
      } else {
        const text =
          typeof parsedResult === "string" ? parsedResult : parsedResult?.text ?? null;
        if (text !== null && text.trim() !== "") {
          assistant.content = text;
          emitMessage(assistant);
        } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith("<")) {
          assistant.content =
            chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
          rawContentBuffers.delete(assistant.id);
          streamParsers.delete(assistant.id);
          assistant.rawContent = undefined;
          emitMessage(assistant);
        }
      }
    };

    // Seal a flow text block at `text_complete`: run final structured extraction
    // off the accumulated raw buffer (U2: `text_complete.text` mirrors that raw
    // buffer, so we never double-count), then finalize the bubble. The structured
    // `step_complete.result.response` reconciles afterward.
    const finalizeFlowTextBlock = (
      assistant: AgentWidgetMessage,
      finalContent?: unknown
    ) => {
      const effectiveFinal =
        finalContent !== undefined && finalContent !== null
          ? finalContent
          : assistant.content;
      if (
        effectiveFinal === undefined ||
        effectiveFinal === null ||
        effectiveFinal === ""
      ) {
        assistant.streaming = false;
        emitMessage(assistant);
        return;
      }
      const rawBuffer = rawContentBuffers.get(assistant.id);
      const contentToProcess = rawBuffer ?? ensureStringContent(effectiveFinal);
      assistant.rawContent = contentToProcess;
      const parser = streamParsers.get(assistant.id);
      let extractedText: string | null = null;
      let asyncPending = false;
      if (parser) {
        extractedText = parser.getExtractedText();
        if (extractedText === null) {
          extractedText = extractTextFromJson(contentToProcess);
        }
        if (extractedText === null) {
          const parsedResult = parser.processChunk(contentToProcess);
          if (parsedResult instanceof Promise) {
            asyncPending = true;
            parsedResult
              .then((result) => {
                const text =
                  typeof result === "string" ? result : result?.text ?? null;
                if (text !== null) {
                  assistant.content = text;
                  assistant.streaming = false;
                  streamParsers.delete(assistant.id);
                  rawContentBuffers.delete(assistant.id);
                  emitMessage(assistant);
                }
              })
              .catch(() => {});
          } else {
            extractedText =
              typeof parsedResult === "string"
                ? parsedResult
                : parsedResult?.text ?? null;
          }
        }
      }
      if (!asyncPending) {
        if (extractedText !== null && extractedText.trim() !== "") {
          assistant.content = extractedText;
        } else if (!rawContentBuffers.has(assistant.id)) {
          assistant.content = ensureStringContent(effectiveFinal);
        }
        const parserToClose = streamParsers.get(assistant.id);
        if (parserToClose) {
          const closeResult = parserToClose.close?.();
          if (closeResult instanceof Promise) closeResult.catch(() => {});
          streamParsers.delete(assistant.id);
        }
        rawContentBuffers.delete(assistant.id);
        assistant.streaming = false;
        emitMessage(assistant);
      }
    };

    // Materialize (lazily) the message for a nested flow-as-tool block, tagged
    // with the parent tool-call id so the UI renders it in the parent tool's row.
    const ensureNestedBlockMessage = (
      blockId: string,
      parentToolCallId: string,
      variant?: "reasoning"
    ): AgentWidgetMessage => {
      const existing = nestedBlockMessages.get(blockId);
      if (existing) return existing;
      const message: AgentWidgetMessage = {
        id: `nested-${parentToolCallId}-${blockId}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        sequence: nextSequence(),
        ...(variant ? { variant } : {}),
        ...(variant === "reasoning"
          ? { reasoning: { id: blockId, status: "streaming", chunks: [] } }
          : {}),
        agentMetadata: { parentToolId: parentToolCallId },
      };
      nestedBlockMessages.set(blockId, message);
      emitMessage(message);
      return message;
    };

    // Ready queue of parsed wire frames awaiting a drain. The API streams the
    // 33-event wire vocabulary; each frame is parsed in the SSE loop
    // below and rendered directly by the handler (no translation bridge), then
    // pushed here. The wire stream is a single, in-order SSE connection, so
    // frames drain straight through with no reordering.
    const seqReadyQueue: Array<{ payloadType: string; payload: any }> = [];
    // Declared here so later closures can reference it; assigned after all
    // handler-scoped variables are initialised (before the SSE loop).
    let drainReadyQueue: () => void;
    // Per-stream media-block buffer: the media triad
    // (media_start/media_delta/media_complete) is reassembled here into a single
    // synthetic message at media_complete, keyed by the block id.
    const mediaBuffers = new Map<
      string,
      { mediaType?: string; role?: string; toolCallId?: unknown; parts: string[] }
    >();
    // Tracks the last iteration surfaced as a per-iteration message boundary, so
    // `turn_start` advancing the iteration rotates the bubble in 'separate' mode.
    let lastIterationSeen = 0;
    // Execution kind, resolved from the leading `execution_start` frame. Drives
    // the agent-vs-flow branches that the single wire vocabulary collapses.
    let executionKind: "agent" | "flow" = "agent";
    // Whether `executionKind` was set authoritatively by an `execution_start`
    // frame. Continuation streams (e.g. a tool-driven `/resume`) do NOT re-emit
    // `execution_start`, so a fresh `streamResponse` for the continuation starts
    // with the default `"agent"`. For a flow that mis-routes the final
    // prompt-step finalization and duplicates the last message (the streamed
    // text block is sealed, then `step_complete.result.response` re-renders it as
    // a second bubble). When `execution_start` is absent we recover the flow kind
    // from the first flow `step_*` frame below.
    let executionKindResolved = false;
    // Open turn id (from `turn_start`). Unified text/reasoning deltas carry their
    // own block id, not the turn id, so the turn id is threaded onto agentMetadata
    // from here.
    let openTurnId: string | null = null;
    // Agent execution state tracking
    let agentExecution: AgentExecutionState | null = null;
    // Track assistant messages per agent iteration for 'separate' mode
    const agentIterationMessages = new Map<number, AgentWidgetMessage>();
    const iterationDisplay = this.config.iterationDisplay ?? 'separate';

    // Drains the queued transduced events through the main event handler.
    // Also invoked after the SSE loop exits so any events queued at
    // end-of-stream are processed.
    drainReadyQueue = () => {
      for (let i = 0; i < seqReadyQueue.length; i++) {
        const payloadType = seqReadyQueue[i].payloadType;
        const payload = seqReadyQueue[i].payload;

        // Recover the execution kind on continuation streams that omit
        // `execution_start` (e.g. a tool-driven `/resume`). Flow `step_*` frames
        // carry a `stepType`; agent loops never do (they use `turn_*`). Without
        // this, the continuation defaults to `"agent"` and a flow's final
        // prompt-step finalization is duplicated. We only infer when no
        // `execution_start` resolved the kind, so an explicit `agent` is never
        // overridden.
        if (
          !executionKindResolved &&
          executionKind !== "flow" &&
          typeof (payload as { stepType?: unknown }).stepType === "string"
        ) {
          executionKind = "flow";
        }

        if (payloadType === "reasoning_start") {
          // Nested flow-as-tool thinking (PR #4602): route to the parent tool's row.
          const rStartBlockId = typeof payload.id === "string" ? payload.id : null;
          const rStartParent =
            typeof payload.parentToolCallId === "string" && payload.parentToolCallId
              ? payload.parentToolCallId
              : null;
          if (rStartBlockId && rStartParent) {
            nestedBlockParent.set(rStartBlockId, rStartParent);
            ensureNestedBlockMessage(rStartBlockId, rStartParent, "reasoning");
            continue;
          }
          const reasoningId =
            resolveReasoningId(payload, true) ?? `reason-${nextSequence()}`;
          const reasoningMessage = ensureReasoningMessage(reasoningId);
          reasoningMessage.reasoning = reasoningMessage.reasoning ?? {
            id: reasoningId,
            status: "streaming",
            chunks: []
          };
          reasoningMessage.reasoning.startedAt =
            reasoningMessage.reasoning.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          reasoningMessage.reasoning.completedAt = undefined;
          reasoningMessage.reasoning.durationMs = undefined;
          if (payload.scope === "loop" || payload.scope === "turn") {
            reasoningMessage.reasoning.scope = payload.scope;
          }
          reasoningMessage.streaming = true;
          reasoningMessage.reasoning.status = "streaming";
          emitMessage(reasoningMessage);
        } else if (payloadType === "reasoning_delta") {
          // Nested flow-as-tool thinking: append to the parent-tool-row message.
          const rDeltaBlockId = typeof payload.id === "string" ? payload.id : null;
          if (
            rDeltaBlockId &&
            nestedBlockParent.has(rDeltaBlockId) &&
            nestedBlockMessages.has(rDeltaBlockId)
          ) {
            const nested = nestedBlockMessages.get(rDeltaBlockId)!;
            const nestedChunk =
              payload.reasoningText ?? payload.text ?? payload.delta ?? "";
            if (nestedChunk && payload.hidden !== true && nested.reasoning) {
              nested.reasoning.chunks.push(String(nestedChunk));
              emitMessage(nested);
            }
            continue;
          }
          const reasoningId =
            resolveReasoningId(payload, false) ??
            resolveReasoningId(payload, true) ??
            `reason-${nextSequence()}`;
          const reasoningMessage = ensureReasoningMessage(reasoningId);
          reasoningMessage.reasoning = reasoningMessage.reasoning ?? {
            id: reasoningId,
            status: "streaming",
            chunks: []
          };
          reasoningMessage.reasoning.startedAt =
            reasoningMessage.reasoning.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          const chunk =
            payload.reasoningText ??
            payload.text ??
            payload.delta ??
            "";
          if (chunk && payload.hidden !== true) {
            const reasonSeq = typeof payload.sequenceIndex === "number" ? payload.sequenceIndex : undefined;
            if (reasonSeq !== undefined) {
              // Rebuild chunks by seq so late arrivals after a gap-timeout flush
              // are inserted at the correct position rather than appended.
              const ordered = insertOrderedChunk(reasoningId, reasonSeq, String(chunk));
              reasoningMessage.reasoning.chunks = [ordered];
            } else {
              reasoningMessage.reasoning.chunks.push(String(chunk));
            }
          }
          reasoningMessage.reasoning.status = payload.done ? "complete" : "streaming";
          if (payload.done) {
            reasoningMessage.reasoning.completedAt = resolveTimestamp(
              payload.completedAt ?? payload.timestamp
            );
            const start = reasoningMessage.reasoning.startedAt ?? Date.now();
            reasoningMessage.reasoning.durationMs = Math.max(
              0,
              (reasoningMessage.reasoning.completedAt ?? Date.now()) - start
            );

          }
          reasoningMessage.streaming = reasoningMessage.reasoning.status !== "complete";
          emitMessage(reasoningMessage);
        } else if (payloadType === "reasoning_complete") {
          // Nested flow-as-tool thinking close: seal the parent-tool-row message.
          const rCompleteBlockId = typeof payload.id === "string" ? payload.id : null;
          if (
            rCompleteBlockId &&
            nestedBlockParent.has(rCompleteBlockId) &&
            nestedBlockMessages.has(rCompleteBlockId)
          ) {
            const nested = nestedBlockMessages.get(rCompleteBlockId)!;
            if (nested.reasoning) {
              const nestedReflection =
                typeof payload.text === "string" ? payload.text : "";
              if (nestedReflection && nested.reasoning.chunks.length === 0) {
                nested.reasoning.chunks.push(nestedReflection);
              }
              nested.reasoning.status = "complete";
              nested.streaming = false;
              emitMessage(nested);
            }
            nestedBlockParent.delete(rCompleteBlockId);
            nestedBlockMessages.delete(rCompleteBlockId);
            continue;
          }
          const reasoningId =
            resolveReasoningId(payload, false) ??
            resolveReasoningId(payload, true) ??
            `reason-${nextSequence()}`;
          // A close carrying text (or scope:"loop") is a cross-iteration
          // reflection fold (merged spec §4 E3): the API streams nothing for the
          // block, then delivers the whole reflection as `text` on the close.
          // Materialize a reasoning bubble even if no reasoning_start/delta opened
          // one, and adopt the close text when the block streamed no chunks (the
          // common reflection case, where reasoning_start opened an empty bubble).
          const reflectionText = typeof payload.text === "string" ? payload.text : "";
          if (!reasoningMessages.get(reasoningId) && (reflectionText || payload.scope === "loop")) {
            ensureReasoningMessage(reasoningId);
          }
          const reasoningMessage = reasoningMessages.get(reasoningId);
          if (reasoningMessage?.reasoning) {
            if (payload.scope === "loop" || payload.scope === "turn") {
              reasoningMessage.reasoning.scope = payload.scope;
            }
            if (reflectionText && reasoningMessage.reasoning.chunks.length === 0) {
              reasoningMessage.reasoning.chunks.push(reflectionText);
            }
            reasoningMessage.reasoning.status = "complete";
            reasoningMessage.reasoning.completedAt = resolveTimestamp(
              payload.completedAt ?? payload.timestamp
            );
            const start = reasoningMessage.reasoning.startedAt ?? Date.now();
            reasoningMessage.reasoning.durationMs = Math.max(
              0,
              (reasoningMessage.reasoning.completedAt ?? Date.now()) - start
            );
            reasoningMessage.streaming = false;

            emitMessage(reasoningMessage);
          }
          const stepKey = getStepKey(payload);
          if (stepKey) {
            reasoningContext.byStep.delete(stepKey);
          }
        } else if (payloadType === "tool_start") {
          // Unified tool family (agent + flow). Seal any open assistant bubble so
          // text→tool→text interleaves chronologically (the API also emits a
          // text_complete here, so this is usually a no-op — kept for safety).
          if (assistantMessage) {
            (assistantMessage as AgentWidgetMessage).streaming = false;
            emitMessage(assistantMessage as AgentWidgetMessage);
            assistantMessage = null;
          }
          // Unified denormalizes `iteration` onto tool frames too (merged spec §2).
          // Track it so media/reflection blocks — which carry no iteration of their
          // own — can be stamped with the enclosing iteration even on tool-only
          // turns that never emit a `turn_start`.
          if (typeof payload.iteration === "number") lastIterationSeen = payload.iteration;
          const toolId: string =
            (typeof payload.toolCallId === "string" ? payload.toolCallId : undefined) ??
            resolveToolId(payload, true) ??
            `tool-${nextSequence()}`;
          const toolName = payload.toolName ?? payload.name;
          // Suppress tool UI for artifact emit tools: artifacts are handled via artifact_* events
          if (isArtifactEmitToolName(toolName)) {
            artifactToolCallIds.add(toolId);
            continue;
          }
          trackToolId(getToolCallKey(payload), toolId);
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId,
            status: "pending"
          };
          tool.name = toolName ?? tool.name;
          tool.status = "running";
          if (payload.parameters !== undefined) {
            tool.args = payload.parameters;
          } else if (payload.args !== undefined) {
            tool.args = payload.args;
          }
          tool.startedAt =
            tool.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          tool.completedAt = undefined;
          tool.durationMs = undefined;
          toolMessage.toolCall = tool;
          toolMessage.streaming = true;
          if (payload.executionId) {
            toolMessage.agentMetadata = {
              executionId: payload.executionId,
              iteration: payload.iteration,
            };
          }
          emitMessage(toolMessage);
        } else if (payloadType === "tool_output_delta") {
          const toolId =
            resolveToolId(payload, false) ??
            resolveToolId(payload, true) ??
            `tool-${nextSequence()}`;
          if (artifactToolCallIds.has(toolId)) continue;
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId,
            status: "running"
          };
          tool.startedAt =
            tool.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          const chunkText =
            payload.text ?? payload.delta ?? payload.message ?? "";
          if (chunkText) {
            tool.chunks = tool.chunks ?? [];
            tool.chunks.push(String(chunkText));
          }
          tool.status = "running";
          toolMessage.toolCall = tool;
          toolMessage.streaming = true;
          const agentCtxChunk = payload.agentContext;
          if (agentCtxChunk || payload.executionId) {
            toolMessage.agentMetadata = toolMessage.agentMetadata ?? {
              executionId: agentCtxChunk?.executionId ?? payload.executionId,
              iteration: agentCtxChunk?.iteration ?? payload.iteration,
            };
          }
          emitMessage(toolMessage);
        } else if (payloadType === "tool_complete") {
          const toolId =
            resolveToolId(payload, false) ??
            resolveToolId(payload, true) ??
            `tool-${nextSequence()}`;
          if (artifactToolCallIds.has(toolId)) {
            artifactToolCallIds.delete(toolId);
            continue;
          }
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId,
            status: "running"
          };
          tool.status = "complete";
          if (payload.result !== undefined) {
            tool.result = payload.result;
          }
          if (typeof payload.duration === "number") {
            tool.duration = payload.duration;
          }
          tool.completedAt = resolveTimestamp(
            payload.completedAt ?? payload.timestamp
          );
          const durationValue = payload.duration ?? payload.executionTime;
          if (typeof durationValue === "number") {
            tool.durationMs = durationValue;
          } else {
            const start = tool.startedAt ?? Date.now();
            tool.durationMs = Math.max(
              0,
              (tool.completedAt ?? Date.now()) - start
            );
          }
          toolMessage.toolCall = tool;
          toolMessage.streaming = false;
          const agentCtxComplete = payload.agentContext;
          if (agentCtxComplete || payload.executionId) {
            toolMessage.agentMetadata = toolMessage.agentMetadata ?? {
              executionId: agentCtxComplete?.executionId ?? payload.executionId,
              iteration: agentCtxComplete?.iteration ?? payload.iteration,
            };
          }
          emitMessage(toolMessage);
          const callKey = getToolCallKey(payload);
          if (callKey) {
            toolContext.byCall.delete(callKey);
          }
        } else if (payloadType === "await" && payload.toolName) {
          // LOCAL tool pause. Two wire shapes resolve here, by dispatch target:
          //  - FLOW dispatch → `step_await` + `awaitReason: "local_tool_required"`
          //    (Runtype's prompt step throws LocalToolRequiredError when the model
          //    calls a `toolType: "local"` tool).
          //  - AGENT dispatch → `agent_await` (the agent runtime's native pause).
          // Either way the server emits the tool name, params, and execution id;
          // the execution pauses until the client POSTs /resume with toolOutputs.
          // `agent_await` carries a BARE tool name plus an `origin`; page tools
          // (origin "webmcp") are normalized to the `webmcp:`-prefixed form below
          // so the bridge + session.ts `/resume` keying are identical for both.
          //
          // Upsert a fully-populated tool-variant message so the existing
          // ask_user_question bubble + sheet paths fire. Mark the message with
          // `awaitingLocalTool: true` so the UI knows to resolve via
          // resumeFlow rather than the legacy sendMessage fallback.
          //
          // Key the message by the per-call `toolCallId` (provider `toolu_…`;
          // core#3878) when present. Two PARALLEL calls to the SAME tool in one
          // turn collapse to an identical `toolId` (`runtime_webmcp:<name>_<ms>`)
          // and `index: 0`: only `toolCallId` distinguishes them. Keying on it
          // (a) keeps the two awaits as DISTINCT messages with their own args
          // instead of the second clobbering the first, and (b) merges each
          // await into the matching `tool_start` bubble (also keyed by
          // `toolCallId`). Fall back to the collapsed `toolId` for legacy
          // servers that don't emit `toolCallId`.
          const toolCallId: string | undefined =
            typeof payload.toolCallId === "string" && payload.toolCallId.length > 0
              ? (payload.toolCallId as string)
              : undefined;
          const toolId =
            toolCallId ?? (payload.toolId as string) ?? `local-${nextSequence()}`;
          const toolMessage = ensureToolMessage(toolId);
          const rawToolName = payload.toolName as string;
          // `agent_await` page tools arrive with a bare name; synthesize the
          // `webmcp:` prefix so isWebMcpToolName (and the bridge's prefix-strip on
          // resume) treat them identically to a flow `step_await`.
          const toolName =
            payload.origin === "webmcp" &&
            !isWebMcpToolName(rawToolName)
              ? `webmcp:${rawToolName}`
              : rawToolName;
          const webMcpTool = isWebMcpToolName(toolName);
          const tool = toolMessage.toolCall ?? { id: toolId, status: "pending" as const };
          tool.name = toolName;
          tool.args = payload.parameters;
          // WebMCP tools are executed asynchronously by the browser AFTER this
          // `step_await` arrives. Keep them running until session.ts resolves
          // the page tool and records its actual elapsed time. Other local
          // tools (for example ask_user_question) keep the existing complete
          // state because they are waiting for a user interaction, not an
          // automatic page-tool execution.
          tool.status = webMcpTool ? "running" : "complete";
          tool.chunks = tool.chunks ?? [];
          tool.startedAt =
            tool.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp ?? payload.awaitedAt);
          if (webMcpTool) {
            tool.completedAt = undefined;
            tool.duration = undefined;
            tool.durationMs = undefined;
          } else {
            tool.completedAt = tool.completedAt ?? tool.startedAt;
          }
          toolMessage.toolCall = tool;
          toolMessage.streaming = false;
          toolMessage.agentMetadata = {
            ...toolMessage.agentMetadata,
            executionId: (payload.executionId as string) ?? toolMessage.agentMetadata?.executionId,
            awaitingLocalTool: true,
            // Only set when the server emitted a real per-call id; its presence
            // is what tells session.ts to batch + key `/resume` by id rather
            // than by tool name (which can't represent two same-tool calls).
            ...(toolCallId ? { webMcpToolCallId: toolCallId } : {}),
          };
          emitMessage(toolMessage);
        } else if (payloadType === "text_start") {
          // Nested flow-as-tool text (PR #4602): a `parentToolCallId` means this
          // block belongs to a flow running as that tool — record the mapping and
          // leave the top-level assistant bubble untouched (the nested deltas route
          // into the parent tool's row).
          const startBlockId = typeof payload.id === "string" ? payload.id : null;
          const startParent =
            typeof payload.parentToolCallId === "string" && payload.parentToolCallId
              ? payload.parentToolCallId
              : null;
          if (startBlockId && startParent) {
            nestedBlockParent.set(startBlockId, startParent);
            continue;
          }
          // Unified text-channel block open. A new block id means a new bubble, so
          // seal any open assistant bubble; the next text_delta creates a fresh one
          // (lazily). The API emits a fresh block at every tool/media/approval/await
          // boundary, so block-id keying drives segmentation — no partId.
          const prev = assistantMessage as AgentWidgetMessage | null;
          if (prev) {
            // Normally text_complete already sealed the prior block; this is the
            // defensive path if a producer opens a new block without closing.
            if (executionKind === "flow") {
              finalizeFlowTextBlock(prev);
              lastSealedFlowBubble = prev;
            } else {
              prev.streaming = false;
              emitMessage(prev);
            }
            assistantMessage = null;
          }
          currentTextBlockId =
            typeof payload.id === "string" ? payload.id : currentTextBlockId;
          pendingFlowRaw = "";
        } else if (payloadType === "text_delta") {
          // Nested flow-as-tool text: route to the parent tool's row, through the
          // same structured-content parser, never the top-level assistant channel.
          const deltaBlockId = typeof payload.id === "string" ? payload.id : null;
          const nestedParent = deltaBlockId
            ? nestedBlockParent.get(deltaBlockId)
            : undefined;
          if (deltaBlockId && nestedParent) {
            const nestedDelta =
              typeof payload.delta === "string" ? payload.delta : "";
            const nestedRaw = (nestedBlockRaw.get(deltaBlockId) ?? "") + nestedDelta;
            nestedBlockRaw.set(deltaBlockId, nestedRaw);
            if (nestedRaw.trim() === "") continue;
            const nested = ensureNestedBlockMessage(deltaBlockId, nestedParent);
            nested.agentMetadata = {
              ...nested.agentMetadata,
              executionId: payload.executionId,
              parentToolId: nestedParent,
            };
            applyFlowTextChunk(nested, nestedRaw, nestedDelta, undefined);
            continue;
          }
          currentTextBlockId =
            typeof payload.id === "string" ? payload.id : currentTextBlockId;
          if (executionKind === "flow") {
            // Flow prompt-step text can be structured JSON: accumulate the raw
            // block and run it through the structured-content parser, keyed by the
            // block-id bubble. Materialize lazily so a whitespace-only block
            // (newlines around a tool boundary) never leaves a stray bubble.
            const delta = typeof payload.delta === "string" ? payload.delta : "";
            pendingFlowRaw += delta;
            if (pendingFlowRaw.trim() === "") continue;
            const assistant = ensureAssistantMessage();
            assistant.agentMetadata = {
              executionId: payload.executionId,
              iteration: payload.iteration,
            };
            applyFlowTextChunk(assistant, pendingFlowRaw, delta, undefined);
            lastAssistantInTurn = assistant;
            continue;
          }
          const assistant = ensureAssistantMessage();
          assistant.content += payload.delta ?? '';
          assistant.agentMetadata = {
            executionId: payload.executionId,
            iteration: payload.iteration,
            turnId: openTurnId ?? undefined,
            agentName: agentExecution?.agentName
          };
          lastAssistantInTurn = assistant;
          emitMessage(assistant);
        } else if (payloadType === "text_complete") {
          // Nested flow-as-tool text block close: seal its parent-tool-row message.
          const completeBlockId = typeof payload.id === "string" ? payload.id : null;
          if (completeBlockId && nestedBlockParent.has(completeBlockId)) {
            const nested = nestedBlockMessages.get(completeBlockId);
            if (nested) finalizeFlowTextBlock(nested);
            nestedBlockParent.delete(completeBlockId);
            nestedBlockRaw.delete(completeBlockId);
            nestedBlockMessages.delete(completeBlockId);
            continue;
          }
          // Seal the current text block's bubble.
          const prev = assistantMessage as AgentWidgetMessage | null;
          if (prev) {
            if (executionKind === "flow") {
              // Final structured extraction off the accumulated raw buffer; the
              // authoritative step_complete.result.response reconciles next.
              finalizeFlowTextBlock(prev);
              lastSealedFlowBubble = prev;
            } else {
              // U2: text_complete carries the assembled text, but the bubble already
              // holds it from the deltas — only fall back to payload.text when no
              // delta content was seen, never double-count.
              if ((prev.content ?? "") === "" && typeof payload.text === "string") {
                prev.content = payload.text;
              }
              prev.streaming = false;
              emitMessage(prev);
            }
            assistantMessage = null;
          }
          currentTextBlockId = null;
          pendingFlowRaw = "";
        } else if (payloadType === "step_complete") {
          // Only process completions for prompt steps, not tool/context steps
          const stepType = (payload as any).stepType;
          const executionType = (payload as any).executionType;
          if (stepType === "tool" || executionType === "context") {
            // Skip tool-related completions - they're handled by tool_complete
            continue;
          }

          // A failed step (`success:false`) — including the legacy `step_error`
          // event, which the wire encoder folds into a failed `step_complete`
          // — surfaces as a terminal error and finalizes the stream.
          if (payload.success === false) {
            const e = payload.error;
            const message =
              typeof e === "string" && e !== ""
                ? e
                : // Reflect.has, not `in`: the `in` operator inside an arrow body can
                  // be minified into a `for(init;;)` head, which Oxc mis-parses and
                  // Rolldown (Vite 8) silently emits as an empty chunk. Same
                  // [[HasProperty]] semantics. Enforced by scripts/check-dist-no-in-for-init.mjs.
                  e != null && typeof e === "object" && Reflect.has(e, "message")
                  ? String((e as { message?: unknown }).message ?? "Step failed")
                  : "Step failed";
            onEvent({ type: "error", error: new Error(message) });
            const finalMsg = assistantMessage as AgentWidgetMessage | null;
            if (finalMsg && finalMsg.streaming) {
              finalMsg.streaming = false;
              emitMessage(finalMsg);
            }
            onEvent({ type: "status", status: "idle" });
            continue;
          }

          // Unified flow: reconcile the just-sealed text block with the
          // authoritative structured final (`result.response`). Displayed content
          // stays as streamed — a multi-segment step keeps each bubble's own text;
          // reconcile only fills/repairs the last sealed block and sets rawContent.
          // A pure-tool / text-less step (no sealed flow bubble) completes silently.
          {
            const sealed = lastSealedFlowBubble;
            lastSealedFlowBubble = null;
            const flowStopReason = (payload as any).stopReason as
              | StopReasonKind
              | undefined;
            const finalResponse = payload.result?.response;
            if (sealed) {
              if (flowStopReason) sealed.stopReason = flowStopReason;
              if (finalResponse !== undefined && finalResponse !== null) {
                reconcileSealedAssistantWithFinalResponse(sealed, finalResponse);
              } else if (sealed.streaming !== false) {
                streamParsers.delete(sealed.id);
                rawContentBuffers.delete(sealed.id);
                sealed.streaming = false;
                emitMessage(sealed);
              }
            } else {
              // Buffered / dispatch-mode step: no streamed text block, but the step
              // carries the final response (and/or a stopReason) — render it as the
              // assistant message. An empty response + stopReason still surfaces a
              // sealed bubble so the UI can show an affordance.
              const hasResponse =
                finalResponse !== undefined &&
                finalResponse !== null &&
                finalResponse !== "";
              if (hasResponse || flowStopReason) {
                const assistant = ensureAssistantMessage();
                if (flowStopReason) assistant.stopReason = flowStopReason;
                if (hasResponse) {
                  finalizeFlowTextBlock(assistant, finalResponse);
                } else {
                  assistant.streaming = false;
                  emitMessage(assistant);
                }
              }
            }
            continue;
          }
        // ================================================================
        // Agent Loop Execution Events
        // ================================================================
        } else if (payloadType === "execution_start") {
          executionKind = payload.kind === "flow" ? "flow" : "agent";
          executionKindResolved = true;
          if (executionKind === "agent") {
            agentExecution = {
              executionId: payload.executionId,
              agentId: payload.agentId ?? 'virtual',
              agentName: payload.agentName ?? '',
              status: 'running',
              currentIteration: 0,
              maxTurns: payload.maxTurns ?? 1,
              startedAt: resolveTimestamp(payload.startedAt)
            };
          }
        } else if (payloadType === "turn_start") {
          // Unified collapsed `agent_iteration_*` into a denormalized `iteration`
          // field on the turn (merged spec §2). Reconstruct the per-iteration
          // message boundary the 'separate' renderer keys off: when the iteration
          // advances, seal the previous iteration's bubble and rotate to a new one.
          const iteration =
            typeof payload.iteration === "number" ? payload.iteration : lastIterationSeen;
          if (iteration !== lastIterationSeen) {
            if (agentExecution) agentExecution.currentIteration = iteration;
            if (iterationDisplay === 'separate' && iteration > 1) {
              const prevMsg = assistantMessage as AgentWidgetMessage | null;
              if (prevMsg) {
                prevMsg.streaming = false;
                emitMessage(prevMsg);
                agentIterationMessages.set(iteration - 1, prevMsg);
                assistantMessage = null;
              }
            }
            lastIterationSeen = iteration;
          }
          openTurnId = typeof payload.id === "string" ? payload.id : null;
          // Reset the per-turn assistant tracker. lastAssistantInTurn is used by
          // turn_complete to attach stopReason to the final text segment of the
          // turn even if that segment was sealed by an intervening tool boundary.
          lastAssistantInTurn = null;
        } else if (payloadType === "tool_input_delta") {
          // Streamed tool arguments (display-only; authoritative args ride
          // tool_input_complete / tool_start).
          const toolId = payload.toolCallId ?? toolContext.lastId;
          if (toolId) {
            const toolMessage = toolMessages.get(toolId);
            if (toolMessage?.toolCall) {
              toolMessage.toolCall.chunks = toolMessage.toolCall.chunks ?? [];
              toolMessage.toolCall.chunks.push(payload.delta ?? '');
              emitMessage(toolMessage);
            }
          }
        } else if (payloadType === "tool_input_complete") {
          // Authoritative args are set at tool_start; nothing to render here.
          continue;
        } else if (payloadType === "turn_complete") {
          // Reasoning is sealed by its own reasoning_complete on the wire
          // vocabulary; this only attaches the turn-level stopReason to the
          // assistant message produced by this turn. Falls back to
          // lastAssistantInTurn when the bubble was sealed at a tool boundary
          // mid-turn, so the notice still attaches to the final visible segment.
          const turnStopReason = (payload as any).stopReason as
            | StopReasonKind
            | undefined;
          const stopReasonTarget = assistantMessage ?? lastAssistantInTurn;
          if (turnStopReason && stopReasonTarget !== null) {
            const turnId = payload.id;
            const matchesTurn =
              !turnId || stopReasonTarget.agentMetadata?.turnId === turnId;
            if (matchesTurn) {
              stopReasonTarget.stopReason = turnStopReason;
              emitMessage(stopReasonTarget);
            }
          }
          if (openTurnId === payload.id) openTurnId = null;
        } else if (payloadType === "media_start") {
          // Open a media block; buffer fragments until media_complete.
          const id = String(payload.id);
          mediaBuffers.set(id, {
            mediaType: typeof payload.mediaType === "string" ? payload.mediaType : undefined,
            role: typeof payload.role === "string" ? payload.role : undefined,
            toolCallId: payload.toolCallId,
            parts: [],
          });
        } else if (payloadType === "media_delta") {
          const buf = mediaBuffers.get(String(payload.id));
          if (buf && typeof payload.delta === "string") buf.parts.push(payload.delta);
        } else if (payloadType === "media_complete") {
          // Reassemble the buffered media triad into a single AI SDK–aligned
          // `MediaContentPart`, then render it as a synthetic assistant message
          // inserted between the tool bubble and the next text turn:
          //   { type: 'media', data, mediaType }                // AI SDK v6: base64
          //   { type: 'image-url', url, mediaType? }            // AI SDK v3/v4
          //   { type: 'file-url', url, mediaType }              // AI SDK v3/v4
          const mediaBlockId = String(payload.id);
          const buf = mediaBuffers.get(mediaBlockId);
          mediaBuffers.delete(mediaBlockId);
          const completeMediaType =
            (typeof payload.mediaType === "string" ? payload.mediaType : undefined) ??
            buf?.mediaType ??
            "application/octet-stream";
          const completeData = typeof payload.data === "string" ? payload.data : undefined;
          const completeUrl =
            typeof payload.url === "string"
              ? payload.url
              : buf && buf.parts.length > 0
                ? buf.parts.join("")
                : undefined;
          let reconstructed: Record<string, unknown> | null = null;
          if (completeData) {
            reconstructed = { type: "media", data: completeData, mediaType: completeMediaType };
          } else if (completeUrl) {
            // The wire is mediaType-only; a URL part with no declared MIME
            // arrives as the bare bucket hint "image" (per the API encoder). Treat
            // that — and any real `image/*` — as a hosted image so we don't misroute
            // generated images into the file bucket.
            const lower = completeMediaType.toLowerCase();
            const isImage = lower === "image" || lower.startsWith("image/");
            reconstructed = {
              type: isImage ? "image-url" : "file-url",
              url: completeUrl,
              mediaType: completeMediaType,
            };
          }
          const mediaToolCallId = payload.toolCallId ?? buf?.toolCallId;
          const rawMedia = reconstructed ? [reconstructed] : [];
          const mediaContentParts: ContentPart[] = [];
          for (const part of rawMedia) {
            if (!part || typeof part !== "object") continue;
            const rec = part as Record<string, unknown>;
            const partType = typeof rec.type === "string" ? rec.type : undefined;

            // Resolve `(src, mediaType)` for the part.
            // RFC 7231 says MIME types are case-insensitive, so we canonicalize
            // to lowercase once here. That makes the `startsWith("image/")` /
            // `"audio/"` / `"video/"` bucket checks robust to upstream tools
            // that emit non-canonical casing like `Image/PNG`.
            const rawMediaType =
              typeof rec.mediaType === "string" ? rec.mediaType.toLowerCase() : "";
            let src: string | null = null;
            let mediaType = "";
            if (partType === "media") {
              const data = typeof rec.data === "string" ? rec.data : undefined;
              if (!data) continue;
              // Empty/missing mediaType yields `data:;base64,...` which RFC 2397
              // resolves to `text/plain`: stamp a default so the data URI is
              // well-formed and the part lands in the file bucket.
              mediaType = rawMediaType.length > 0 ? rawMediaType : "application/octet-stream";
              src = `data:${mediaType};base64,${data}`;
            } else if (partType === "image-url") {
              const url = typeof rec.url === "string" ? rec.url : undefined;
              if (!url) continue;
              mediaType = rawMediaType;
              src = url;
            } else if (partType === "file-url") {
              const url = typeof rec.url === "string" ? rec.url : undefined;
              if (!url) continue;
              mediaType = rawMediaType;
              src = url;
            } else {
              continue;
            }
            if (!src) continue;

            // Pick the right rendering bucket based on mediaType.
            if (partType === "image-url" || mediaType.startsWith("image/")) {
              mediaContentParts.push({
                type: "image",
                image: src,
                // Only a real MIME (`image/png`) is a usable mimeType; the bare
                // bucket hint "image" (a hosted URL with no declared type) is not.
                ...(mediaType.includes("/") ? { mimeType: mediaType } : {}),
              });
            } else if (mediaType.startsWith("audio/")) {
              mediaContentParts.push({
                type: "audio",
                audio: src,
                mimeType: mediaType,
              });
            } else if (mediaType.startsWith("video/")) {
              mediaContentParts.push({
                type: "video",
                video: src,
                mimeType: mediaType,
              });
            } else {
              const resolvedMediaType = mediaType || "application/octet-stream";
              mediaContentParts.push({
                type: "file",
                data: src,
                mimeType: resolvedMediaType,
                filename: filenameFromMediaType(resolvedMediaType),
              });
            }
          }

          if (mediaContentParts.length > 0) {
            // Uniquify per emission. A tool may emit multiple `agent_media`
            // events for the same `toolCallId` (e.g. streamed/batched media);
            // sharing an id would let `emitMessage` merge them by id and
            // overwrite the prior `contentParts`.
            const seq = nextSequence();
            const toolCallIdRaw = mediaToolCallId;
            const mediaIdSuffix =
              typeof toolCallIdRaw === "string" && toolCallIdRaw.length > 0
                ? `${toolCallIdRaw}-${seq}`
                : String(seq);
            const mediaMessage: AgentWidgetMessage = {
              id: `agent-media-${mediaIdSuffix}`,
              role: "assistant",
              content: "",
              contentParts: mediaContentParts,
              createdAt: new Date().toISOString(),
              streaming: false,
              sequence: seq,
              agentMetadata: {
                executionId: payload.executionId,
                // Media blocks carry no iteration of their own; stamp the
                // enclosing iteration tracked from turn/tool frames.
                iteration:
                  typeof payload.iteration === "number"
                    ? payload.iteration
                    : lastIterationSeen,
              },
            };
            emitMessage(mediaMessage);

            // Seal any in-flight assistant text bubble before splitting the
            // stream. Without this, an orphan bubble retains `streaming: true`
            // forever: `agent_complete` only finalizes the latest
            // `assistantMessage`, so the typing/caret indicator would stay on
            // the prior bubble even though no more deltas will arrive.
            const prevAssistant = assistantMessage as AgentWidgetMessage | null;
            if (prevAssistant) {
              prevAssistant.streaming = false;
              emitMessage(prevAssistant);
            }
            assistantMessage = null;
            assistantMessageRef.current = null;
          }
        } else if (payloadType === "execution_complete") {
          const kind = payload.kind ?? executionKind;
          if (kind === "agent" && agentExecution) {
            agentExecution.status = payload.success ? 'complete' : 'error';
            agentExecution.completedAt = resolveTimestamp(payload.completedAt);
            agentExecution.stopReason = payload.stopReason;
          }

          // Finalize any still-open assistant message. Per-step reconciliation
          // (step_complete.result.response) normally sealed the flow blocks
          // already; this is the defensive close for an unterminated block, and
          // for flow it runs the final structured extraction off the raw buffer.
          const finalMsg = assistantMessage as AgentWidgetMessage | null;
          if (finalMsg) {
            if (kind === "flow" && finalMsg.streaming !== false) {
              finalizeFlowTextBlock(finalMsg);
            } else {
              finalMsg.streaming = false;
              emitMessage(finalMsg);
            }
            assistantMessage = null;
          }
          currentTextBlockId = null;
          pendingFlowRaw = "";
          lastSealedFlowBubble = null;

          // `terminal: true` marks this as a graceful finish (not a drop). The
          // session uses it to distinguish the real end-of-turn from the plain
          // `idle` the dispatch wrappers emit in their `finally` when a durable
          // connection drops mid-stream (durable-reconnect drop detection).
          onEvent({ type: "status", status: "idle", terminal: true });
        } else if (payloadType === "execution_error") {
          // Terminal failure. The non-terminal `error` is handled
          // separately (recoverable → warn).
          const errorMessage = typeof payload.error === 'string'
            ? payload.error
            : payload.error?.message ?? 'Execution error';
          onEvent({
            type: "error",
            error: new Error(errorMessage)
          });
        } else if (payloadType === "ping") {
          // Keep-alive heartbeat - no action needed
        // ================================================================
        // Tool Approval Events
        // ================================================================
        } else if (payloadType === "approval_start") {
          const approvalId = payload.approvalId ?? `approval-${nextSequence()}`;
          const approvalMessage: AgentWidgetMessage = {
            id: `approval-${approvalId}`,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            streaming: false,
            variant: "approval",
            sequence: nextSequence(),
            approval: {
              id: approvalId,
              status: "pending",
              agentId: agentExecution?.agentId ?? 'virtual',
              executionId: payload.executionId ?? agentExecution?.executionId ?? '',
              toolName: payload.toolName ?? '',
              toolType: payload.toolType,
              description: payload.description ?? `Execute ${payload.toolName ?? 'tool'}`,
              ...(typeof payload.reason === "string" && payload.reason
                ? { reason: payload.reason }
                : {}),
              parameters: payload.parameters,
            },
          };
          emitMessage(approvalMessage);
        } else if (payloadType === "step_await" && payload.awaitReason === "approval_required") {
          const approvalId = payload.approvalId ?? `approval-${nextSequence()}`;
          const approvalMessage: AgentWidgetMessage = {
            id: `approval-${approvalId}`,
            role: "assistant",
            content: "",
            createdAt: new Date().toISOString(),
            streaming: false,
            variant: "approval",
            sequence: nextSequence(),
            approval: {
              id: approvalId,
              status: "pending",
              agentId: agentExecution?.agentId ?? 'virtual',
              executionId: payload.executionId ?? agentExecution?.executionId ?? '',
              toolName: payload.toolName ?? '',
              toolType: payload.toolType,
              description: payload.description ?? `Execute ${payload.toolName ?? 'tool'}`,
              ...(typeof payload.reason === "string" && payload.reason
                ? { reason: payload.reason }
                : {}),
              parameters: payload.parameters,
            },
          };
          emitMessage(approvalMessage);
        } else if (payloadType === "approval_complete") {
          const approvalId = payload.approvalId;
          if (approvalId) {
            // Find and update the existing approval message
            const approvalMessageId = `approval-${approvalId}`;
            const existingMessage: AgentWidgetMessage = {
              id: approvalMessageId,
              role: "assistant",
              content: "",
              createdAt: new Date().toISOString(),
              streaming: false,
              variant: "approval",
              sequence: nextSequence(),
              approval: {
                id: approvalId,
                status: (payload.decision as "approved" | "denied") ?? "approved",
                agentId: agentExecution?.agentId ?? 'virtual',
                executionId: payload.executionId ?? agentExecution?.executionId ?? '',
                toolName: payload.toolName ?? '',
                description: payload.description ?? '',
                resolvedAt: Date.now(),
              },
            };
            emitMessage(existingMessage);
          }
        } else if (
          payloadType === "artifact_start" ||
          payloadType === "artifact_delta" ||
          payloadType === "artifact_update" ||
          payloadType === "artifact_complete"
        ) {
          if (payloadType === "artifact_start") {
            const at = payload.artifactType as PersonaArtifactKind;
            const artId = String(payload.id);
            const artTitle = typeof payload.title === "string" ? payload.title : undefined;
            onEvent({
              type: "artifact_start",
              id: artId,
              artifactType: at,
              title: artTitle,
              component: typeof payload.component === "string" ? payload.component : undefined
            });
            artifactContent.set(artId, { markdown: "", title: artTitle });
            // Insert inline artifact reference card (skip if already present from transcript_insert)
            if (!artifactIdsWithCards.has(artId)) {
              artifactIdsWithCards.add(artId);
              const cardMsg: AgentWidgetMessage = {
                id: `artifact-ref-${artId}`,
                role: "assistant",
                content: "",
                createdAt: new Date().toISOString(),
                streaming: true,
                sequence: nextSequence(),
                rawContent: JSON.stringify({
                  component: "PersonaArtifactCard",
                  props: { artifactId: artId, title: artTitle, artifactType: at, status: "streaming" },
                }),
              };
              artifactCardMessages.set(artId, cardMsg);
              emitMessage(cardMsg);
            }
          } else if (payloadType === "artifact_delta") {
            const deltaId = String(payload.id);
            const deltaText = typeof payload.delta === "string" ? payload.delta : String(payload.delta ?? "");
            onEvent({
              type: "artifact_delta",
              id: deltaId,
              artDelta: deltaText
            });
            const acc = artifactContent.get(deltaId);
            if (acc) acc.markdown += deltaText;
          } else if (payloadType === "artifact_update") {
            const props =
              payload.props && typeof payload.props === "object" && !Array.isArray(payload.props)
                ? (payload.props as Record<string, unknown>)
                : {};
            onEvent({
              type: "artifact_update",
              id: String(payload.id),
              props,
              component: typeof payload.component === "string" ? payload.component : undefined
            });
          } else if (payloadType === "artifact_complete") {
            const artCompleteId = String(payload.id);
            onEvent({ type: "artifact_complete", id: artCompleteId });
            // Update the inline card to show completed state
            const refMsg = artifactCardMessages.get(artCompleteId);
            if (refMsg) {
              refMsg.streaming = false;
              try {
                const parsed = JSON.parse(refMsg.rawContent ?? "{}");
                if (parsed.props) {
                  parsed.props.status = "complete";
                  // Store markdown content in card props so download works after page refresh
                  const acc = artifactContent.get(artCompleteId);
                  if (acc?.markdown) {
                    parsed.props.markdown = acc.markdown;
                  }
                }
                refMsg.rawContent = JSON.stringify(parsed);
              } catch { /* ignore parse errors */ }
              artifactContent.delete(artCompleteId);
              emitMessage(refMsg);
              artifactCardMessages.delete(artCompleteId);
            }
          }
        } else if (payloadType === "transcript_insert") {
          const m = payload.message as Record<string, unknown> | undefined;
          if (!m || typeof m !== "object") {
            continue;
          }
          const id = String(m.id ?? `msg-${nextSequence()}`);
          const roleRaw = m.role;
          const role =
            roleRaw === "user" ? "user" : roleRaw === "system" ? "system" : "assistant";
          const msg: AgentWidgetMessage = {
            id,
            role,
            content: typeof m.content === "string" ? m.content : "",
            rawContent: typeof m.rawContent === "string" ? m.rawContent : undefined,
            createdAt:
              typeof m.createdAt === "string" ? m.createdAt : new Date().toISOString(),
            streaming: m.streaming === true,
            // Omit variant unless the stream specifies it. Do not default to `"assistant"`:
            // that value is truthy and skips the component-directive branch (`!message.variant` in ui.ts).
            ...(typeof m.variant === "string"
              ? { variant: m.variant as AgentWidgetMessage["variant"] }
              : {}),
            sequence: nextSequence()
          };
          emitMessage(msg);
          // Detect artifact references in transcript_insert to prevent duplicate auto-cards
          if (msg.rawContent) {
            try {
              const parsed = JSON.parse(msg.rawContent);
              const refArtId = parsed?.props?.artifactId;
              if (typeof refArtId === "string") {
                artifactIdsWithCards.add(refArtId);
              }
            } catch { /* not JSON or no artifactId */ }
          }
          assistantMessage = null;
          assistantMessageRef.current = null;
          streamParsers.delete(id);
          rawContentBuffers.delete(id);
        } else if (payloadType === "error") {
          // Unified non-terminal error (merged spec). A bare `error` is
          // recoverable by default — a transient notice such as "rate limited,
          // retrying" — and the execution continues, so it must NOT surface as a
          // fatal error or finalize the stream. The API routes terminal failures
          // through `execution_error`. Only an explicit `recoverable: false`
          // promotes an `error` to terminal.
          if (
            payload.recoverable === false &&
            payload.error != null &&
            payload.error !== ""
          ) {
            const errorMessage =
              typeof payload.error === "string"
                ? payload.error
                : (payload.error as { message?: unknown })?.message != null
                  ? String((payload.error as { message?: unknown }).message)
                  : "Execution error";
            onEvent({ type: "error", error: new Error(errorMessage) });
            const finalMsg = assistantMessage as AgentWidgetMessage | null;
            if (finalMsg && finalMsg.streaming) {
              finalMsg.streaming = false;
              emitMessage(finalMsg);
            }
            onEvent({ type: "status", status: "idle" });
          }
        } else if (
          payloadType === "step_error" ||
          payloadType === "dispatch_error" ||
          payloadType === "flow_error"
        ) {
          let resolvedError: Error | null = null;
          if (payload.error instanceof Error) {
            resolvedError = payload.error;
          } else if (payloadType === "dispatch_error") {
            const msg = payload.message ?? payload.error;
            if (msg != null && msg !== "") {
              resolvedError = new Error(String(msg));
            }
          } else {
            const e = payload.error;
            if (typeof e === "string" && e !== "") {
              resolvedError = new Error(e);
            } else if (e != null && typeof e === "object" && Reflect.has(e, "message")) {
              // Reflect.has, not `in` — see the note on the equivalent guard above.
              resolvedError = new Error(String((e as { message?: unknown }).message ?? e));
            }
          }

          if (resolvedError) {
            onEvent({ type: "error", error: resolvedError });
            const finalMsg = assistantMessage as AgentWidgetMessage | null;
            if (finalMsg && finalMsg.streaming) {
              finalMsg.streaming = false;
              emitMessage(finalMsg);
            }
            onEvent({ type: "status", status: "idle" });
          }
        }
      }
      seqReadyQueue.length = 0;
    };

    // eslint-disable-next-line no-constant-condition
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const events = buffer.split("\n\n");
      buffer = events.pop() ?? "";

      for (const event of events) {
        const lines = event.split("\n");
        let eventType = "message";
        let data = "";
        // Durable-reconnect cursor: the SSE `id:` line (the durable row seq).
        // Only durable, resumable agent executions stamp these (e.g. Claude
        // Managed agents, or any async/background run the backend persists and
        // can replay); other streams carry no cursor. We emit a `cursor`
        // event AFTER the frame is fully parsed and dispatched, so the session's
        // `lastEventId` only advances past frames it has actually applied, so the
        // happy path has no dupes against the server's `seq > after` replay.
        let frameId: string | null = null;

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            data += line.replace("data:", "").trim();
          } else if (line.startsWith("id:")) {
            frameId = line.slice(3).trim();
          }
        }

        const advanceCursor = () => {
          if (frameId !== null && frameId !== "") {
            onEvent({ type: "cursor", id: frameId });
          }
        };

        // A frame with an `id:` but no `data:` (e.g. a bare keepalive line) is
        // still a received durable row, so advance the cursor past it.
        if (!data) {
          advanceCursor();
          continue;
        }
        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch (error) {
          // Parse failure: the frame was NOT applied. Do NOT advance the cursor
          // so a reconnect re-fetches this row.
          onEvent({
            type: "error",
            error:
              error instanceof Error
                ? error
                : new Error("Failed to parse chat stream payload")
          });
          continue;
        }

        const payloadType =
          eventType !== "message" ? eventType : payload.type ?? "message";

        // Tap: capture raw SSE event for event stream inspector
        this.onSSEEvent?.(payloadType, payload);

        // If custom SSE event parser is provided, try it first
        if (this.parseSSEEvent) {
          // Keep assistant message ref in sync
          assistantMessageRef.current = assistantMessage;
          const handled = await this.handleCustomSSEEvent(
            payload,
            onEvent,
            assistantMessageRef,
            emitMessage,
            nextSequence,
            customParsePartId
          );
          // Update assistantMessage from ref (in case it was created or replaced by partId segmentation)
          if (assistantMessageRef.current && assistantMessageRef.current !== assistantMessage) {
            assistantMessage = assistantMessageRef.current;
          }
          if (handled) {
            advanceCursor();
            continue; // Skip default handling if custom handler processed it
          }
        }

        // The wire is the wire vocabulary; the handler consumes it
        // natively. The stream is single-connection and in order, so each frame
        // drains straight through.
        seqReadyQueue.push({ payloadType, payload });
        drainReadyQueue();
        advanceCursor();
      }
    }

    drainReadyQueue();
  }
}
