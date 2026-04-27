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
  ClientFeedbackRequest,
  ClientFeedbackType,
  PersonaArtifactKind
} from "./types";
import {
  extractTextFromJson,
  createPlainTextParser,
  createJsonStreamParser,
  createRegexJsonParser,
  createXmlParser
} from "./utils/formatting";
import { SequenceReorderBuffer } from "./utils/sequence-buffer";
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

  constructor(private config: AgentWidgetConfig = {}) {
    this.apiUrl = config.apiUrl ?? DEFAULT_ENDPOINT;
    this.headers = {
      "Content-Type": "application/json",
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
  }

  /**
   * Set callback for capturing raw SSE events
   */
  public setSSEEventCallback(callback: SSEEventCallback): void {
    this.onSSEEvent = callback;
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
   * Check if operating in agent execution mode
   */
  public isAgentMode(): boolean {
    return !!this.config.agent;
  }

  /**
   * Get the appropriate API URL based on mode
   */
  private getClientApiUrl(endpoint: 'init' | 'chat'): string {
    const baseUrl = this.config.apiUrl?.replace(/\/+$/, '').replace(/\/v1\/dispatch$/, '') || DEFAULT_CLIENT_API_BASE;
    return endpoint === 'init'
      ? `${baseUrl}/v1/client/init`
      : `${baseUrl}/v1/client/chat`;
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
      this.config.onSessionInit?.(session);
      return session;
    } finally {
      this.sessionInitPromise = null;
    }
  }

  private async _doInitSession(): Promise<ClientSession> {
    // Get stored session_id if available (for session resumption)
    const storedSessionId = this.config.getStoredSessionId?.() || null;
    
    const requestBody: Record<string, unknown> = {
      token: this.config.clientToken,
      ...(this.config.flowId && { flowId: this.config.flowId }),
      ...(storedSessionId && { sessionId: storedSessionId }),
    };

    const response = await fetch(this.getClientApiUrl('init'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
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

    const response = await fetch(this.getFeedbackApiUrl(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(feedback),
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
    if (this.isAgentMode()) {
      return this.dispatchAgent(options, onEvent);
    }
    if (this.isClientTokenMode()) {
      return this.dispatchClientToken(options, onEvent);
    }
    return this.dispatchProxy(options, onEvent);
  }

  /**
   * Client token mode dispatch
   */
  private async dispatchClientToken(options: DispatchOptions, onEvent: SSEHandler) {
    const controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

    onEvent({ type: "status", status: "connecting" });

    try {
      // Ensure session is initialized
      const session = await this.initSession();

      // Check if session is about to expire (within 1 minute)
      if (new Date() >= new Date(session.expiresAt.getTime() - 60000)) {
        // Session expired or expiring soon
        this.clientSession = null;
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
      
      const chatRequest: ClientChatRequest = {
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

      if (this.debug) {
        // eslint-disable-next-line no-console
        console.debug("[AgentWidgetClient] client token dispatch", chatRequest);
      }

      const response = await fetch(this.getClientApiUrl('chat'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(chatRequest),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Chat request failed' }));
        
        if (response.status === 401) {
          // Session expired
          this.clientSession = null;
          this.config.onSessionExpired?.();
          const error = new Error('Session expired. Please refresh to continue.');
          onEvent({ type: "error", error });
          throw error;
        }
        
        if (response.status === 429) {
          const error = new Error(errorData.hint || 'Message limit reached for this session.');
          onEvent({ type: "error", error });
          throw error;
        }
        
        const error = new Error(errorData.error || 'Failed to send message');
        onEvent({ type: "error", error });
        throw error;
      }

      if (!response.body) {
        const error = new Error('No response body received');
        onEvent({ type: "error", error });
        throw error;
      }

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
    const controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

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
            signal: controller.signal
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
        signal: controller.signal
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
    const controller = new AbortController();
    if (options.signal) {
      options.signal.addEventListener("abort", () => controller.abort());
    }

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
            signal: controller.signal
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
        signal: controller.signal
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
    assistantMessageId?: string
  ): Promise<void> {
    onEvent({ type: "status", status: "connected" });
    try {
      await this.streamResponse(body, onEvent, assistantMessageId);
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
   * Posts to the upstream `/resume` endpoint (the dispatch URL with
   * `/dispatch` replaced by `/resume` — works for both direct-to-Runtype
   * and the persona proxy) and returns the raw Response so the caller can
   * pipe its SSE body through `connectStream()`.
   *
   * @param executionId - The paused execution id carried on `step_await`.
   * @param toolOutputs - Map keyed by tool name → the tool's result value.
   */
  public async resumeFlow(
    executionId: string,
    toolOutputs: Record<string, unknown>,
    options?: { streamResponse?: boolean }
  ): Promise<Response> {
    const trimmed = this.config.apiUrl?.replace(/\/+$/, '') || DEFAULT_CLIENT_API_BASE;
    // Runtype mounts POST /resume as a child route of /v1/dispatch, so the
    // final URL is always `${apiUrl}/resume`. Proxies should follow the
    // same shape (`/api/chat/dispatch/resume`) to keep the widget agnostic.
    const url = `${trimmed}/resume`;

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
        executionId,
        toolOutputs,
        streamResponse: options?.streamResponse ?? true,
      }),
    });
  }

  private async buildAgentPayload(
    messages: AgentWidgetMessage[]
  ): Promise<AgentWidgetAgentRequestPayload> {
    if (!this.config.agent) {
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
      agent: this.config.agent,
      messages: normalizedMessages,
      options: {
        streamResponse: true,
        recordMode: 'virtual',
        ...this.config.agentOptions
      }
    };

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

    const payload: AgentWidgetRequestPayload = {
      messages: normalizedMessages,
      ...(this.config.flowId && { flowId: this.config.flowId })
    };

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
          return result as AgentWidgetRequestPayload;
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

        // Update partId tracking (only when partId is provided — backward compatible)
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
    assistantMessageId?: string
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

    const emitMessage = (msg: AgentWidgetMessage) => {
      onEvent({
        type: "message",
        message: cloneMessage(msg)
      });
    };

    let assistantMessage: AgentWidgetMessage | null = null;
    // Reference to track assistant message for custom event handler
    const assistantMessageRef = { current: null as AgentWidgetMessage | null };
    // Track current partId for message segmentation at tool boundaries
    const partIdState = { current: null as string | null };
    let didSplitByPartId = false;
    const reasoningMessages = new Map<string, AgentWidgetMessage>();
    const toolMessages = new Map<string, AgentWidgetMessage>();
    // Messages produced by steps inside a nested flow executed as a tool.
    // Keyed by `${parentToolId}::${nestedStepId}::${partId}` so each nested
    // step (send-stream, prompt) gets its own assistant message, and prompts
    // with inner tool calls split into one message per text segment — still
    // attributable to the parent tool call.
    const nestedStepMessages = new Map<string, AgentWidgetMessage>();
    // Most-recent partId seen for a given `${toolId}::${stepId}` scope, used
    // to seal the previous segment when a new partId arrives within the
    // same nested prompt step.
    const nestedPartIdByStep = new Map<string, string>();
    const reasoningContext = {
      lastId: null as string | null,
      byStep: new Map<string, string>()
    };
    const toolContext = {
      lastId: null as string | null,
      byCall: new Map<string, string>()
    };

    // Nested message key. partId defaults to "" so steps without segmentation
    // (e.g. send-stream) still have a deterministic single key.
    const getNestedStepKey = (
      toolId: string,
      stepId: string,
      partId: string = ""
    ) => `${toolId}::${stepId}::${partId}`;

    // Prefix used to sweep every nested message belonging to a single
    // (toolId, stepId) scope — needed on step_complete to seal any segments
    // that are still streaming.
    const getNestedStepPrefix = (toolId: string, stepId: string) =>
      `${toolId}::${stepId}::`;

    const ensureNestedStepMessage = (
      toolId: string,
      stepId: string,
      partId: string,
      executionId?: string
    ): AgentWidgetMessage => {
      const key = getNestedStepKey(toolId, stepId, partId);
      const existing = nestedStepMessages.get(key);
      if (existing) return existing;
      const idSuffix = partId ? `-${partId}` : "";
      const message: AgentWidgetMessage = {
        id: `nested-${toolId}-${stepId}${idSuffix}`,
        role: "assistant",
        content: "",
        createdAt: new Date().toISOString(),
        streaming: true,
        sequence: nextSequence(),
        ...(partId ? { partId } : {}),
        agentMetadata: {
          executionId,
          parentToolId: toolId,
          parentStepId: stepId,
        },
      };
      nestedStepMessages.set(key, message);
      emitMessage(message);
      return message;
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
      if (!assistantIdConsumed && baseAssistantId) {
        id = baseAssistantId;
        assistantIdConsumed = true;
      } else if (baseAssistantId && partIdState.current) {
        id = `${baseAssistantId}_${partIdState.current}`;
      } else {
        id = `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`;
      }
      assistantMessage = {
        id,
        role: "assistant",
        content: "",
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
    const assistantMessagesByPartId = new Map<string, AgentWidgetMessage>();
    // Only the most-recently sealed segment is reconciled with step_complete's
    // final response. Earlier segments rely on their own async parser microtasks
    // resolving via the closure-captured `assistant` variable.
    let lastSealedTextSegment: AgentWidgetMessage | null = null;

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
        // authoritative final (truncation). Do not use length alone — multi-segment
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

    // Sequence reorder buffer: SSE events carrying a `seq` (or `sequenceIndex`)
    // field are held and re-emitted in sequence order so that transport-level
    // reordering doesn't produce garbled output.
    const seqReadyQueue: Array<{ payloadType: string; payload: any }> = [];
    let isDrainScheduled = false;
    // Declared here so scheduleReadyQueueDrain can reference it; assigned
    // after all handler-scoped variables are initialised (before the SSE loop).
    let drainReadyQueue: () => void;
    // Two drain paths — both are intentional, do not remove either:
    //   1. Microtask drain (scheduleReadyQueueDrain): required when the
    //      buffer's emitter fires from the gap-timeout setTimeout callback,
    //      because there is no surrounding synchronous drain site there.
    //   2. Synchronous drain (drainReadyQueue() after each seqBuffer.push):
    //      skips an extra microtask hop on the hot in-order push path.
    const scheduleReadyQueueDrain = () => {
      if (isDrainScheduled) return;
      isDrainScheduled = true;
      queueMicrotask(() => {
        isDrainScheduled = false;
        drainReadyQueue();
      });
    };
    const seqBuffer = new SequenceReorderBuffer((payloadType: string, payload: any) => {
      seqReadyQueue.push({ payloadType, payload });
      scheduleReadyQueueDrain();
    });
    // Agent execution state tracking
    let agentExecution: AgentExecutionState | null = null;
    // Track assistant messages per agent iteration for 'separate' mode
    const agentIterationMessages = new Map<number, AgentWidgetMessage>();
    const iterationDisplay = this.config.iterationDisplay ?? 'separate';

    // Drains reorder-buffered events through the main event handler.
    // Also invoked after the SSE loop exits so any events buffered at
    // end-of-stream are processed.
    drainReadyQueue = () => {
      for (let i = 0; i < seqReadyQueue.length; i++) {
        const payloadType = seqReadyQueue[i].payloadType;
        const payload = seqReadyQueue[i].payload;

        if (payloadType === "reason_start") {
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
          reasoningMessage.streaming = true;
          reasoningMessage.reasoning.status = "streaming";
          emitMessage(reasoningMessage);
        } else if (payloadType === "reason_delta" || payloadType === "reason_chunk") {
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
        } else if (payloadType === "reason_complete") {
          const reasoningId =
            resolveReasoningId(payload, false) ??
            resolveReasoningId(payload, true) ??
            `reason-${nextSequence()}`;
          const reasoningMessage = reasoningMessages.get(reasoningId);
          if (reasoningMessage?.reasoning) {
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
          const toolId =
            resolveToolId(payload, true) ?? `tool-${nextSequence()}`;
          const toolName = payload.toolName ?? payload.name;
          // Suppress tool UI for artifact emit tools — artifacts are handled via artifact_* events
          if (isArtifactEmitToolName(toolName)) {
            artifactToolCallIds.add(toolId);
            continue;
          }
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId,
            status: "pending"
          };
          tool.name = toolName ?? tool.name;
          tool.status = "running";
          if (payload.args !== undefined) {
            tool.args = payload.args;
          } else if (payload.parameters !== undefined) {
            tool.args = payload.parameters;
          }
          tool.startedAt =
            tool.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          tool.completedAt = undefined;
          tool.durationMs = undefined;
          toolMessage.toolCall = tool;
          toolMessage.streaming = true;
          const agentCtx = payload.agentContext;
          if (agentCtx || payload.executionId) {
            toolMessage.agentMetadata = {
              executionId: agentCtx?.executionId ?? payload.executionId,
              iteration: agentCtx?.iteration ?? payload.iteration,
            };
          }
          emitMessage(toolMessage);
        } else if (payloadType === "tool_chunk" || payloadType === "tool_delta") {
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
        } else if (payloadType === "step_await" && payload.awaitReason === "local_tool_required" && payload.toolName) {
          // LOCAL tool pause. Runtype's prompt step throws LocalToolRequiredError
          // when the model calls a tool with `toolType: "local"`. The server
          // emits step_await with the tool name, params, and execution id; the
          // execution pauses until the client POSTs /resume with toolOutputs.
          //
          // Upsert a fully-populated tool-variant message so the existing
          // ask_user_question bubble + sheet paths fire. Mark the message with
          // `awaitingLocalTool: true` so the UI knows to resolve via
          // resumeFlow rather than the legacy sendMessage fallback.
          const toolId = (payload.toolId as string) ?? `local-${nextSequence()}`;
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? { id: toolId, status: "pending" as const };
          tool.name = payload.toolName as string;
          tool.args = payload.parameters;
          tool.status = "complete";
          tool.chunks = tool.chunks ?? [];
          tool.startedAt =
            tool.startedAt ?? resolveTimestamp(payload.startedAt ?? payload.timestamp);
          tool.completedAt = tool.completedAt ?? tool.startedAt;
          toolMessage.toolCall = tool;
          toolMessage.streaming = false;
          toolMessage.agentMetadata = {
            ...toolMessage.agentMetadata,
            executionId: (payload.executionId as string) ?? toolMessage.agentMetadata?.executionId,
            awaitingLocalTool: true,
          };
          emitMessage(toolMessage);
        } else if (payloadType === "text_start") {
          // Lifecycle event: a new text segment is beginning (emitted at tool boundaries).
          // When toolContext is present this fired inside a nested flow — it must not
          // seal or rotate the outer assistant message. Nested prompt segmentation is
          // handled via nestedStepMessages keyed by (toolId, stepId).
          if ((payload as any).toolContext?.toolId) {
            continue;
          }
          const incomingPartId = payload.partId;
          if (incomingPartId !== undefined && partIdState.current !== null && incomingPartId !== partIdState.current) {
            const prev = assistantMessage as AgentWidgetMessage | null;
            if (prev) {
              prev.streaming = false;
              emitMessage(prev);
              lastSealedTextSegment = prev;
              assistantMessage = null;
              didSplitByPartId = true;
            }
          }
          if (incomingPartId !== undefined) {
            partIdState.current = incomingPartId;
          }
        } else if (payloadType === "text_end") {
          // Lifecycle event: current text segment ended (tool call about to start).
          // When toolContext is present the boundary belongs to a nested flow — leave
          // outer assistant state alone so the outer stream is never interrupted by
          // nested activity.
          if ((payload as any).toolContext?.toolId) {
            continue;
          }
          // Seal the current assistant message so the next segment gets a new one
          const prev = assistantMessage as AgentWidgetMessage | null;
          if (prev) {
            prev.streaming = false;
            emitMessage(prev);
            lastSealedTextSegment = prev;
            assistantMessage = null;
            didSplitByPartId = true;
          }
        } else if (payloadType === "step_chunk" || payloadType === "step_delta") {
          // Only process chunks for prompt steps, not tool/context steps
          const stepType = (payload as any).stepType;
          const executionType = (payload as any).executionType;
          if (stepType === "tool" || executionType === "context") {
            // Skip tool-related chunks - they're handled by tool_start/tool_complete
            continue;
          }

          // Nested flow routing: when toolContext is present, this step_delta
          // originated inside a nested flow executed as a tool. Surface it as
          // its own assistant message keyed by the nested step id, so authors
          // who add send-stream / prompt steps inside their flow see them as
          // real messages in the timeline, in order — rather than merging
          // into the outer assistant bubble or getting buried in the tool
          // card. Each nested step id gets its own message; the parent tool
          // bubble continues to represent the invocation via tool_* events.
          const nestedToolCtx = (payload as any).toolContext as
            | { toolId?: string; stepId?: string; executionId?: string }
            | undefined;
          if (nestedToolCtx?.toolId) {
            const nestedStepId = String(
              payload.id ?? nestedToolCtx.stepId ?? `step-${nextSequence()}`
            );
            const incomingPartId =
              payload.partId !== undefined && payload.partId !== null
                ? String(payload.partId)
                : "";
            const stepScopeKey = `${nestedToolCtx.toolId}::${nestedStepId}`;
            const prevPartId = nestedPartIdByStep.get(stepScopeKey);

            // If partId changed within this nested step (prompt with inner
            // tool call emitting a new text segment), seal the previous
            // segment's message so each segment renders as its own bubble.
            if (
              incomingPartId !== "" &&
              prevPartId !== undefined &&
              prevPartId !== "" &&
              prevPartId !== incomingPartId
            ) {
              const prev = nestedStepMessages.get(
                getNestedStepKey(
                  nestedToolCtx.toolId,
                  nestedStepId,
                  prevPartId
                )
              );
              if (prev && prev.streaming !== false) {
                prev.streaming = false;
                emitMessage(prev);
              }
            }
            if (incomingPartId !== "") {
              nestedPartIdByStep.set(stepScopeKey, incomingPartId);
            }

            const nestedMsg = ensureNestedStepMessage(
              nestedToolCtx.toolId,
              nestedStepId,
              incomingPartId,
              nestedToolCtx.executionId
            );
            const nestedChunk =
              payload.text ??
              payload.delta ??
              payload.content ??
              payload.chunk ??
              "";
            if (nestedChunk) {
              nestedMsg.content += String(nestedChunk);
              nestedMsg.streaming = true;
              emitMessage(nestedMsg);
            }
            if (payload.isComplete) {
              nestedMsg.streaming = false;
              emitMessage(nestedMsg);
            }
            continue;
          }

          // partId-based segmentation: when partId changes, seal current message
          // and start a new one so text and tools render in chronological order
          const incomingPartId = payload.partId;
          if (incomingPartId !== undefined && partIdState.current !== null && incomingPartId !== partIdState.current) {
            const prev = assistantMessage as AgentWidgetMessage | null;
            if (prev) {
              prev.streaming = false;
              emitMessage(prev);
              lastSealedTextSegment = prev;
              assistantMessage = null;
              didSplitByPartId = true;
            }
          }
          if (incomingPartId !== undefined) {
            partIdState.current = incomingPartId;
          }

          const assistant =
            incomingPartId !== undefined
              ? (assistantMessagesByPartId.get(incomingPartId) ?? ensureAssistantMessage())
              : ensureAssistantMessage();
          if (incomingPartId !== undefined) {
            if (!assistant.partId) {
              assistant.partId = incomingPartId;
            }
            assistantMessagesByPartId.set(incomingPartId, assistant);
          }
          // Support various field names: text, delta, content, chunk (Runtype uses 'chunk')
          const chunk = payload.text ?? payload.delta ?? payload.content ?? payload.chunk ?? "";
          if (chunk) {
            // Accumulate raw content for structured format parsing.
            // Most out-of-order events are fixed at the dispatch layer, but once the
            // gap timeout flushes later seqs we can still see genuine late arrivals.
            // Rebuild chunked content by seq so those events repair prior output
            // instead of appending in the wrong position.
            const chunkSeq = typeof payload.seq === "number" ? payload.seq : undefined;
            const chunkBufferKey = incomingPartId ?? assistant.id;
            const accumulatedRaw =
              chunkSeq !== undefined
                ? insertOrderedChunk(chunkBufferKey, chunkSeq, String(chunk))
                : (rawContentBuffers.get(assistant.id) ?? "") + chunk;
            // Store raw content for action parsing, but NEVER set assistant.content to raw JSON
            assistant.rawContent = accumulatedRaw;
            
            // Use stream parser to parse
            if (!streamParsers.has(assistant.id)) {
              streamParsers.set(assistant.id, this.createStreamParser());
            }
            const parser = streamParsers.get(assistant.id)!;
            
            // Check if content looks like JSON
            const looksLikeJson = accumulatedRaw.trim().startsWith('{') || accumulatedRaw.trim().startsWith('[');
            
            // Store raw buffer before processing (needed for step_complete handler)
            if (looksLikeJson) {
              rawContentBuffers.set(assistant.id, accumulatedRaw);
            }
            
            // Check if this is a plain text parser (marked with __isPlainTextParser)
            const isPlainTextParser = (parser as any).__isPlainTextParser === true;
            
            // If plain text parser, just append the chunk directly
            if (isPlainTextParser) {
              assistant.content = chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
              // Clear any raw buffer/parser since we're in plain text mode
              rawContentBuffers.delete(assistant.id);
              streamParsers.delete(assistant.id);
              assistant.rawContent = undefined;
              emitMessage(assistant);
              continue;
            }
            
            // Try to parse with the parser (for structured parsers)
            const parsedResult = parser.processChunk(accumulatedRaw);
            
            // Handle async parser result
            if (parsedResult instanceof Promise) {
              parsedResult.then((result) => {
                // Extract text from result (could be string or object)
                const text = typeof result === 'string' ? result : result?.text ?? null;
                
                if (text !== null && text.trim() !== "") {
                  // Parser successfully extracted text — update the chunk's assistant
                  // (not assistantMessage; text_end may have cleared that ref before microtasks run)
                  assistant.content = text;
                  emitMessage(assistant);
                } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith('<')) {
                  // Not a structured format - show as plain text
                  const currentAssistant = assistantMessage;
                  const targetAssistant =
                    currentAssistant && currentAssistant.id === assistant.id
                      ? currentAssistant
                      : assistant;
                  if (targetAssistant.id === assistant.id) {
                    targetAssistant.content =
                      chunkSeq !== undefined ? accumulatedRaw : targetAssistant.content + chunk;
                    rawContentBuffers.delete(targetAssistant.id);
                    streamParsers.delete(targetAssistant.id);
                    targetAssistant.rawContent = undefined;
                    emitMessage(targetAssistant);
                  }
                }
                // Otherwise wait for more chunks (incomplete structured format)
                // Don't emit message if parser hasn't extracted text yet
              }).catch(() => {
                // On error, treat as plain text
                assistant.content =
                  chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
                rawContentBuffers.delete(assistant.id);
                streamParsers.delete(assistant.id);
                assistant.rawContent = undefined;
                emitMessage(assistant);
              });
            } else {
              // Synchronous parser result
              // Extract text from result (could be string, null, or object)
              const text = typeof parsedResult === 'string' ? parsedResult : parsedResult?.text ?? null;
              
              if (text !== null && text.trim() !== "") {
                // Parser successfully extracted text
                // Buffer is already set above
                assistant.content = text;
                emitMessage(assistant);
              } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith('<')) {
                // Not a structured format - show as plain text
                assistant.content =
                  chunkSeq !== undefined ? accumulatedRaw : assistant.content + chunk;
                // Clear any raw buffer/parser if we were in structured format mode
                rawContentBuffers.delete(assistant.id);
                streamParsers.delete(assistant.id);
                assistant.rawContent = undefined;
                emitMessage(assistant);
              }
              // Otherwise wait for more chunks (incomplete structured format)
              // Don't emit message if parser hasn't extracted text yet
            }
            
            // IMPORTANT: Don't call getExtractedText() and emit messages here
            // This was causing raw JSON to be displayed because getExtractedText() 
            // wasn't extracting the "text" field correctly during streaming
          }
          if (payload.isComplete) {
            const finalContent = payload.result?.response ?? assistant.content;
            if (finalContent) {
              // Check if we have raw content buffer that needs final processing
              const rawBuffer = rawContentBuffers.get(assistant.id);
              const contentToProcess = rawBuffer ?? ensureStringContent(finalContent);
              assistant.rawContent = contentToProcess;
              
              // Try to extract text from final structured content
              const parser = streamParsers.get(assistant.id);
              let extractedText: string | null = null;
              let asyncPending = false;
              
              if (parser) {
                // First check if parser already has extracted text
                extractedText = parser.getExtractedText();
                
                if (extractedText === null) {
                  // Try extracting with regex
                  extractedText = extractTextFromJson(contentToProcess);
                }
                
                if (extractedText === null) {
                  // Try parser.processChunk as last resort
                  const parsedResult = parser.processChunk(contentToProcess);
                  if (parsedResult instanceof Promise) {
                    asyncPending = true;
                    parsedResult.then((result) => {
                      // Extract text from result (could be string or object)
                      const text = typeof result === 'string' ? result : result?.text ?? null;
                      if (text !== null) {
                        const currentAssistant = assistantMessage;
                        if (currentAssistant && currentAssistant.id === assistant.id) {
                          currentAssistant.content = text;
                          currentAssistant.streaming = false;
                          // Clean up
                          streamParsers.delete(currentAssistant.id);
                          rawContentBuffers.delete(currentAssistant.id);
                          emitMessage(currentAssistant);
                        }
                      }
                    });
                  } else {
                    // Extract text from synchronous result
                    extractedText = typeof parsedResult === 'string' ? parsedResult : parsedResult?.text ?? null;
                  }
                }
              }
              
              // Skip sync emit if we're waiting on async parser
              if (!asyncPending) {
                // Set content: use extracted text if available, otherwise use raw content
                if (extractedText !== null && extractedText.trim() !== "") {
                  assistant.content = extractedText;
                } else if (!rawContentBuffers.has(assistant.id)) {
                  // Only use raw final content if we didn't accumulate chunks
                  assistant.content = ensureStringContent(finalContent);
                }
                
                // Clean up parser and buffer
                const parserToClose = streamParsers.get(assistant.id);
                if (parserToClose) {
                  const closeResult = parserToClose.close?.();
                  if (closeResult instanceof Promise) {
                    closeResult.catch(() => {});
                  }
                  streamParsers.delete(assistant.id);
                }
                rawContentBuffers.delete(assistant.id);
                assistant.streaming = false;
                emitMessage(assistant);
              }
            }
          }
        } else if (payloadType === "step_complete") {
          // Only process completions for prompt steps, not tool/context steps
          const stepType = (payload as any).stepType;
          const executionType = (payload as any).executionType;
          if (stepType === "tool" || executionType === "context") {
            // Skip tool-related completions - they're handled by tool_complete
            continue;
          }

          // Nested flow: seal every segment message produced by this nested
          // step (a single nested prompt step may have produced multiple
          // messages, one per partId, when inner tool calls split it). The
          // outer assistantMessage state is untouched so reconciliation for
          // the outer flow still works.
          const nestedCompleteCtx = (payload as any).toolContext as
            | { toolId?: string; stepId?: string; executionId?: string }
            | undefined;
          if (nestedCompleteCtx?.toolId) {
            const nestedStepId = String(
              payload.id ?? nestedCompleteCtx.stepId ?? ""
            );
            if (nestedStepId) {
              const prefix = getNestedStepPrefix(
                nestedCompleteCtx.toolId,
                nestedStepId
              );
              for (const [key, msg] of nestedStepMessages) {
                if (key.startsWith(prefix) && msg.streaming !== false) {
                  msg.streaming = false;
                  emitMessage(msg);
                }
              }
              nestedPartIdByStep.delete(
                `${nestedCompleteCtx.toolId}::${nestedStepId}`
              );
            }
            continue;
          }

          // Capture optional per-step stopReason emitted by the runtime
          // (e.g. `'max_tool_calls'`, `'length'`). This is the dispatch-mode
          // fallback — `agent_turn_complete` will overwrite it later in
          // agent-loop streams.
          const stepStopReason = (payload as any).stopReason as
            | StopReasonKind
            | undefined;

          if (didSplitByPartId) {
            // Sealed segment(s) — do not create a second bubble from step_complete.
            // Merge authoritative final response into the last sealed segment (fixes async lag).
            if (assistantMessage !== null) {
              const msg: AgentWidgetMessage = assistantMessage;
              if (stepStopReason) msg.stopReason = stepStopReason;
              streamParsers.delete(msg.id);
              rawContentBuffers.delete(msg.id);
              if (msg.streaming !== false) {
                msg.streaming = false;
                emitMessage(msg);
              }
            }
            const splitFinalContent = payload.result?.response;
            const sealedForReconcile = lastSealedTextSegment;
            if (sealedForReconcile) {
              if (stepStopReason) sealedForReconcile.stopReason = stepStopReason;
              if (splitFinalContent !== undefined && splitFinalContent !== null) {
                reconcileSealedAssistantWithFinalResponse(sealedForReconcile, splitFinalContent);
              } else {
                streamParsers.delete(sealedForReconcile.id);
                rawContentBuffers.delete(sealedForReconcile.id);
              }
            }
            lastSealedTextSegment = null;
            continue;
          }
          const finalContent = payload.result?.response;
          const assistant = ensureAssistantMessage();
          if (stepStopReason) assistant.stopReason = stepStopReason;
          if (finalContent !== undefined && finalContent !== null) {
            // Check if we already have extracted text from streaming
            const parser = streamParsers.get(assistant.id);
            let hasExtractedText = false;
            let asyncPending = false;
            
            if (parser) {
              // First check if parser already extracted text during streaming
              const currentExtractedText = parser.getExtractedText();
              const rawBuffer = rawContentBuffers.get(assistant.id);
              const contentToProcess = rawBuffer ?? ensureStringContent(finalContent);
              
              // Always set rawContent so action parsers can access the raw JSON
              assistant.rawContent = contentToProcess;
              
              if (currentExtractedText !== null && currentExtractedText.trim() !== "") {
                // We already have extracted text from streaming - use it
                assistant.content = currentExtractedText;
                hasExtractedText = true;
              } else {
                // No extracted text yet - try to extract from final content
                
                // Try fast path first
                const extractedText = extractTextFromJson(contentToProcess);
                if (extractedText !== null) {
                  assistant.content = extractedText;
                  hasExtractedText = true;
                } else {
                  // Try parser
                  const parsedResult = parser.processChunk(contentToProcess);
                  if (parsedResult instanceof Promise) {
                    asyncPending = true;
                    parsedResult.then((result) => {
                      // Extract text from result (could be string or object)
                      const text = typeof result === 'string' ? result : result?.text ?? null;
                      
                      if (text !== null && text.trim() !== "") {
                        const currentAssistant = assistantMessage;
                        if (currentAssistant && currentAssistant.id === assistant.id) {
                          currentAssistant.content = text;
                          currentAssistant.streaming = false;
                          // Clean up
                          streamParsers.delete(currentAssistant.id);
                          rawContentBuffers.delete(currentAssistant.id);
                          emitMessage(currentAssistant);
                        }
                      } else {
                        // No extracted text - check if we should show raw content
                        const finalExtractedText = parser.getExtractedText();
                        const currentAssistant = assistantMessage;
                        if (currentAssistant && currentAssistant.id === assistant.id) {
                          if (finalExtractedText !== null && finalExtractedText.trim() !== "") {
                            currentAssistant.content = finalExtractedText;
                          } else if (!rawContentBuffers.has(currentAssistant.id)) {
                            // Only show raw content if we never had any extracted text
                            currentAssistant.content = ensureStringContent(finalContent);
                          }
                          currentAssistant.streaming = false;
                          // Clean up
                          streamParsers.delete(currentAssistant.id);
                          rawContentBuffers.delete(currentAssistant.id);
                          emitMessage(currentAssistant);
                        }
                      }
                    });
                  } else {
                    // Extract text from synchronous result
                    const text = typeof parsedResult === 'string' ? parsedResult : parsedResult?.text ?? null;
                    
                    if (text !== null && text.trim() !== "") {
                      assistant.content = text;
                      hasExtractedText = true;
                    } else {
                      // Check stub one more time
                      const finalExtractedText = parser.getExtractedText();
                      if (finalExtractedText !== null && finalExtractedText.trim() !== "") {
                        assistant.content = finalExtractedText;
                        hasExtractedText = true;
                      }
                    }
                  }
                }
              }
            }
            
            // Skip sync emit if we're waiting on async parser
            if (!asyncPending) {
              // Ensure rawContent is set even if there's no parser (for action parsing)
              if (!assistant.rawContent) {
                const rawBuffer = rawContentBuffers.get(assistant.id);
                assistant.rawContent = rawBuffer ?? ensureStringContent(finalContent);
              }
              
              // Only show raw content if we never extracted any text and no buffer was used
              if (!hasExtractedText && !rawContentBuffers.has(assistant.id)) {
                // No extracted text and no streaming happened - show raw content
                assistant.content = ensureStringContent(finalContent);
              }
              
              // Clean up parser and buffer
              if (parser) {
                const closeResult = parser.close?.();
                if (closeResult instanceof Promise) {
                  closeResult.catch(() => {});
                }
              }
              streamParsers.delete(assistant.id);
              rawContentBuffers.delete(assistant.id);
              assistant.streaming = false;
              emitMessage(assistant);
            }
          } else {
            // No final content, just mark as complete and clean up
            streamParsers.delete(assistant.id);
            rawContentBuffers.delete(assistant.id);
            assistant.streaming = false;
            emitMessage(assistant);
          }
        } else if (payloadType === "flow_complete") {
          const finalContent = payload.result?.response;
          if (didSplitByPartId) {
            // Content was split into multiple assistant messages — the full response
            // in flow_complete would overwrite the last segment. Just finalize streaming.
            if (assistantMessage !== null) {
              const msg: AgentWidgetMessage = assistantMessage;
              streamParsers.delete(msg.id);
              rawContentBuffers.delete(msg.id);
              if (msg.streaming !== false) {
                msg.streaming = false;
                emitMessage(msg);
              }
            }
          } else if (finalContent !== undefined && finalContent !== null) {
            const assistant = ensureAssistantMessage();
            // Check if we have raw content buffer that needs final processing
            const rawBuffer = rawContentBuffers.get(assistant.id);
            const stringContent = rawBuffer ?? ensureStringContent(finalContent);
            assistant.rawContent = stringContent;
            // Try to extract text from structured content
            let displayContent = ensureStringContent(finalContent);
            const parser = streamParsers.get(assistant.id);
            if (parser) {
              const extractedText = extractTextFromJson(stringContent);
              if (extractedText !== null) {
                displayContent = extractedText;
              } else {
                // Try parser if it exists
                const parsedResult = parser.processChunk(stringContent);
                if (parsedResult instanceof Promise) {
                  parsedResult.then((result) => {
                    // Extract text from result (could be string or object)
                    const text = typeof result === 'string' ? result : result?.text ?? null;
                    if (text !== null) {
                      assistant.content = text;
                      assistant.streaming = false;
                      emitMessage(assistant);
                    }
                  });
                }
                const currentText = parser.getExtractedText();
                if (currentText !== null) {
                  displayContent = currentText;
                }
              }
            }
            // Clean up parser and buffer
            streamParsers.delete(assistant.id);
            rawContentBuffers.delete(assistant.id);

            // Only emit if something actually changed to avoid flicker
            const contentChanged = displayContent !== assistant.content;
            const streamingChanged = assistant.streaming !== false;
            
            if (contentChanged) {
              assistant.content = displayContent;
            }
            assistant.streaming = false;
            
            // Only emit if content or streaming state changed
            if (contentChanged || streamingChanged) {
              emitMessage(assistant);
            }
          } else {
            // No final content, just mark as complete and clean up
            if (assistantMessage !== null) {
              // Clean up any remaining parsers/buffers
              // TypeScript narrowing issue - assistantMessage is checked for null above
              const msg: AgentWidgetMessage = assistantMessage;
              streamParsers.delete(msg.id);
              rawContentBuffers.delete(msg.id);
              // Only emit if streaming state changed
              if (msg.streaming !== false) {
                msg.streaming = false;
                emitMessage(msg);
              }
            }
          }
          onEvent({ type: "status", status: "idle" });
        // ================================================================
        // Agent Loop Execution Events
        // ================================================================
        } else if (payloadType === "agent_start") {
          agentExecution = {
            executionId: payload.executionId,
            agentId: payload.agentId ?? 'virtual',
            agentName: payload.agentName ?? '',
            status: 'running',
            currentIteration: 0,
            maxTurns: payload.maxTurns ?? 1,
            startedAt: resolveTimestamp(payload.startedAt)
          };
        } else if (payloadType === "agent_iteration_start") {
          if (agentExecution) {
            agentExecution.currentIteration = payload.iteration;
          }

          // In 'separate' mode, finalize previous iteration's message and create a new one
          if (iterationDisplay === 'separate' && payload.iteration > 1) {
            const prevMsg = assistantMessage as AgentWidgetMessage | null;
            if (prevMsg) {
              prevMsg.streaming = false;
              emitMessage(prevMsg);
              // Store the completed message for this iteration
              agentIterationMessages.set(payload.iteration - 1, prevMsg);
              // Reset assistant message so ensureAssistantMessage creates a new one
              assistantMessage = null;
            }
          }
        } else if (payloadType === "agent_turn_start") {
          // Nothing to do - turn tracking is handled by deltas
        } else if (payloadType === "agent_turn_delta") {
          if (payload.contentType === 'text') {
            // Stream text to assistant message
            const assistant = ensureAssistantMessage();
            assistant.content += payload.delta ?? '';
            assistant.agentMetadata = {
              executionId: payload.executionId,
              iteration: payload.iteration,
              turnId: payload.turnId,
              agentName: agentExecution?.agentName
            };
            emitMessage(assistant);
          } else if (payload.contentType === 'thinking') {
            // Stream thinking content to a reasoning message
            const reasoningId = payload.turnId ?? `agent-think-${payload.iteration}`;
            const reasoningMessage = ensureReasoningMessage(reasoningId);
            reasoningMessage.reasoning = reasoningMessage.reasoning ?? {
              id: reasoningId,
              status: "streaming",
              chunks: []
            };
            reasoningMessage.reasoning.chunks.push(payload.delta ?? '');
            reasoningMessage.agentMetadata = {
              executionId: payload.executionId,
              iteration: payload.iteration,
              turnId: payload.turnId
            };
            emitMessage(reasoningMessage);
          } else if (payload.contentType === 'tool_input') {
            // Stream tool input to current tool message
            const toolId = payload.toolCallId ?? toolContext.lastId;
            if (toolId) {
              const toolMessage = toolMessages.get(toolId);
              if (toolMessage?.toolCall) {
                toolMessage.toolCall.chunks = toolMessage.toolCall.chunks ?? [];
                toolMessage.toolCall.chunks.push(payload.delta ?? '');
                emitMessage(toolMessage);
              }
            }
          }
        } else if (payloadType === "agent_turn_complete") {
          // Mark any active reasoning for this turn as complete
          const reasoningId = payload.turnId;
          if (reasoningId) {
            const reasoningMessage = reasoningMessages.get(reasoningId);
            if (reasoningMessage?.reasoning) {
              reasoningMessage.reasoning.status = "complete";
              reasoningMessage.reasoning.completedAt = resolveTimestamp(payload.completedAt);
              const start = reasoningMessage.reasoning.startedAt ?? Date.now();
              reasoningMessage.reasoning.durationMs = Math.max(
                0,
                (reasoningMessage.reasoning.completedAt ?? Date.now()) - start
              );
              reasoningMessage.streaming = false;
              emitMessage(reasoningMessage);
            }
          }

          // Attach the turn-level stopReason to the assistant message
          // produced by this turn. Only overwrite the current message —
          // prior turns already sealed their own stopReason via step_complete.
          const turnStopReason = (payload as any).stopReason as
            | StopReasonKind
            | undefined;
          if (turnStopReason && assistantMessage !== null) {
            const turnId = payload.turnId;
            const matchesTurn =
              !turnId || assistantMessage.agentMetadata?.turnId === turnId;
            if (matchesTurn) {
              assistantMessage.stopReason = turnStopReason;
              emitMessage(assistantMessage);
            }
          }
        } else if (payloadType === "agent_tool_start") {
          const toolId = payload.toolCallId ?? `agent-tool-${nextSequence()}`;
          trackToolId(getToolCallKey(payload), toolId);
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId, status: "pending" as const,
            name: undefined, args: undefined, chunks: undefined,
            result: undefined, duration: undefined, startedAt: undefined,
            completedAt: undefined, durationMs: undefined
          };
          tool.name = payload.toolName ?? payload.name ?? tool.name;
          tool.status = "running";
          if (payload.parameters !== undefined) {
            tool.args = payload.parameters;
          }
          tool.startedAt = resolveTimestamp(payload.startedAt ?? payload.timestamp);
          toolMessage.toolCall = tool;
          toolMessage.streaming = true;
          toolMessage.agentMetadata = {
            executionId: payload.executionId,
            iteration: payload.iteration
          };
          emitMessage(toolMessage);
        } else if (payloadType === "agent_tool_delta") {
          const toolId = payload.toolCallId ?? toolContext.lastId;
          if (toolId) {
            const toolMessage = toolMessages.get(toolId) ?? ensureToolMessage(toolId);
            if (toolMessage.toolCall) {
              toolMessage.toolCall.chunks = toolMessage.toolCall.chunks ?? [];
              toolMessage.toolCall.chunks.push(payload.delta ?? '');
              toolMessage.toolCall.status = "running";
              toolMessage.streaming = true;
              emitMessage(toolMessage);
            }
          }
        } else if (payloadType === "agent_tool_complete") {
          const toolId = payload.toolCallId ?? toolContext.lastId;
          if (toolId) {
            const toolMessage = toolMessages.get(toolId) ?? ensureToolMessage(toolId);
            if (toolMessage.toolCall) {
              toolMessage.toolCall.status = "complete";
              if (payload.result !== undefined) {
                toolMessage.toolCall.result = payload.result;
              }
              if (typeof payload.executionTime === "number") {
                toolMessage.toolCall.durationMs = payload.executionTime;
              }
              toolMessage.toolCall.completedAt = resolveTimestamp(payload.completedAt ?? payload.timestamp);
              toolMessage.streaming = false;
              emitMessage(toolMessage);
              const callKey = getToolCallKey(payload);
              if (callKey) {
                toolContext.byCall.delete(callKey);
              }
            }
          }
        } else if (payloadType === "agent_iteration_complete") {
          // Iteration complete - no special handling needed
          // In 'separate' mode, message finalization happens at next iteration_start
        } else if (payloadType === "agent_reflection" || payloadType === "agent_reflect") {
          // Create a reasoning message for reflection content
          const reflectionId = `agent-reflection-${payload.executionId}-${payload.iteration}`;
          const reflectionMessage: AgentWidgetMessage = {
            id: reflectionId,
            role: "assistant",
            content: payload.reflection ?? '',
            createdAt: new Date().toISOString(),
            streaming: false,
            variant: "reasoning",
            sequence: nextSequence(),
            reasoning: {
              id: reflectionId,
              status: "complete",
              chunks: [payload.reflection ?? '']
            },
            agentMetadata: {
              executionId: payload.executionId,
              iteration: payload.iteration
            }
          };
          emitMessage(reflectionMessage);
        } else if (payloadType === "agent_complete") {
          if (agentExecution) {
            agentExecution.status = payload.success ? 'complete' : 'error';
            agentExecution.completedAt = resolveTimestamp(payload.completedAt);
            agentExecution.stopReason = payload.stopReason;
          }

          // Finalize the current assistant message
          const finalMsg = assistantMessage as AgentWidgetMessage | null;
          if (finalMsg) {
            finalMsg.streaming = false;
            emitMessage(finalMsg);
          }

          onEvent({ type: "status", status: "idle" });
        } else if (payloadType === "agent_error") {
          const errorMessage = typeof payload.error === 'string'
            ? payload.error
            : payload.error?.message ?? 'Agent execution error';
          if (payload.recoverable) {
            if (typeof console !== "undefined") {
              // eslint-disable-next-line no-console
              console.warn("[AgentWidget] Recoverable agent error:", errorMessage);
            }
          } else {
            onEvent({
              type: "error",
              error: new Error(errorMessage)
            });
          }
        } else if (payloadType === "agent_ping") {
          // Keep-alive heartbeat - no action needed
        // ================================================================
        // Tool Approval Events
        // ================================================================
        } else if (payloadType === "agent_approval_start") {
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
              parameters: payload.parameters,
            },
          };
          emitMessage(approvalMessage);
        } else if (payloadType === "agent_approval_complete") {
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
        } else if (
          payloadType === "error" ||
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
          } else if (
            payloadType === "step_error" ||
            payloadType === "flow_error"
          ) {
            const e = payload.error;
            if (typeof e === "string" && e !== "") {
              resolvedError = new Error(e);
            } else if (e != null && typeof e === "object" && "message" in e) {
              resolvedError = new Error(String((e as { message?: unknown }).message ?? e));
            }
          } else if (payloadType === "error" && payload.error != null && payload.error !== "") {
            resolvedError = new Error(String(payload.error));
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

        for (const line of lines) {
          if (line.startsWith("event:")) {
            eventType = line.replace("event:", "").trim();
          } else if (line.startsWith("data:")) {
            data += line.replace("data:", "").trim();
          }
        }

        if (!data) continue;
        let payload: any;
        try {
          payload = JSON.parse(data);
        } catch (error) {
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
            partIdState
          );
          // Update assistantMessage from ref (in case it was created or replaced by partId segmentation)
          if (assistantMessageRef.current && assistantMessageRef.current !== assistantMessage) {
            assistantMessage = assistantMessageRef.current;
          }
          if (handled) continue; // Skip default handling if custom handler processed it
        }

        // Push through the sequence reorder buffer
        seqBuffer.push(payloadType, payload);
        drainReadyQueue();
      }
    }

    seqBuffer.flushPending();
    drainReadyQueue();
    seqBuffer.destroy();
  }
}
