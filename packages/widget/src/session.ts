import { AgentWidgetClient } from "./client";
import {
  AgentWidgetConfig,
  AgentWidgetEvent,
  AgentWidgetMessage,
  ClientSession,
  ContentPart
} from "./types";
import {
  generateUserMessageId,
  generateAssistantMessageId
} from "./utils/message-id";

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
   * Check if running in client token mode
   */
  public isClientTokenMode(): boolean {
    return this.client.isClientTokenMode();
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
    this.config = { ...this.config, ...next };
    this.client = new AgentWidgetClient(this.config);
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

  public injectTestEvent(event: AgentWidgetEvent) {
    this.handleEvent(event);
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
      content: input || "[Image]", // Display text (fallback if only images)
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
      const fallback: AgentWidgetMessage = {
        id: assistantMessageId, // Use the pre-generated ID for fallback too
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
    } else if (event.type === "status") {
      this.setStatus(event.status);
      if (event.status === "connecting") {
        this.setStreaming(true);
      } else if (event.status === "idle" || event.status === "error") {
        this.setStreaming(false);
        this.abortController = null;
      }
    } else if (event.type === "error") {
      this.setStatus("error");
      this.setStreaming(false);
      this.abortController = null;
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
