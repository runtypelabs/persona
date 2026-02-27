import { AgentWidgetClient, type SSEEventCallback } from "./client";
import {
  AgentWidgetConfig,
  AgentWidgetEvent,
  AgentWidgetMessage,
  AgentExecutionState,
  ClientSession,
  ContentPart,
  InjectMessageOptions,
  InjectAssistantMessageOptions,
  InjectUserMessageOptions,
  InjectSystemMessageOptions
} from "./types";
import {
  generateUserMessageId,
  generateAssistantMessageId
} from "./utils/message-id";
import { IMAGE_ONLY_MESSAGE_FALLBACK_TEXT } from "./utils/content";

export type AgentWidgetSessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

type SessionCallbacks = {
  onMessagesChanged: (messages: AgentWidgetMessage[]) => void;
  onStatusChanged: (status: AgentWidgetSessionStatus) => void;
  onStreamingChanged: (streaming: boolean) => void;
  onError?: (error: Error) => void;
};

export class AgentWidgetSession {
  private client: AgentWidgetClient;
  private messages: AgentWidgetMessage[];
  private status: AgentWidgetSessionStatus = "idle";
  private streaming = false;
  private abortController: AbortController | null = null;
  private sequenceCounter = Date.now();
  
  // Client token session management
  private clientSession: ClientSession | null = null;

  // Agent execution state
  private agentExecution: AgentExecutionState | null = null;

  constructor(
    private config: AgentWidgetConfig = {},
    private callbacks: SessionCallbacks
  ) {
    this.messages = [...(config.initialMessages ?? [])].map((message) => ({
      ...message,
      sequence: message.sequence ?? this.nextSequence()
    }));
    this.messages = this.sortMessages(this.messages);
    this.client = new AgentWidgetClient(config);

    if (this.messages.length) {
      this.callbacks.onMessagesChanged([...this.messages]);
    }
    this.callbacks.onStatusChanged(this.status);
  }

  /**
   * Set callback for capturing raw SSE events (forwards to client)
   */
  public setSSEEventCallback(callback: SSEEventCallback): void {
    this.client.setSSEEventCallback(callback);
  }

  /**
   * Check if running in client token mode
   */
  public isClientTokenMode(): boolean {
    return this.client.isClientTokenMode();
  }

  /**
   * Check if running in agent execution mode
   */
  public isAgentMode(): boolean {
    return this.client.isAgentMode();
  }

  /**
   * Get current agent execution state (if in agent mode)
   */
  public getAgentExecution(): AgentExecutionState | null {
    return this.agentExecution;
  }

  /**
   * Check if an agent execution is currently running
   */
  public isAgentExecuting(): boolean {
    return this.agentExecution?.status === 'running';
  }

  /**
   * Initialize the client session (for client token mode).
   * This is called automatically on first message, but can be called
   * explicitly to pre-initialize the session and get config from server.
   */
  public async initClientSession(): Promise<ClientSession | null> {
    if (!this.isClientTokenMode()) {
      return null;
    }
    
    try {
      const session = await this.client.initSession();
      this.setClientSession(session);
      return session;
    } catch (error) {
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
      return null;
    }
  }

  /**
   * Set the client session after initialization
   */
  public setClientSession(session: ClientSession): void {
    this.clientSession = session;
    
    // Optionally add welcome message from session config
    if (session.config.welcomeMessage && this.messages.length === 0) {
      const welcomeMessage: AgentWidgetMessage = {
        id: `welcome-${Date.now()}`,
        role: "assistant",
        content: session.config.welcomeMessage,
        createdAt: new Date().toISOString(),
        sequence: this.nextSequence()
      };
      this.appendMessage(welcomeMessage);
    }
  }

  /**
   * Get current client session
   */
  public getClientSession(): ClientSession | null {
    return this.clientSession ?? this.client.getClientSession();
  }

  /**
   * Check if session is valid and not expired
   */
  public isSessionValid(): boolean {
    const session = this.getClientSession();
    if (!session) return false;
    return new Date() < session.expiresAt;
  }

  /**
   * Clear session (on expiry or error)
   */
  public clearClientSession(): void {
    this.clientSession = null;
    this.client.clearClientSession();
  }

  /**
   * Get the underlying client instance (for advanced use cases like feedback)
   */
  public getClient(): AgentWidgetClient {
    return this.client;
  }

  /**
   * Submit message feedback (upvote, downvote, or copy) to the API.
   * Only available in client token mode.
   * 
   * @param messageId - The ID of the message to provide feedback for
   * @param type - The feedback type: 'upvote', 'downvote', or 'copy'
   */
  public async submitMessageFeedback(
    messageId: string,
    type: 'upvote' | 'downvote' | 'copy'
  ): Promise<void> {
    return this.client.submitMessageFeedback(messageId, type);
  }

  /**
   * Submit CSAT (Customer Satisfaction) feedback to the API.
   * Only available in client token mode.
   * 
   * @param rating - Rating from 1 to 5
   * @param comment - Optional comment
   */
  public async submitCSATFeedback(rating: number, comment?: string): Promise<void> {
    return this.client.submitCSATFeedback(rating, comment);
  }

  /**
   * Submit NPS (Net Promoter Score) feedback to the API.
   * Only available in client token mode.
   * 
   * @param rating - Rating from 0 to 10
   * @param comment - Optional comment
   */
  public async submitNPSFeedback(rating: number, comment?: string): Promise<void> {
    return this.client.submitNPSFeedback(rating, comment);
  }

  public updateConfig(next: AgentWidgetConfig) {
    const prevSSECallback = this.client.getSSEEventCallback();
    this.config = { ...this.config, ...next };
    this.client = new AgentWidgetClient(this.config);
    if (prevSSECallback) {
      this.client.setSSEEventCallback(prevSSECallback);
    }
  }

  public getMessages() {
    return [...this.messages];
  }

  public getStatus() {
    return this.status;
  }

  public isStreaming() {
    return this.streaming;
  }

  /**
   * @deprecated Use injectMessage() instead.
   * Injects a raw event into the session event handler.
   */
  public injectTestEvent(event: AgentWidgetEvent) {
    this.handleEvent(event);
  }

  /**
   * Inject a message into the conversation.
   * This is the primary API for adding messages programmatically.
   *
   * Supports dual-content where the displayed content differs from what the LLM receives.
   *
   * @param options - Message injection options including dual-content support
   * @returns The created message object
   *
   * @example
   * // Same content for user and LLM
   * session.injectMessage({
   *   role: 'assistant',
   *   content: 'Here are the search results...'
   * });
   *
   * @example
   * // Different content for user and LLM (redaction)
   * session.injectMessage({
   *   role: 'assistant',
   *   content: '**Found 3 products:**\n- iPhone 15 Pro ($1,199)\n- iPhone 15 ($999)',
   *   llmContent: '[Search results: 3 iPhone products, $799-$1199]'
   * });
   */
  public injectMessage(options: InjectMessageOptions): AgentWidgetMessage {
    const {
      role,
      content,
      llmContent,
      contentParts,
      id,
      createdAt,
      sequence,
      streaming = false
    } = options;

    // Generate appropriate ID based on role
    const messageId =
      id ??
      (role === "user"
        ? generateUserMessageId()
        : role === "assistant"
          ? generateAssistantMessageId()
          : `system-${Date.now()}-${Math.random().toString(16).slice(2)}`);

    const message: AgentWidgetMessage = {
      id: messageId,
      role,
      content,
      createdAt: createdAt ?? new Date().toISOString(),
      sequence: sequence ?? this.nextSequence(),
      streaming,
      // Only include optional fields if provided
      ...(llmContent !== undefined && { llmContent }),
      ...(contentParts !== undefined && { contentParts })
    };

    // Use upsert to handle both new messages and updates (streaming)
    this.upsertMessage(message);

    return message;
  }

  /**
   * Convenience method for injecting assistant messages.
   * Role defaults to 'assistant'.
   *
   * @example
   * // Simple assistant message
   * session.injectAssistantMessage({
   *   content: 'Here are your search results...'
   * });
   *
   * @example
   * // With redacted LLM content
   * session.injectAssistantMessage({
   *   content: 'Full product details for the user...',
   *   llmContent: '[Product details summary]'
   * });
   */
  public injectAssistantMessage(
    options: InjectAssistantMessageOptions
  ): AgentWidgetMessage {
    return this.injectMessage({ ...options, role: "assistant" });
  }

  /**
   * Convenience method for injecting user messages.
   * Role defaults to 'user'.
   *
   * @example
   * session.injectUserMessage({
   *   content: 'Add iPhone 15 Pro to my cart'
   * });
   */
  public injectUserMessage(
    options: InjectUserMessageOptions
  ): AgentWidgetMessage {
    return this.injectMessage({ ...options, role: "user" });
  }

  /**
   * Convenience method for injecting system messages.
   * Role defaults to 'system'.
   *
   * @example
   * // Inject context that guides LLM behavior
   * session.injectSystemMessage({
   *   content: '[Context updated]',  // Minimal display
   *   llmContent: 'User is viewing iPhone 15 Pro. Cart has 2 items.'
   * });
   */
  public injectSystemMessage(
    options: InjectSystemMessageOptions
  ): AgentWidgetMessage {
    return this.injectMessage({ ...options, role: "system" });
  }

  /**
   * Inject multiple messages in a single batch with one sort and one render pass.
   */
  public injectMessageBatch(optionsList: InjectMessageOptions[]): AgentWidgetMessage[] {
    const results: AgentWidgetMessage[] = [];

    for (const options of optionsList) {
      const {
        role,
        content,
        llmContent,
        contentParts,
        id,
        createdAt,
        sequence,
        streaming = false
      } = options;

      const messageId =
        id ??
        (role === "user"
          ? generateUserMessageId()
          : role === "assistant"
            ? generateAssistantMessageId()
            : `system-${Date.now()}-${Math.random().toString(16).slice(2)}`);

      const message: AgentWidgetMessage = {
        id: messageId,
        role,
        content,
        createdAt: createdAt ?? new Date().toISOString(),
        sequence: sequence ?? this.nextSequence(),
        streaming,
        ...(llmContent !== undefined && { llmContent }),
        ...(contentParts !== undefined && { contentParts })
      };

      results.push(message);
    }

    // Add all messages, sort once, notify once
    this.messages = this.sortMessages([...this.messages, ...results]);
    this.callbacks.onMessagesChanged([...this.messages]);

    return results;
  }

  public async sendMessage(
    rawInput: string,
    options?: {
      viaVoice?: boolean;
      /** Multi-modal content parts (e.g., images) to include with the message */
      contentParts?: ContentPart[];
    }
  ) {
    const input = rawInput.trim();
    // Allow sending if there's text OR attachments
    if (!input && (!options?.contentParts || options.contentParts.length === 0)) return;

    this.abortController?.abort();

    // Generate IDs for both user message and expected assistant response
    const userMessageId = generateUserMessageId();
    const assistantMessageId = generateAssistantMessageId();

    const userMessage: AgentWidgetMessage = {
      id: userMessageId,
      role: "user",
      content: input || IMAGE_ONLY_MESSAGE_FALLBACK_TEXT, // Display text (fallback if only images)
      createdAt: new Date().toISOString(),
      sequence: this.nextSequence(),
      viaVoice: options?.viaVoice || false,
      // Include contentParts if provided (for multi-modal messages)
      ...(options?.contentParts && options.contentParts.length > 0 && {
        contentParts: options.contentParts
      })
    };

    this.appendMessage(userMessage);
    this.setStreaming(true);

    const controller = new AbortController();
    this.abortController = controller;

    const snapshot = [...this.messages];

    try {
      await this.client.dispatch(
        {
          messages: snapshot,
          signal: controller.signal,
          assistantMessageId // Pass expected assistant message ID for tracking
        },
        this.handleEvent
      );
    } catch (error) {
      // Check if this is an abort error (user canceled, navigated away, etc.)
      // In these cases, don't show fallback - the request was intentionally interrupted
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
         error.message.includes('aborted') ||
         error.message.includes('abort'));

      if (!isAbortError) {
        const fallback: AgentWidgetMessage = {
          id: assistantMessageId, // Use the pre-generated ID for fallback too
          role: "assistant",
          createdAt: new Date().toISOString(),
          content:
            "It looks like the proxy isn't returning a real response yet. Here's a sample message so you can continue testing locally.",
          sequence: this.nextSequence()
        };

        this.appendMessage(fallback);
      }

      this.setStatus("idle");
      this.setStreaming(false);
      this.abortController = null;

      if (!isAbortError) {
        if (error instanceof Error) {
          this.callbacks.onError?.(error);
        } else {
          this.callbacks.onError?.(new Error(String(error)));
        }
      }
    }
  }

  /**
   * Continue the conversation without adding a new user message.
   * Triggers the model to respond based on the current conversation state.
   *
   * Use this for automatic continuation after action handlers inject data
   * (e.g., search results) that the model should analyze.
   *
   * @example
   * // After injecting search results, trigger model to analyze them
   * session.injectAssistantMessage({ content: 'Found 5 products...' });
   * session.continueConversation();
   */
  public async continueConversation() {
    // Don't continue if already streaming
    if (this.streaming) return;

    this.abortController?.abort();

    const assistantMessageId = generateAssistantMessageId();

    this.setStreaming(true);

    const controller = new AbortController();
    this.abortController = controller;

    const snapshot = [...this.messages];

    try {
      await this.client.dispatch(
        {
          messages: snapshot,
          signal: controller.signal,
          assistantMessageId
        },
        this.handleEvent
      );
    } catch (error) {
      const fallback: AgentWidgetMessage = {
        id: assistantMessageId,
        role: "assistant",
        createdAt: new Date().toISOString(),
        content:
          "It looks like the proxy isn't returning a real response yet. Here's a sample message so you can continue testing locally.",
        sequence: this.nextSequence()
      };

      this.appendMessage(fallback);
      this.setStatus("idle");
      this.setStreaming(false);
      this.abortController = null;
      if (error instanceof Error) {
        this.callbacks.onError?.(error);
      } else {
        this.callbacks.onError?.(new Error(String(error)));
      }
    }
  }

  /**
   * Connect an external SSE stream (e.g. from an approval endpoint) and
   * process it through the SDK's native event pipeline.
   */
  public async connectStream(
    stream: ReadableStream<Uint8Array>,
    options?: { assistantMessageId?: string }
  ): Promise<void> {
    if (this.streaming) return;
    this.abortController?.abort();
    this.setStreaming(true);

    try {
      await this.client.processStream(
        stream,
        this.handleEvent,
        options?.assistantMessageId
      );
    } catch (error) {
      this.setStatus("error");
      this.setStreaming(false);
      this.abortController = null;
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  public cancel() {
    this.abortController?.abort();
    this.abortController = null;
    this.setStreaming(false);
    this.setStatus("idle");
  }

  public clearMessages() {
    this.abortController?.abort();
    this.abortController = null;
    this.messages = [];
    this.agentExecution = null;
    this.setStreaming(false);
    this.setStatus("idle");
    this.callbacks.onMessagesChanged([...this.messages]);
  }

  public hydrateMessages(messages: AgentWidgetMessage[]) {
    this.abortController?.abort();
    this.abortController = null;
    this.messages = this.sortMessages(
      messages.map((message) => ({
        ...message,
        streaming: false,
        sequence: message.sequence ?? this.nextSequence()
      }))
    );
    this.setStreaming(false);
    this.setStatus("idle");
    this.callbacks.onMessagesChanged([...this.messages]);
  }

  private handleEvent = (event: AgentWidgetEvent) => {
    if (event.type === "message") {
      this.upsertMessage(event.message);

      // Track agent execution state from message metadata
      if (event.message.agentMetadata?.executionId) {
        if (!this.agentExecution) {
          this.agentExecution = {
            executionId: event.message.agentMetadata.executionId,
            agentId: '',
            agentName: event.message.agentMetadata.agentName ?? '',
            status: 'running',
            currentIteration: event.message.agentMetadata.iteration ?? 0,
            maxIterations: 0
          };
        } else if (event.message.agentMetadata.iteration !== undefined) {
          this.agentExecution.currentIteration = event.message.agentMetadata.iteration;
        }
      }
    } else if (event.type === "status") {
      this.setStatus(event.status);
      if (event.status === "connecting") {
        this.setStreaming(true);
      } else if (event.status === "idle" || event.status === "error") {
        this.setStreaming(false);
        this.abortController = null;
        // Mark agent execution as complete when streaming ends
        if (this.agentExecution?.status === 'running') {
          this.agentExecution.status = event.status === "error" ? 'error' : 'complete';
        }
      }
    } else if (event.type === "error") {
      this.setStatus("error");
      this.setStreaming(false);
      this.abortController = null;
      if (this.agentExecution?.status === 'running') {
        this.agentExecution.status = 'error';
      }
      this.callbacks.onError?.(event.error);
    }
  };

  private setStatus(status: AgentWidgetSessionStatus) {
    if (this.status === status) return;
    this.status = status;
    this.callbacks.onStatusChanged(status);
  }

  private setStreaming(streaming: boolean) {
    if (this.streaming === streaming) return;
    this.streaming = streaming;
    this.callbacks.onStreamingChanged(streaming);
  }

  private appendMessage(message: AgentWidgetMessage) {
    const withSequence = this.ensureSequence(message);
    this.messages = this.sortMessages([...this.messages, withSequence]);
    this.callbacks.onMessagesChanged([...this.messages]);
  }

  private upsertMessage(message: AgentWidgetMessage) {
    const withSequence = this.ensureSequence(message);
    const index = this.messages.findIndex((m) => m.id === withSequence.id);
    if (index === -1) {
      this.appendMessage(withSequence);
      return;
    }

    this.messages = this.messages.map((existing, idx) =>
      idx === index ? { ...existing, ...withSequence } : existing
    );
    this.messages = this.sortMessages(this.messages);
    this.callbacks.onMessagesChanged([...this.messages]);
  }

  private ensureSequence(message: AgentWidgetMessage): AgentWidgetMessage {
    if (message.sequence !== undefined) {
      return { ...message };
    }
    return {
      ...message,
      sequence: this.nextSequence()
    };
  }

  private nextSequence() {
    return this.sequenceCounter++;
  }

  private sortMessages(messages: AgentWidgetMessage[]) {
    return [...messages].sort((a, b) => {
      // Sort by createdAt timestamp first (chronological order)
      const timeA = new Date(a.createdAt).getTime();
      const timeB = new Date(b.createdAt).getTime();
      if (!Number.isNaN(timeA) && !Number.isNaN(timeB) && timeA !== timeB) {
        return timeA - timeB;
      }

      // Fall back to sequence if timestamps are equal or invalid
      const seqA = a.sequence ?? 0;
      const seqB = b.sequence ?? 0;
      if (seqA !== seqB) return seqA - seqB;

      // Final fallback to ID
      return a.id.localeCompare(b.id);
    });
  }
}
