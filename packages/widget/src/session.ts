import { AgentWidgetClient, type SSEEventCallback } from "./client";
import { isWebMcpToolName } from "./webmcp-bridge";
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
  InjectSystemMessageOptions,
  InjectComponentDirectiveOptions,
  PersonaArtifactRecord,
  PersonaArtifactManualUpsert
} from "./types";
import {
  generateUserMessageId,
  generateAssistantMessageId
} from "./utils/message-id";
import { IMAGE_ONLY_MESSAGE_FALLBACK_TEXT } from "./utils/content";
import type {
  VoiceProvider,
  VoiceStatus,
  VoiceConfig,
  TextToSpeechConfig
} from "./types";
import {
  createVoiceProvider,
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
  onArtifactsState?: (state: {
    artifacts: PersonaArtifactRecord[];
    selectedId: string | null;
  }) => void;
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

  private artifacts = new Map<string, PersonaArtifactRecord>();
  private selectedArtifactId: string | null = null;

  // WebMCP — toolCall.ids the bridge has already started handling. Permanent
  // for the lifetime of the session: a step_await re-emit (server retry, late
  // event flush) can re-set `awaitingLocalTool: true` even after we've cleared
  // it locally, so the dedupe key has to outlive the resolve round-trip.
  private webMcpHandledToolCallIds: Set<string> = new Set();

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

    // Hydrate artifacts from config (mirrors `initialMessages`). Restored
    // records are forced to `status: "complete"` — a mid-stream artifact should
    // never reappear after a refresh with its skeleton still showing.
    for (const rec of config.initialArtifacts ?? []) {
      this.artifacts.set(rec.id, { ...rec, status: "complete" });
    }
    if (config.initialSelectedArtifactId != null) {
      this.selectedArtifactId = config.initialSelectedArtifactId;
    }

    if (this.messages.length) {
      this.callbacks.onMessagesChanged([...this.messages]);
    }
    if (this.artifacts.size > 0) {
      this.emitArtifactsState();
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

  /** Returns true if the barge-in mic stream is alive (hot mic between turns) */
  public isBargeInActive(): boolean {
    return this.voiceProvider?.isBargeInActive?.() ?? false;
  }

  /** Tear down the barge-in mic pipeline — "hang up" the always-on mic */
  public async deactivateBargeIn(): Promise<void> {
    if (this.voiceProvider?.deactivateBargeIn) {
      await this.voiceProvider.deactivateBargeIn();
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

          // Mark assistant message as already spoken so browser TTS doesn't
          // double-speak. This covers both paths:
          //   - Batch: audio.base64 is present in the voice_response
          //   - Streaming: audio arrives as binary PCM chunks (no base64 here)
          // In either case, the Runtype provider handles TTS — browser TTS must skip.
          {
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
      voiceProcessing,
      rawContent
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
      ...(voiceProcessing !== undefined && { voiceProcessing }),
      ...(rawContent !== undefined && { rawContent })
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
        streaming = false,
        voiceProcessing,
        rawContent
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
        ...(contentParts !== undefined && { contentParts }),
        ...(voiceProcessing !== undefined && { voiceProcessing }),
        ...(rawContent !== undefined && { rawContent })
      };

      results.push(message);
    }

    // Add all messages, sort once, notify once
    this.messages = this.sortMessages([...this.messages, ...results]);
    this.callbacks.onMessagesChanged([...this.messages]);

    return results;
  }

  /**
   * Convenience method for injecting a registered component directive as
   * an assistant message — the same shape Persona produces from a streamed
   * `{ "text": "...", "component": "...", "props": {...} }` payload.
   *
   * Sets `content` to `text`, `rawContent` to the JSON directive (so
   * `extractComponentDirectiveFromMessage` can find it), and forwards
   * `llmContent` / `id` / `createdAt` / `sequence`.
   *
   * @example
   * session.injectComponentDirective({
   *   component: "DynamicForm",
   *   props: { title: "Book a demo", fields: [...] },
   *   text: "Share your details to book a demo.",
   *   llmContent: "[Showed booking form]"
   * });
   */
  public injectComponentDirective(
    options: InjectComponentDirectiveOptions
  ): AgentWidgetMessage {
    const {
      component,
      props = {},
      text = "",
      llmContent,
      id,
      createdAt,
      sequence
    } = options;

    const directive: { text: string; component: string; props: Record<string, unknown> } = {
      text,
      component,
      props
    };

    return this.injectMessage({
      role: "assistant",
      content: text,
      rawContent: JSON.stringify(directive),
      ...(llmContent !== undefined && { llmContent }),
      ...(id !== undefined && { id }),
      ...(createdAt !== undefined && { createdAt }),
      ...(sequence !== undefined && { sequence })
    });
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
    options?: { assistantMessageId?: string; allowReentry?: boolean }
  ): Promise<void> {
    if (this.streaming && !options?.allowReentry) return;
    if (!options?.allowReentry) {
      this.abortController?.abort();
    }

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

    // Show the standalone typing indicator immediately while we wait for the
    // approval round-trip. Install an abortController so cancel() works during
    // the silent gap. See `resolveAskUserQuestion` for the same pattern.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setStreaming(true);

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
          await this.connectStream(stream, { allowReentry: true });
        } else {
          if (decision === 'denied') {
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
          // No body to pipe — drop the pre-set streaming flag so the indicator
          // doesn't linger forever.
          this.setStreaming(false);
          this.abortController = null;
        }
      } else {
        // onDecision returned void / no response — drop the pre-set flag.
        this.setStreaming(false);
        this.abortController = null;
      }
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
         error.message.includes('aborted') ||
         error.message.includes('abort'));

      this.setStreaming(false);
      this.abortController = null;

      if (!isAbortError) {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  /**
   * Resolve a paused `ask_user_question` LOCAL tool call.
   *
   * When the server emits `step_await` for `ask_user_question`, the widget
   * renders the answer-pill sheet and calls this method once the user
   * picks. Steps:
   *   1. POST the answer to `/resume` via `client.resumeFlow`.
   *   2. Pipe the resulting SSE stream through `connectStream()` so the
   *      paused agent execution continues.
   *   3. Append a user-visible bubble with the answer text so the
   *      transcript reads naturally.
   */
  /**
   * Persist in-progress answers and the current page index for a multi-question
   * `ask_user_question` payload, so a refresh resumes on the same page with
   * prior answers intact. Called by ui.ts on every Back/Next/pick interaction.
   */
  public persistAskUserQuestionProgress(
    toolMessage: AgentWidgetMessage,
    progress: {
      answers: Record<string, string | string[]>;
      currentIndex: number;
    }
  ): void {
    const current = this.messages.find((m) => m.id === toolMessage.id);
    if (!current) return;
    this.upsertMessage({
      ...current,
      agentMetadata: {
        ...current.agentMetadata,
        askUserQuestionAnswers: progress.answers,
        askUserQuestionIndex: progress.currentIndex,
      },
    });
  }

  /**
   * Flip an `ask_user_question` tool message from awaiting → answered so
   * render passes stop re-mounting its answer-pill sheet. Idempotent.
   * When `answers` is provided, persists the full structured answer Record
   * atomically with the answered flag — guarding against later events that
   * could re-emit the tool message and clobber the per-pick persisted
   * answers via top-level merge.
   */
  public markAskUserQuestionResolved(
    toolMessage: AgentWidgetMessage,
    answers?: Record<string, string | string[]>
  ): void {
    const current = this.messages.find((m) => m.id === toolMessage.id);
    if (!current) return;
    this.upsertMessage({
      ...current,
      agentMetadata: {
        ...current.agentMetadata,
        awaitingLocalTool: false,
        askUserQuestionAnswered: true,
        ...(answers ? { askUserQuestionAnswers: answers } : {}),
      },
    });
  }

  public async resolveAskUserQuestion(
    toolMessage: AgentWidgetMessage,
    answer: string | Record<string, string | string[]>
  ): Promise<void> {
    // Idempotent — guards against rapid double-clicks on answer pills before
    // the re-render swaps the card to its collapsed/answered state.
    const live = this.messages.find((m) => m.id === toolMessage.id);
    if (live?.agentMetadata?.askUserQuestionAnswered === true) return;

    const executionId = toolMessage.agentMetadata?.executionId;
    const toolName = toolMessage.toolCall?.name;
    if (!executionId || !toolName) {
      this.callbacks.onError?.(
        new Error(
          "resolveAskUserQuestion: message is missing executionId or toolCall.name"
        )
      );
      return;
    }

    // Flip answered flag first so the next render skips the sheet re-mount,
    // avoiding the race between removeAskUserQuestionSheet's 180ms slide-out
    // timer and the renders that fire as the resume stream lands. Pass the
    // structured answer Record (when present) so it's atomically persisted
    // alongside the flag — the answered-state review card depends on
    // `agentMetadata.askUserQuestionAnswers` being populated at render time.
    //
    // For single-question payloads, callers (built-in pick handler, plugins)
    // resolve with a plain string. Derive a `{ [questionText]: answer }` Record
    // from the toolCall args so the answered-card render path is consistent
    // with grouped flows.
    let structuredAnswers: Record<string, string | string[]> | undefined =
      typeof answer === "string" ? undefined : answer;
    if (structuredAnswers === undefined && typeof answer === "string") {
      const args = toolMessage.toolCall?.args as
        | { questions?: Array<{ question?: unknown }> }
        | undefined;
      const questions = Array.isArray(args?.questions) ? args!.questions : [];
      if (questions.length === 1) {
        const qText = typeof questions[0]?.question === "string"
          ? (questions[0].question as string)
          : "";
        if (qText) structuredAnswers = { [qText]: answer };
      }
    }
    this.markAskUserQuestionResolved(toolMessage, structuredAnswers);

    // Show the standalone typing indicator immediately — the network round-trip
    // to /resume is otherwise silent, which reads as broken. The render
    // condition in ui.ts already shows the indicator once streaming flips true
    // and the last message is a user bubble (the answer we inject below).
    // Install an abortController so cancel() works during this silent gap.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setStreaming(true);

    // Inject Q→A pair messages — one assistant bubble per question, one user
    // bubble per answer — so the transcript reads like a normal conversation.
    // The original ask_user_question tool message is suppressed by the
    // renderer once `askUserQuestionAnswered` is true. Skipped questions get
    // a muted italic `*Skipped*` user bubble (rendered through the standard
    // markdown pipeline).
    const toolCallId = toolMessage.toolCall!.id;
    const args = toolMessage.toolCall?.args as
      | { questions?: Array<{ question?: unknown; header?: unknown }> }
      | undefined;
    const questions = Array.isArray(args?.questions) ? args!.questions : [];
    if (questions.length === 0) {
      const fallback =
        typeof answer === "string"
          ? answer
          : Object.entries(answer)
              .map(
                ([q, v]) => `${q}: ${Array.isArray(v) ? v.join(", ") : v}`
              )
              .join(" | ");
      this.appendMessage({
        id: `ask-user-answer-${toolCallId}`,
        role: "user",
        content: fallback,
        createdAt: new Date().toISOString(),
        streaming: false,
        sequence: this.nextSequence(),
      });
    } else {
      const stored = structuredAnswers ?? {};
      questions.forEach((p, i) => {
        const qText = typeof p?.question === "string" ? p.question : "";
        if (!qText) return;
        const ans = stored[qText];
        const answerStr = Array.isArray(ans)
          ? ans.join(", ")
          : typeof ans === "string"
            ? ans
            : "";
        this.appendMessage({
          id: `ask-user-q-${toolCallId}-${i}`,
          role: "assistant",
          content: qText,
          createdAt: new Date().toISOString(),
          streaming: false,
          sequence: this.nextSequence(),
        });
        this.appendMessage({
          id: `ask-user-a-${toolCallId}-${i}`,
          role: "user",
          content: answerStr || "*Skipped*",
          createdAt: new Date().toISOString(),
          streaming: false,
          sequence: this.nextSequence(),
        });
      });
    }

    try {
      const response = await this.client.resumeFlow(executionId, {
        [toolName]: answer,
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(
          errorData?.error ?? `Resume failed: ${response.status}`
        );
      }

      if (response.body) {
        await this.connectStream(response.body, { allowReentry: true });
      } else {
        // No body to pipe — drop the pre-set streaming flag so the indicator
        // doesn't linger forever.
        this.setStreaming(false);
        this.abortController = null;
      }
    } catch (error) {
      // Mirror sendMessage: a cancel() during the await aborts the controller
      // and surfaces an AbortError — don't treat that as a real failure.
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
         error.message.includes('aborted') ||
         error.message.includes('abort'));

      this.setStreaming(false);
      this.abortController = null;

      if (!isAbortError) {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error))
        );
      }
    }
  }

  /**
   * Resolve a paused `webmcp:*` LOCAL tool call by executing it against the
   * host page's tool registry and posting the result to `/resume`.
   *
   * Triggered automatically from `handleEvent` when a `step_await`-derived
   * message arrives with a `webmcp:` prefix — the user does not click a
   * pill; the bridge's confirm-bubble gate is the only interactive surface.
   *
   * Idempotent on the message's `toolCall.id`: re-emits of the same step_await
   * (e.g. from message coalescing) won't double-fire `tool.execute`. Failure
   * modes — declined, timed out, throw, unknown tool — all resolve into a
   * `{ isError: true, content: [...] }` payload that resumes the dispatch
   * cleanly so the agent can recover.
   */
  public async resolveWebMcpToolCall(
    toolMessage: AgentWidgetMessage,
  ): Promise<void> {
    const executionId = toolMessage.agentMetadata?.executionId;
    const wireToolName = toolMessage.toolCall?.name;
    const toolCallId = toolMessage.toolCall?.id;
    if (!executionId || !wireToolName || !toolCallId) return;

    // Dedupe: a single step_await may emit multiple message snapshots; only
    // one should drive the resume round-trip. The set is NEVER cleared — see
    // `webMcpHandledToolCallIds` doc comment.
    if (this.webMcpHandledToolCallIds.has(toolCallId)) return;
    this.webMcpHandledToolCallIds.add(toolCallId);

    // Mark resolved on the message so the UI's local-tool sheet (if any
    // generic one ever lands) does not show — this is a fully-automatic
    // tool from the user's perspective, modulo the confirm bubble.
    this.upsertMessage({
      ...toolMessage,
      agentMetadata: {
        ...toolMessage.agentMetadata,
        awaitingLocalTool: false,
      },
    });

    // Show the streaming indicator across the network round-trip. /resume
    // is otherwise silent until the new SSE stream arrives.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setStreaming(true);

    const args = toolMessage.toolCall?.args;
    const execPromise = this.client.executeWebMcpToolCall(wireToolName, args);
    if (!execPromise) {
      // Client has no bridge (config.webmcp not set). Resume with an error so
      // the dispatch can advance instead of hanging.
      await this.resumeWithToolOutput(executionId, wireToolName, {
        isError: true,
        content: [
          {
            type: "text",
            text: "WebMCP not enabled on this widget.",
          },
        ],
      });
      return;
    }

    try {
      const result = await execPromise;
      await this.resumeWithToolOutput(executionId, wireToolName, result);
    } catch (error) {
      // The bridge normalizes errors into result objects, so reaching this
      // catch means a network failure during /resume. Surface to onError.
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("abort"));
      this.setStreaming(false);
      this.abortController = null;
      if (!isAbortError) {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    }
    // No `finally` cleanup — `webMcpHandledToolCallIds` is intentionally
    // permanent for the lifetime of the session.
  }

  /**
   * POST `/resume` with a single tool's output and pipe the resulting SSE
   * stream back through `connectStream`. Shared by every local-tool resolve
   * path (ask_user_question and WebMCP).
   */
  private async resumeWithToolOutput(
    executionId: string,
    toolName: string,
    output: unknown,
  ): Promise<void> {
    const response = await this.client.resumeFlow(executionId, {
      [toolName]: output,
    });
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error ?? `Resume failed: ${response.status}`);
    }
    if (response.body) {
      await this.connectStream(response.body, { allowReentry: true });
    } else {
      this.setStreaming(false);
      this.abortController = null;
    }
  }

  public cancel() {
    this.abortController?.abort();
    this.abortController = null;
    // Stop any in-progress audio too — when the user hits "stop", they want
    // the assistant to actually stop talking, not just stop generating tokens.
    // Both helpers are safe no-ops when audio isn't configured.
    this.stopSpeaking();
    this.stopVoicePlayback();
    this.setStreaming(false);
    this.setStatus("idle");
  }

  public clearMessages() {
    this.stopSpeaking();
    this.abortController?.abort();
    this.abortController = null;
    this.messages = [];
    this.agentExecution = null;
    this.clearArtifactState();
    this.setStreaming(false);
    this.setStatus("idle");
    this.callbacks.onMessagesChanged([...this.messages]);
  }

  public getArtifacts(): PersonaArtifactRecord[] {
    return [...this.artifacts.values()];
  }

  public getArtifactById(id: string): PersonaArtifactRecord | undefined {
    return this.artifacts.get(id);
  }

  public getSelectedArtifactId(): string | null {
    return this.selectedArtifactId;
  }

  public selectArtifact(id: string | null): void {
    this.selectedArtifactId = id;
    this.emitArtifactsState();
  }

  public clearArtifacts(): void {
    this.clearArtifactState();
  }

  public upsertArtifact(manual: PersonaArtifactManualUpsert): PersonaArtifactRecord {
    const id =
      manual.id ||
      `art_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
    if (manual.artifactType === "markdown") {
      const rec: PersonaArtifactRecord = {
        id,
        artifactType: "markdown",
        title: manual.title,
        status: "complete",
        markdown: manual.content
      };
      this.artifacts.set(id, rec);
      this.selectedArtifactId = id;
      this.emitArtifactsState();
      return rec;
    }
    const rec: PersonaArtifactRecord = {
      id,
      artifactType: "component",
      title: manual.title,
      status: "complete",
      component: manual.component,
      props: manual.props ?? {}
    };
    this.artifacts.set(id, rec);
    this.selectedArtifactId = id;
    this.emitArtifactsState();
    return rec;
  }

  private clearArtifactState(): void {
    if (this.artifacts.size === 0 && this.selectedArtifactId === null) return;
    this.artifacts.clear();
    this.selectedArtifactId = null;
    this.emitArtifactsState();
  }

  private emitArtifactsState(): void {
    this.callbacks.onArtifactsState?.({
      artifacts: [...this.artifacts.values()],
      selectedId: this.selectedArtifactId
    });
  }

  private applyArtifactStreamEvent(ev: AgentWidgetEvent): void {
    switch (ev.type) {
      case "artifact_start": {
        if (ev.artifactType === "markdown") {
          this.artifacts.set(ev.id, {
            id: ev.id,
            artifactType: "markdown",
            title: ev.title,
            status: "streaming",
            markdown: ""
          });
        } else {
          this.artifacts.set(ev.id, {
            id: ev.id,
            artifactType: "component",
            title: ev.title,
            status: "streaming",
            component: ev.component ?? "",
            props: {}
          });
        }
        this.selectedArtifactId = ev.id;
        break;
      }
      case "artifact_delta": {
        const row = this.artifacts.get(ev.id);
        if (row?.artifactType === "markdown") {
          row.markdown = (row.markdown ?? "") + ev.artDelta;
        }
        break;
      }
      case "artifact_update": {
        const row = this.artifacts.get(ev.id);
        if (row?.artifactType === "component") {
          row.props = { ...row.props, ...ev.props };
          if (ev.component) row.component = ev.component;
        }
        break;
      }
      case "artifact_complete": {
        const row = this.artifacts.get(ev.id);
        if (row) row.status = "complete";
        break;
      }
      default:
        return;
    }
    this.emitArtifactsState();
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

  public hydrateArtifacts(
    artifacts: PersonaArtifactRecord[],
    selectedId: string | null = null
  ) {
    this.artifacts.clear();
    for (const rec of artifacts) {
      this.artifacts.set(rec.id, { ...rec, status: "complete" });
    }
    this.selectedArtifactId = selectedId;
    this.emitArtifactsState();
  }

  private handleEvent = (event: AgentWidgetEvent) => {
    if (event.type === "message") {
      this.upsertMessage(event.message);

      // WebMCP auto-resolve: when a step_await emits a tool-variant message
      // for a `webmcp:*` tool, drive the bridge to execute it and post the
      // result to /resume. Unlike ask_user_question, no user pill click is
      // required — the bridge's confirm bubble is the only interactive surface.
      //
      // ALWAYS resolve when the wire name carries the `webmcp:` prefix, even
      // if the bridge is non-operational (e.g. surface-side config enabled it
      // but this embed didn't). Otherwise the dispatch stays paused
      // indefinitely — `resolveWebMcpToolCall` translates the missing-bridge
      // case into an isError result that resumes the flow cleanly.
      const tc = event.message.toolCall;
      if (
        event.message.agentMetadata?.awaitingLocalTool === true &&
        tc?.name &&
        isWebMcpToolName(tc.name)
      ) {
        // Fire-and-forget — `resolveWebMcpToolCall` owns its own error path
        // (translates failures into MCP isError results so /resume succeeds).
        void this.resolveWebMcpToolCall(event.message);
      }

      // Track agent execution state from message metadata
      if (event.message.agentMetadata?.executionId) {
        if (!this.agentExecution) {
          this.agentExecution = {
            executionId: event.message.agentMetadata.executionId,
            agentId: '',
            agentName: event.message.agentMetadata.agentName ?? '',
            status: 'running',
            currentIteration: event.message.agentMetadata.iteration ?? 0,
            maxTurns: 0
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
    } else if (
      event.type === "artifact_start" ||
      event.type === "artifact_delta" ||
      event.type === "artifact_update" ||
      event.type === "artifact_complete"
    ) {
      this.applyArtifactStreamEvent(event);
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

    this.messages = this.messages.map((existing, idx) => {
      if (idx !== index) return existing;
      const merged = { ...existing, ...withSequence };
      // Preserve `ask_user_question` answered state across re-emissions.
      // Top-level merge would otherwise replace `agentMetadata` wholesale —
      // post-resume events (e.g. `tool_complete` re-emitted from a stale
      // client-side cache) would wipe `askUserQuestionAnswered` and
      // `askUserQuestionAnswers`, causing the answered review card to
      // lose its answers and revert to "(skipped)" placeholders.
      if (
        existing.agentMetadata?.askUserQuestionAnswered === true &&
        withSequence.agentMetadata
      ) {
        merged.agentMetadata = {
          ...withSequence.agentMetadata,
          askUserQuestionAnswered: true,
          ...(existing.agentMetadata.askUserQuestionAnswers
            ? {
                askUserQuestionAnswers:
                  existing.agentMetadata.askUserQuestionAnswers,
              }
            : {}),
          // Keep awaiting flag false once resolved — never let a stale
          // re-emit flip us back to awaiting.
          awaitingLocalTool: false,
        };
      }
      return merged;
    });
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
