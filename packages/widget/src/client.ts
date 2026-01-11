import {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetEvent,
  AgentWidgetStreamParser,
  AgentWidgetContextProvider,
  AgentWidgetRequestMiddleware,
  AgentWidgetRequestPayload,
  AgentWidgetCustomFetch,
  AgentWidgetSSEEventParser,
  AgentWidgetHeadersFunction,
  AgentWidgetSSEEventResult,
  ClientSession,
  ClientInitResponse,
  ClientChatRequest,
  ClientFeedbackRequest,
  ClientFeedbackType
} from "./types";
import { 
  extractTextFromJson, 
  createPlainTextParser,
  createJsonStreamParser,
  createRegexJsonParser,
  createXmlParser
} from "./utils/formatting";

type DispatchOptions = {
  messages: AgentWidgetMessage[];
  signal?: AbortSignal;
  /** Pre-generated ID for the expected assistant response (for feedback tracking) */
  assistantMessageId?: string;
};

type SSEHandler = (event: AgentWidgetEvent) => void;

const DEFAULT_ENDPOINT = "https://api.travrse.ai/v1/dispatch";
const DEFAULT_CLIENT_API_BASE = "https://api.travrse.ai";

/**
 * Check if a message has valid (non-empty) content for sending to the API.
 * Filters out messages with empty content that would cause validation errors.
 *
 * @see https://github.com/anthropics/claude-code/issues/XXX - Empty assistant messages from failed requests
 */
const hasValidContent = (message: AgentWidgetMessage): boolean => {
  // Check contentParts (multi-modal content)
  if (message.contentParts && message.contentParts.length > 0) {
    return true;
  }
  // Check rawContent
  if (message.rawContent && message.rawContent.trim().length > 0) {
    return true;
  }
  // Check content
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
   * Check if running in client token mode
   */
  public isClientTokenMode(): boolean {
    return !!this.config.clientToken;
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
      ...(this.config.flowId && { flow_id: this.config.flowId }),
      ...(storedSessionId && { session_id: storedSessionId }),
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
    
    // Store the new session_id for future resumption
    if (this.config.setStoredSessionId) {
      this.config.setStoredSessionId(data.session_id);
    }
    
    return {
      sessionId: data.session_id,
      expiresAt: new Date(data.expires_at),
      flow: data.flow,
      config: {
        welcomeMessage: data.config.welcome_message,
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
   *   session_id: sessionId,
   *   message_id: messageId,
   *   type: 'upvote'
   * });
   * 
   * // CSAT feedback (1-5 rating)
   * await client.sendFeedback({
   *   session_id: sessionId,
   *   type: 'csat',
   *   rating: 5,
   *   comment: 'Great experience!'
   * });
   * 
   * // NPS feedback (0-10 rating)
   * await client.sendFeedback({
   *   session_id: sessionId,
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

    // Validate message_id is provided for message-level feedback types
    const messageFeedbackTypes: ClientFeedbackType[] = ['upvote', 'downvote', 'copy'];
    if (messageFeedbackTypes.includes(feedback.type) && !feedback.message_id) {
      throw new Error(`message_id is required for ${feedback.type} feedback type`);
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
      session_id: session.sessionId,
      message_id: messageId,
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
      session_id: session.sessionId,
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
      session_id: session.sessionId,
      type: 'nps',
      rating,
      comment,
    });
  }

  /**
   * Send a message - handles both proxy and client token modes
   */
  public async dispatch(options: DispatchOptions, onEvent: SSEHandler) {
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
      // Filter out session_id from metadata if present (it's only for local storage)
      const sanitizedMetadata = basePayload.metadata 
        ? Object.fromEntries(
            Object.entries(basePayload.metadata).filter(([key]) => key !== 'session_id')
          )
        : undefined;
      
      const chatRequest: ClientChatRequest = {
        session_id: session.sessionId,
        // Filter out messages with empty content to prevent validation errors
        messages: options.messages.filter(hasValidContent).map(m => ({
          id: m.id, // Include message ID for tracking
          role: m.role,
          // Use contentParts for multi-modal messages, otherwise fall back to string content
          content: m.contentParts ?? m.rawContent ?? m.content,
        })),
        // Include pre-generated assistant message ID if provided
        ...(options.assistantMessageId && { assistant_message_id: options.assistantMessageId }),
        // Include metadata/context from middleware if present (excluding session_id)
        ...(sanitizedMetadata && Object.keys(sanitizedMetadata).length > 0 && { metadata: sanitizedMetadata }),
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
        // Use contentParts for multi-modal messages, otherwise fall back to string content
        content: message.contentParts ?? message.rawContent ?? message.content,
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
    nextSequence: () => number
  ): Promise<boolean> {
    if (!this.parseSSEEvent) return false;

    try {
      const result = await this.parseSSEEvent(payload);
      if (result === null) return false; // Event should be ignored

      const ensureAssistant = () => {
        if (assistantMessageRef.current) return assistantMessageRef.current;
        const msg: AgentWidgetMessage = {
          id: `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          role: "assistant",
          content: "",
          createdAt: new Date().toISOString(),
          streaming: true,
          variant: "assistant",
          sequence: nextSequence()
        };
        assistantMessageRef.current = msg;
        emitMessage(msg);
        return msg;
      };

      if (result.text !== undefined) {
        const assistant = ensureAssistant();
        assistant.content += result.text;
        emitMessage(assistant);
      }

      if (result.done) {
        if (assistantMessageRef.current) {
          assistantMessageRef.current.streaming = false;
          emitMessage(assistantMessageRef.current);
        }
        onEvent({ type: "status", status: "idle" });
      }

      if (result.error) {
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

    const ensureAssistantMessage = () => {
      if (assistantMessage) return assistantMessage;
      assistantMessage = {
        // Use pre-generated ID if provided, otherwise generate one
        id: assistantMessageId ?? `assistant-${Date.now()}-${Math.random().toString(16).slice(2)}`,
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

        // If custom SSE event parser is provided, try it first
        if (this.parseSSEEvent) {
          // Keep assistant message ref in sync
          assistantMessageRef.current = assistantMessage;
          const handled = await this.handleCustomSSEEvent(
            payload,
            onEvent,
            assistantMessageRef,
            emitMessage,
            nextSequence
          );
          // Update assistantMessage from ref (in case it was created)
          if (assistantMessageRef.current && !assistantMessage) {
            assistantMessage = assistantMessageRef.current;
          }
          if (handled) continue; // Skip default handling if custom handler processed it
        }

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
        } else if (payloadType === "reason_chunk") {
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
            reasoningMessage.reasoning.chunks.push(String(chunk));
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
          const toolMessage = ensureToolMessage(toolId);
          const tool = toolMessage.toolCall ?? {
            id: toolId,
            status: "pending"
          };
          tool.name = payload.toolName ?? tool.name;
          tool.status = "running";
          if (payload.args !== undefined) {
            tool.args = payload.args;
          }
          tool.startedAt =
            tool.startedAt ??
            resolveTimestamp(payload.startedAt ?? payload.timestamp);
          tool.completedAt = undefined;
          tool.durationMs = undefined;
          toolMessage.toolCall = tool;
          toolMessage.streaming = true;
          emitMessage(toolMessage);
        } else if (payloadType === "tool_chunk") {
          const toolId =
            resolveToolId(payload, false) ??
            resolveToolId(payload, true) ??
            `tool-${nextSequence()}`;
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
          emitMessage(toolMessage);
        } else if (payloadType === "tool_complete") {
          const toolId =
            resolveToolId(payload, false) ??
            resolveToolId(payload, true) ??
            `tool-${nextSequence()}`;
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
          if (typeof payload.duration === "number") {
            tool.durationMs = payload.duration;
          } else {
            const start = tool.startedAt ?? Date.now();
            tool.durationMs = Math.max(
              0,
              (tool.completedAt ?? Date.now()) - start
            );
          }
          toolMessage.toolCall = tool;
          toolMessage.streaming = false;
          emitMessage(toolMessage);
          const callKey = getToolCallKey(payload);
          if (callKey) {
            toolContext.byCall.delete(callKey);
          }
        } else if (payloadType === "step_chunk") {
          // Only process chunks for prompt steps, not tool/context steps
          const stepType = (payload as any).stepType;
          const executionType = (payload as any).executionType;
          if (stepType === "tool" || executionType === "context") {
            // Skip tool-related chunks - they're handled by tool_start/tool_complete
            continue;
          }
          const assistant = ensureAssistantMessage();
          // Support various field names: text, delta, content, chunk (Travrse uses 'chunk')
          const chunk = payload.text ?? payload.delta ?? payload.content ?? payload.chunk ?? "";
          if (chunk) {
            // Accumulate raw content for structured format parsing
            const rawBuffer = rawContentBuffers.get(assistant.id) ?? "";
            const accumulatedRaw = rawBuffer + chunk;
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
              assistant.content += chunk;
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
                  // Parser successfully extracted text
                  // Update the message content with extracted text
                  const currentAssistant = assistantMessage;
                  if (currentAssistant && currentAssistant.id === assistant.id) {
                    currentAssistant.content = text;
                    emitMessage(currentAssistant);
                  }
                } else if (!looksLikeJson && !accumulatedRaw.trim().startsWith('<')) {
                  // Not a structured format - show as plain text
                  const currentAssistant = assistantMessage;
                  if (currentAssistant && currentAssistant.id === assistant.id) {
                    currentAssistant.content += chunk;
                    rawContentBuffers.delete(currentAssistant.id);
                    streamParsers.delete(currentAssistant.id);
                    currentAssistant.rawContent = undefined;
                    emitMessage(currentAssistant);
                  }
                }
                // Otherwise wait for more chunks (incomplete structured format)
                // Don't emit message if parser hasn't extracted text yet
              }).catch(() => {
                // On error, treat as plain text
                assistant.content += chunk;
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
                assistant.content += chunk;
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
          const finalContent = payload.result?.response;
          const assistant = ensureAssistantMessage();
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
          if (finalContent !== undefined && finalContent !== null) {
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
                      const currentAssistant = assistantMessage;
                      if (currentAssistant && currentAssistant.id === assistant.id) {
                        currentAssistant.content = text;
                        currentAssistant.streaming = false;
                        emitMessage(currentAssistant);
                      }
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
        } else if (payloadType === "error" && payload.error) {
          onEvent({
            type: "error",
            error:
              payload.error instanceof Error
                ? payload.error
                : new Error(String(payload.error))
          });
        }
      }
    }
  }
}
