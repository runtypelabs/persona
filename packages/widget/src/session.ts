import { AgentWidgetClient, type SSEEventCallback } from "./client";
import {
  AgentWidgetConfig,
  AgentWidgetEvent,
  AgentWidgetMessage,
  AgentWidgetApproval,
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
import type {
  VoiceProvider,
  VoiceResult,
  VoiceStatus,
  VoiceConfig,
  TextToSpeechConfig
} from "./types";
import {
  createVoiceProvider,
  createBestAvailableVoiceProvider,
  isVoiceSupported
} from "./voice";

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
  onVoiceStatusChanged?: (status: VoiceStatus) => void;
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

  // Voice support
  private voiceProvider: VoiceProvider | null = null;
  private voiceActive = false;
  private voiceStatus: VoiceStatus = 'disconnected';

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
   * Check if voice is supported
   */
  public isVoiceSupported(): boolean {
    return isVoiceSupported(this.config.voiceRecognition?.provider);
  }

  /**
   * Check if voice is currently active
   */
  public isVoiceActive(): boolean {
    return this.voiceActive;
  }

  /**
   * Get current voice status
   */
  public getVoiceStatus(): VoiceStatus {
    return this.voiceStatus;
  }

  /**
   * Get the voice interruption mode from the provider (none/cancel/barge-in)
   */
  public getVoiceInterruptionMode(): "none" | "cancel" | "barge-in" {
    if (this.voiceProvider?.getInterruptionMode) {
      return this.voiceProvider.getInterruptionMode();
    }
    return "none";
  }

  /**
   * Stop voice playback / cancel in-flight request without starting recording.
   * Returns to idle state.
   */
  public stopVoicePlayback(): void {
    if (this.voiceProvider?.stopPlayback) {
      this.voiceProvider.stopPlayback();
    }
  }

  // Pending placeholder IDs for Runtype two-phase voice flow
  private pendingVoiceUserMessageId: string | null = null;
  private pendingVoiceAssistantMessageId: string | null = null;

  // Track message IDs where the Runtype provider already played TTS audio
  // so browser TTS doesn't double-speak them
  private ttsSpokenMessageIds = new Set<string>();

  /**
   * Setup voice recognition with the given configuration
   */
  public setupVoice(config?: VoiceConfig) {
    try {
      const voiceConfig = config || this.getVoiceConfigFromConfig();
      if (!voiceConfig) {
        throw new Error('Voice configuration not provided');
      }

      this.voiceProvider = createVoiceProvider(voiceConfig);

      // Read configurable text from widget config
      const voiceRecognitionConfig = this.config.voiceRecognition ?? {};
      const processingText = voiceRecognitionConfig.processingText ?? '\u{1F3A4} Processing voice...';
      const processingErrorText = voiceRecognitionConfig.processingErrorText ?? 'Voice processing failed. Please try again.';

      // Phase A: When recording stops and audio is about to be sent,
      // inject placeholder messages and show typing indicator immediately.
      // Placeholders are tagged with voiceProcessing=true so consumers can
      // detect them in messageTransform and render custom UI.
      if (this.voiceProvider.onProcessingStart) {
        this.voiceProvider.onProcessingStart(() => {
          // Inject user message placeholder
          const userMsg = this.injectMessage({
            role: 'user',
            content: processingText,
            streaming: false,
            voiceProcessing: true
          });
          this.pendingVoiceUserMessageId = userMsg.id;

          // Inject empty assistant message with streaming=true for typing indicator
          const assistantMsg = this.injectMessage({
            role: 'assistant',
            content: '',
            streaming: true,
            voiceProcessing: true
          });
          this.pendingVoiceAssistantMessageId = assistantMsg.id;

          // Trigger typing indicator in the UI
          this.setStreaming(true);
        });
      }

      // Phase B: When server responds with transcript + agent response,
      // upsert the placeholder messages with actual content and clear voiceProcessing flag
      this.voiceProvider.onResult((result) => {
        if (result.provider === 'browser') {
          // Browser STT: send transcript as a user message (agent runs via normal chat)
          if (result.text && result.text.trim()) {
            this.sendMessage(result.text, { viaVoice: true });
          }
        } else if (result.provider === 'runtype') {
          // Runtype provider: agent already executed server-side, audio playback
          // is handled by the provider itself. Update placeholders with actual content.
          if (this.pendingVoiceUserMessageId && result.transcript?.trim()) {
            this.upsertMessage({
              id: this.pendingVoiceUserMessageId,
              role: 'user',
              content: result.transcript.trim(),
              createdAt: new Date().toISOString(),
              streaming: false,
              voiceProcessing: false
            });
          } else if (result.transcript?.trim()) {
            this.injectUserMessage({ content: result.transcript.trim() });
          }

          if (this.pendingVoiceAssistantMessageId && result.text?.trim()) {
            this.upsertMessage({
              id: this.pendingVoiceAssistantMessageId,
              role: 'assistant',
              content: result.text.trim(),
              createdAt: new Date().toISOString(),
              streaming: false,
              voiceProcessing: false
            });
          } else if (result.text?.trim()) {
            this.injectAssistantMessage({ content: result.text.trim() });
          }

          // If Runtype provider returned audio (server-side TTS), mark the
          // assistant message as already spoken so browser TTS doesn't double-speak
          if (result.audio?.base64) {
            const spokenId = this.pendingVoiceAssistantMessageId
              ?? [...this.messages].reverse().find(m => m.role === 'assistant')?.id;
            if (spokenId) this.ttsSpokenMessageIds.add(spokenId);
          }

          // Clear streaming state and pending IDs
          this.setStreaming(false);
          this.pendingVoiceUserMessageId = null;
          this.pendingVoiceAssistantMessageId = null;
        }
      });

      this.voiceProvider.onError((error) => {
        console.error('Voice error:', error);

        // If error occurs while placeholders are pending, update assistant with error text
        if (this.pendingVoiceAssistantMessageId) {
          this.upsertMessage({
            id: this.pendingVoiceAssistantMessageId,
            role: 'assistant',
            content: processingErrorText,
            createdAt: new Date().toISOString(),
            streaming: false,
            voiceProcessing: false
          });
          this.setStreaming(false);
          this.pendingVoiceUserMessageId = null;
          this.pendingVoiceAssistantMessageId = null;
        }
      });

      this.voiceProvider.onStatusChange((status) => {
        this.voiceStatus = status;
        this.voiceActive = status === 'listening';
        this.callbacks.onVoiceStatusChanged?.(status);
      });

      this.voiceProvider.connect();

    } catch (error) {
      console.error('Failed to setup voice:', error);
    }
  }

  /**
   * Toggle voice recognition on/off
   */
  public async toggleVoice() {
    if (!this.voiceProvider) {
      console.error('Voice not configured');
      return;
    }

    if (this.voiceActive) {
      await this.voiceProvider.stopListening();
    } else {
      // Stop any in-progress TTS so the mic doesn't pick it up
      this.stopSpeaking();
      try {
        await this.voiceProvider.startListening();
      } catch (error) {
        console.error('Failed to start voice:', error);
      }
    }
  }

  /**
   * Cleanup voice resources
   */
  public cleanupVoice() {
    if (this.voiceProvider) {
      this.voiceProvider.disconnect();
      this.voiceProvider = null;
    }
    this.voiceActive = false;
    this.voiceStatus = 'disconnected';
  }

  /**
   * Extract voice configuration from widget config
   */
  private getVoiceConfigFromConfig(): VoiceConfig | undefined {
    if (!this.config.voiceRecognition?.provider) {
      return undefined;
    }
    
    const providerConfig = this.config.voiceRecognition.provider;
    
    switch (providerConfig.type) {
      case 'runtype':
        return {
          type: 'runtype',
          runtype: {
            agentId: providerConfig.runtype?.agentId || '',
            clientToken: providerConfig.runtype?.clientToken || '',
            host: providerConfig.runtype?.host,
            voiceId: providerConfig.runtype?.voiceId,
            pauseDuration: providerConfig.runtype?.pauseDuration,
            silenceThreshold: providerConfig.runtype?.silenceThreshold
          }
        };
      
      case 'browser':
        return {
          type: 'browser',
          browser: {
            language: providerConfig.browser?.language || 'en-US',
            continuous: providerConfig.browser?.continuous
          }
        };
      
      default:
        return undefined;
    }
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
      streaming = false,
      voiceProcessing
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
      ...(contentParts !== undefined && { contentParts }),
      ...(voiceProcessing !== undefined && { voiceProcessing })
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

    this.stopSpeaking();
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

    // Finalize any stale streaming messages from the previous stream
    // (e.g., tool messages interrupted by approval pause)
    let hasStale = false;
    for (const msg of this.messages) {
      if (msg.streaming) {
        msg.streaming = false;
        hasStale = true;
      }
    }
    if (hasStale) {
      this.callbacks.onMessagesChanged([...this.messages]);
    }

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

  /**
   * Resolve a tool approval request (approve or deny).
   * Updates the approval message status, calls the API (or custom onDecision),
   * and pipes the response stream through connectStream().
   */
  public async resolveApproval(
    approval: AgentWidgetApproval,
    decision: 'approved' | 'denied'
  ): Promise<void> {
    // 1. Update approval message status immediately for responsive UI
    const approvalMessageId = `approval-${approval.id}`;
    const updatedApproval: AgentWidgetApproval = {
      ...approval,
      status: decision,
      resolvedAt: Date.now(),
    };
    const updatedMessage: AgentWidgetMessage = {
      id: approvalMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: false,
      variant: "approval",
      approval: updatedApproval,
    };
    this.upsertMessage(updatedMessage);

    // 2. Call onDecision callback if provided, otherwise use client.resolveApproval()
    const approvalConfig = this.config.approval;
    const onDecision = approvalConfig && typeof approvalConfig === 'object' ? approvalConfig.onDecision : undefined;

    try {
      let response: Response | ReadableStream<Uint8Array> | void;

      if (onDecision) {
        response = await onDecision(
          {
            approvalId: approval.id,
            executionId: approval.executionId,
            agentId: approval.agentId,
            toolName: approval.toolName,
          },
          decision
        );
      } else {
        response = await this.client.resolveApproval(
          {
            agentId: approval.agentId,
            executionId: approval.executionId,
            approvalId: approval.id,
          },
          decision
        );
      }

      // 3. Pipe through connectStream if we got a response with a body
      if (response) {
        let stream: ReadableStream<Uint8Array> | null = null;
        if (response instanceof Response) {
          if (!response.ok) {
            const errorData = await response.json().catch(() => null);
            throw new Error(
              errorData?.error ?? `Approval request failed: ${response.status}`
            );
          }
          stream = response.body;
        } else if (response instanceof ReadableStream) {
          stream = response;
        }

        if (stream) {
          await this.connectStream(stream);
        } else if (decision === 'denied') {
          // No stream body for denied — inject a denial message
          this.appendMessage({
            id: `denial-${approval.id}`,
            role: "assistant",
            content: "Tool execution was denied by user.",
            createdAt: new Date().toISOString(),
            streaming: false,
            sequence: this.nextSequence(),
          });
        }
      }
    } catch (error) {
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
    this.stopSpeaking();
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
    const wasStreaming = this.streaming;
    this.streaming = streaming;
    this.callbacks.onStreamingChanged(streaming);

    // Speak the latest assistant message when streaming completes
    if (wasStreaming && !streaming) {
      this.speakLatestAssistantMessage();
    }
  }

  /**
   * Speak the latest assistant message using the Web Speech API
   * if text-to-speech is enabled in the config.
   */
  private speakLatestAssistantMessage() {
    const ttsConfig = this.config.textToSpeech;
    if (!ttsConfig?.enabled) return;

    // Determine if browser TTS should fire:
    // - provider 'browser' (or unset): always use browser TTS
    // - provider 'runtype': only if browserFallback is enabled
    const useBrowserTts =
      !ttsConfig.provider ||
      ttsConfig.provider === 'browser' ||
      (ttsConfig.provider === 'runtype' && ttsConfig.browserFallback);
    if (!useBrowserTts) return;

    // Find the last assistant message with actual content
    const lastAssistant = [...this.messages]
      .reverse()
      .find(m => m.role === 'assistant' && m.content && !m.voiceProcessing);

    if (!lastAssistant) return;

    // Skip if already spoken by Runtype provider's audio playback
    if (this.ttsSpokenMessageIds.has(lastAssistant.id)) {
      this.ttsSpokenMessageIds.delete(lastAssistant.id);
      return;
    }

    const text = lastAssistant.content;
    if (!text.trim()) return;

    this.speak(text, ttsConfig);
  }

  /**
   * Speak text using the Web Speech API.
   * Cancels any in-progress speech before starting.
   */
  private speak(text: string, config: TextToSpeechConfig) {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;

    const synth = window.speechSynthesis;
    synth.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();

    if (config.voice) {
      const match = voices.find(v => v.name === config.voice);
      if (match) utterance.voice = match;
    } else if (voices.length > 0) {
      // Use custom picker if provided, otherwise auto-detect
      utterance.voice = config.pickVoice
        ? config.pickVoice(voices)
        : AgentWidgetSession.pickBestVoice(voices);
    }

    if (config.rate !== undefined) utterance.rate = config.rate;
    if (config.pitch !== undefined) utterance.pitch = config.pitch;

    // Chrome bug: cancel() immediately followed by speak() can ignore
    // rate/pitch. A microtask delay lets the engine reset properly.
    setTimeout(() => synth.speak(utterance), 50);
  }

  /**
   * Pick the best available English voice from a list of SpeechSynthesisVoices.
   * Prefers high-quality remote/natural voices, then enhanced local voices,
   * then standard local voices.
   */
  static pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice {
    // Priority list: high-quality voices across browsers/platforms
    const preferred = [
      // Edge Online Natural (highest quality)
      'Microsoft Jenny Online (Natural) - English (United States)',
      'Microsoft Aria Online (Natural) - English (United States)',
      'Microsoft Guy Online (Natural) - English (United States)',
      // Google remote (good quality, cross-platform in Chrome)
      'Google US English',
      'Google UK English Female',
      // Apple premium/enhanced (macOS)
      'Ava (Premium)',
      'Evan (Enhanced)',
      'Samantha (Enhanced)',
      // Apple standard (macOS/iOS)
      'Samantha',
      'Daniel',
      'Karen',
      // Windows SAPI
      'Microsoft David Desktop - English (United States)',
      'Microsoft Zira Desktop - English (United States)',
    ];

    for (const name of preferred) {
      const match = voices.find(v => v.name === name);
      if (match) return match;
    }

    // Fallback: any English voice, then first available
    return voices.find(v => v.lang.startsWith('en')) ?? voices[0];
  }

  /**
   * Stop any in-progress text-to-speech playback.
   */
  public stopSpeaking() {
    if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
      window.speechSynthesis.cancel();
    }
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
