import { AgentWidgetClient, type SSEEventCallback } from "./client";
import { isWebMcpToolName } from "./webmcp-bridge";
import {
  SUGGEST_REPLIES_TOOL_NAME,
  suggestRepliesToolResult,
} from "./suggest-replies-tool";
import {
  AgentWidgetConfig,
  AgentWidgetEvent,
  AgentWidgetMessage,
  AgentWidgetApproval,
  AgentWidgetApprovalDecisionOptions,
  WebMcpConfirmInfo,
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
  ReadAloudState,
  SpeechEngine
} from "./types";
import {
  createVoiceProvider,
  isVoiceSupported,
  BrowserSpeechEngine,
  pickBestVoice,
  ReadAloudController,
  type ReadAloudListener
} from "./voice";
import { resolveSpeakableText } from "./utils/speech-text";

export type AgentWidgetSessionStatus =
  | "idle"
  | "connecting"
  | "connected"
  | "error";

/**
 * Config fields the `AgentWidgetClient` reads to shape the connection and each
 * request. When NONE of these change, `updateConfig` can refresh the live
 * client in place (preserving the WebMCP bridge and any in-flight stream/resume)
 * instead of swapping in a fresh client and tearing down WebMCP state. Fields
 * outside this list (theme, copy, layout, suggestionChips, iterationDisplay,
 * postprocessMessage, feature display toggles, …) are display-only and safe to
 * apply mid-turn: which is what a self-styling widget needs when a `webmcp:*`
 * theme tool re-renders the widget while the agent's turn is still streaming.
 *
 * Compared by identity (`!==`): primitives by value, functions/objects by
 * reference. A consumer that rebuilds these objects on every render simply
 * takes the (still-correct) full-rebuild path. The default is therefore safe:
 * anything not explicitly listed here can never strand a paused turn.
 */
const CONNECTION_CONFIG_KEYS = [
  "apiUrl",
  "clientToken",
  "flowId",
  "agent",
  "agentOptions",
  "headers",
  "getHeaders",
  "webmcp",
  "streamParser",
  "parserType",
  "contextProviders",
  "requestMiddleware",
  "customFetch",
  "parseSSEEvent",
  "onSessionInit",
  "onSessionExpired",
  "getStoredSessionId",
  "setStoredSessionId",
] as const satisfies ReadonlyArray<keyof AgentWidgetConfig>;

function connectionConfigChanged(
  prev: AgentWidgetConfig,
  next: AgentWidgetConfig,
): boolean {
  return CONNECTION_CONFIG_KEYS.some((key) => prev[key] !== next[key]);
}

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

/**
 * Build the user-facing content shown when a dispatch fails before any
 * assistant content streamed back. This fires on real network/server errors
 * (connection refused, CORS, 4xx/5xx, malformed stream): not just an
 * un-wired proxy, so the copy stays honest about the failure and surfaces the
 * underlying reason to help with debugging.
 *
 * Callers can override the copy via `config.errorMessage` (a static string or
 * a function of the error). An override that returns an empty string yields ""
 * here, which the caller treats as "suppress the fallback bubble".
 */
function buildDispatchErrorContent(
  error: unknown,
  override?: AgentWidgetConfig["errorMessage"]
): string {
  const err = error instanceof Error ? error : new Error(String(error));

  if (typeof override === "string") return override;
  if (typeof override === "function") return override(err);

  const base =
    "Sorry: I couldn't reach the assistant. The chat service didn't respond. Please check that your proxy or backend is running and reachable, then try again.";
  return err.message ? `${base}\n\n_Details: ${err.message}_` : base;
}

const buildWebMcpErrorResult = (message: string) => ({
  isError: true,
  content: [{ type: "text" as const, text: message }],
});

const getWebMcpErrorMessage = (
  error: unknown,
  fallback = "WebMCP tool execution failed.",
): string => {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
};

/**
 * Tool names whose `step_await` the widget resolves automatically (no user
 * pill click): `webmcp:*` page tools and the built-in fire-and-forget
 * `suggest_replies`. These share the await-batch / dedupe / resume machinery;
 * `ask_user_question` is NOT one of them: it blocks on the answer sheet.
 */
const isAutoResolvedLocalToolName = (name: string): boolean =>
  isWebMcpToolName(name) || name === SUGGEST_REPLIES_TOOL_NAME;

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

  // WebMCP dedupe: keys are `${executionId}:${toolCallId}` so they're
  // naturally scoped to a single dispatch. A later dispatch (new executionId)
  // that happens to recycle a `toolCall.id` never collides with prior entries,
  // and a stale re-emit from an in-flight prior dispatch stays blocked because
  // its executionId is still in the set.
  //
  //   webMcpInflightKeys: currently executing; cleared on completion of
  //                         EITHER /resume success OR /resume throw. Blocks
  //                         concurrent re-fire during the resolve round-trip.
  //   webMcpResolvedKeys: /resume HTTP returned 2xx; not cleared on a new
  //                         dispatch (executionId scoping makes that
  //                         unnecessary). Blocks stale step_await re-emits
  //                         for the same execution.
  //
  // If `/resume` throws (network error, server 5xx), we DO want a retry path:
  // the dispatch is recoverable. Such a tool stays in neither set, so a
  // subsequent re-emit will re-trigger.
  private webMcpInflightKeys: Set<string> = new Set();
  private webMcpResolvedKeys: Set<string> = new Set();
  // Per-resolve AbortControllers, kept in a set so multiple `webmcp:*`
  // step_await resolves in one turn never abort one another. The shared
  // `this.abortController` is intentionally NOT used by resolveWebMcpToolCall:
  // in a CHAINED turn (tool A → /resume → tool B, where the server emits B's
  // step_await inside A's resume SSE stream) the shared controller is still
  // piping A's resume stream: the very stream that just delivered B. Aborting
  // it mid-chain (the prior shared-controller pre-abort) tore that stream down,
  // so B never reached execute() and its /resume was never POSTed, pausing the
  // dispatch forever. cancel(), clearMessages(), hydrateMessages(), and
  // sendMessage() iterate this set to tear every in-flight resolve down on a
  // real stop / new turn.
  private webMcpResolveControllers: Set<AbortController> = new Set();
  // Bumped on every teardown / new-turn boundary (cancel, clearMessages,
  // hydrateMessages, sendMessage). A resolveWebMcpToolCall deferred via
  // queueMicrotask captures the epoch at queue time and bails if it changed,
  // so a resolve queued just before a teardown can't escape it by installing a
  // fresh controller after the set was already cleared.
  private webMcpEpoch = 0;
  // WebMCP native approval-bubble gate. When no custom `webmcp.onConfirm` is
  // supplied, the bridge's confirm handler routes here: we inject an
  // approval-variant message and park the bridge on a Promise that resolves
  // when the user clicks Approve/Deny (see requestWebMcpApproval /
  // resolveWebMcpApproval). Resolvers are keyed by the approval message id.
  private webMcpApprovalResolvers: Map<string, (approved: boolean) => void> =
    new Map();
  private webMcpApprovalSeq = 0;
  // Parallel local-tool batching (core#3878). A single model turn can emit
  // multiple `step_await(local_tool_required)` events for ONE paused
  // executionId: including two PARALLEL calls to the SAME tool ("add SHOE-001
  // and SHOE-007"). Those collapse to an identical `toolId`/`index` and differ
  // only by the per-call `webMcpToolCallId`. We collect all awaits for an
  // executionId that arrive in the same stream tick, then post ONE `/resume`
  // keyed by `webMcpToolCallId`: NOT one `/resume` per tool keyed by name
  // (which collides for same-tool calls, and whose concurrent posts on one
  // execution raced → the second 404'd → the turn hung). Keyed by executionId;
  // `seen` dedupes duplicate step_await re-emits within a batch. Cleared on
  // every teardown via `abortWebMcpResolves`.
  private webMcpAwaitBatches: Map<
    string,
    { snapshots: AgentWidgetMessage[]; seen: Set<string> }
  > = new Map();

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
    this.wireDefaultWebMcpConfirm();

    // Hydrate artifacts from config (mirrors `initialMessages`). Restored
    // records are forced to `status: "complete"`: a mid-stream artifact should
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

  /** Tear down the barge-in mic pipeline: "hang up" the always-on mic */
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

  // Owns the per-message "Read aloud" action and the auto-speak path: which
  // message is active, its play/pause state, and the speech engine. The engine
  // is resolved lazily on first playback (inside the user gesture) so a hosted
  // engine via `textToSpeech.createEngine` plugs in without changing this class.
  private readAloud = new ReadAloudController(() => this.createSpeechEngine());

  /** Resolve the speech engine: a configured hosted engine, else the browser. */
  private createSpeechEngine(): SpeechEngine | Promise<SpeechEngine> | null {
    const tts = this.config.textToSpeech;
    if (tts?.createEngine) return tts.createEngine();
    if (!BrowserSpeechEngine.isSupported()) return null;
    return new BrowserSpeechEngine({ pickVoice: tts?.pickVoice });
  }

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
      const processingErrorText = voiceRecognitionConfig.processingErrorText ?? 'Voice processing failed. Please try again.';

      // STT-style providers (browser + bring-your-own `custom`) deliver a final
      // transcript that we send as a normal user message: the agent then runs
      // via the standard SSE chat path. Only the realtime `runtype` provider is
      // excluded here: it owns the whole turn and drives onTranscript below.
      this.voiceProvider.onResult((result) => {
        if (result.provider !== 'runtype') {
          if (result.text && result.text.trim()) {
            this.sendMessage(result.text, { viaVoice: true });
          }
        }
      });

      // Realtime (runtype) voice: drive the chat thread from streaming
      // transcript frames. Live interim user text grows in place; the user
      // message finalizes immediately on transcript_final{user}; the assistant
      // reply lands (a single block, synced with audio) on its final frame.
      // In-flight bubbles carry voiceProcessing=true so consumers can style
      // them via messageTransform; it clears once the text is final.
      if (this.voiceProvider.onTranscript) {
        this.voiceProvider.onTranscript((role, text, isFinal) => {
          if (role === 'user') {
            if (!this.pendingVoiceUserMessageId) {
              const msg = this.injectMessage({
                role: 'user',
                content: text,
                streaming: false,
                voiceProcessing: !isFinal
              });
              this.pendingVoiceUserMessageId = msg.id;
            } else {
              this.upsertMessage({
                id: this.pendingVoiceUserMessageId,
                role: 'user',
                content: text,
                createdAt: new Date().toISOString(),
                streaming: false,
                voiceProcessing: !isFinal
              });
            }

            if (isFinal) {
              // User finished: the agent is now thinking. Release the user
              // bubble (a new interim starts a fresh turn) and show a typing
              // indicator in a fresh assistant placeholder.
              this.pendingVoiceUserMessageId = null;
              const assistantMsg = this.injectMessage({
                role: 'assistant',
                content: '',
                streaming: true,
                voiceProcessing: true
              });
              this.pendingVoiceAssistantMessageId = assistantMsg.id;
              this.setStreaming(true);
            }
          } else {
            // assistant: runtype sends a single final; the isFinal=false path
            // is reserved for delta-streaming providers (future BYO).
            if (this.pendingVoiceAssistantMessageId) {
              this.upsertMessage({
                id: this.pendingVoiceAssistantMessageId,
                role: 'assistant',
                content: text,
                createdAt: new Date().toISOString(),
                streaming: !isFinal,
                voiceProcessing: !isFinal
              });
            } else {
              const msg = this.injectMessage({
                role: 'assistant',
                content: text,
                streaming: !isFinal,
                voiceProcessing: !isFinal
              });
              this.pendingVoiceAssistantMessageId = msg.id;
            }

            if (isFinal) {
              // The provider plays this reply's audio: mark it spoken so
              // browser TTS doesn't double-speak when streaming ends. Must run
              // BEFORE setStreaming(false), which triggers the TTS check.
              if (this.pendingVoiceAssistantMessageId) {
                this.ttsSpokenMessageIds.add(this.pendingVoiceAssistantMessageId);
              }
              this.setStreaming(false);
              this.pendingVoiceAssistantMessageId = null;
            }
          }
        });
      }

      // Surface per-turn latency metrics to the optional config hook.
      if (this.voiceProvider.onMetrics) {
        this.voiceProvider.onMetrics((metrics) => {
          this.config.voiceRecognition?.onMetrics?.(metrics);
        });
      }

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
            // Default credentials/endpoint from the widget config so the minimum
            // voice config collapses to just `agentId`.
            clientToken: providerConfig.runtype?.clientToken ?? this.config.clientToken,
            host: providerConfig.runtype?.host ?? this.config.apiUrl,
            voiceId: providerConfig.runtype?.voiceId,
            createPlaybackEngine: providerConfig.runtype?.createPlaybackEngine
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

      case 'custom':
        // Bring-your-own provider: pass the instance/factory straight through
        // to the factory, which resolves and validates it.
        return {
          type: 'custom',
          custom: providerConfig.custom
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
    const merged = { ...this.config, ...next };

    // Connection/request-shaping change (apiUrl, clientToken, webmcp, headers,
    // parser, agent, …) → full client rebuild. UI-only change (theme, copy,
    // layout, suggestions, …) → refresh in place so the live stream, WebMCP
    // bridge, and any in-flight resolve survive. The latter is what makes a
    // self-styling widget work: a `webmcp:*` theme tool mutates config and
    // re-renders mid-turn; recreating the client there would abort the very
    // turn that's restyling the widget and strand the paused execution.
    if (!connectionConfigChanged(this.config, merged)) {
      this.config = merged;
      this.client.updateConfig(merged);
      return;
    }

    // Replacing the client invalidates every in-flight WebMCP resolve, buffered
    // parallel-await batch, and pending approval bubble tied to the OLD client/
    // session. Tear them down BEFORE the swap (the new client has no session
    // yet) so a deferred batch flush or a parked confirm can't fire against the
    // fresh client: in client-token mode that would POST /resume without a
    // valid sessionId and strand the paused turn. Mirrors clearMessages' WebMCP
    // reset; the client swap already abandons any in-flight stream regardless.
    this.abortWebMcpResolves();
    this.webMcpInflightKeys.clear();
    this.webMcpResolvedKeys.clear();
    const prevSSECallback = this.client.getSSEEventCallback();
    this.config = merged;
    this.client = new AgentWidgetClient(this.config);
    this.wireDefaultWebMcpConfirm();
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
   * an assistant message: the same shape Persona produces from a streamed
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
    // A new user turn supersedes any in-flight WebMCP resolve from the prior
    // turn. Tear them down here (they own controllers separate from the shared
    // one) so a lingering resolve can't race the new dispatch or post a stale
    // /resume against a superseded execution.
    this.abortWebMcpResolves();

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
        const content = buildDispatchErrorContent(
          error,
          this.config.errorMessage
        );
        // An override that returns "" suppresses the fallback bubble entirely
        // (onError still fires below).
        if (content) {
          const fallback: AgentWidgetMessage = {
            id: assistantMessageId, // Use the pre-generated ID for fallback too
            role: "assistant",
            createdAt: new Date().toISOString(),
            content,
            sequence: this.nextSequence()
          };

          this.appendMessage(fallback);
        }
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
      // Check if this is an abort error (a prior in-flight stream was canceled,
      // the user navigated away, etc.). In these cases, don't show fallback or
      // fire onError - the request was intentionally interrupted.
      const isAbortError =
        error instanceof Error &&
        (error.name === 'AbortError' ||
         error.message.includes('aborted') ||
         error.message.includes('abort'));

      if (!isAbortError) {
        const content = buildDispatchErrorContent(
          error,
          this.config.errorMessage
        );
        // An override that returns "" suppresses the fallback bubble entirely
        // (onError still fires below).
        if (content) {
          const fallback: AgentWidgetMessage = {
            id: assistantMessageId,
            role: "assistant",
            createdAt: new Date().toISOString(),
            content,
            sequence: this.nextSequence()
          };

          this.appendMessage(fallback);
        }
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
      // Mirror the idle/error handlers: a failed resume stream must not tear
      // down streaming/abortController while another WebMCP resolve is still
      // confirming or executing. The in-flight resolve's `finally` owns the
      // teardown once `webMcpResolveControllers` drains.
      if (this.webMcpResolveControllers.size === 0) {
        this.setStreaming(false);
        this.abortController = null;
      }
      this.callbacks.onError?.(
        error instanceof Error ? error : new Error(String(error))
      );
    }
  }

  /**
   * Install the native approval-bubble confirm handler on the WebMCP bridge
   * when the integrator hasn't supplied a custom `webmcp.onConfirm`. Without
   * this, the bridge falls back to a blunt `window.confirm`. Safe to call
   * repeatedly (e.g. after the client is re-created in `updateConfig`).
   */
  private wireDefaultWebMcpConfirm(): void {
    const webmcp = this.config.webmcp;
    if (webmcp?.enabled === true && !webmcp.onConfirm) {
      this.client.setWebMcpConfirmHandler((info) =>
        this.requestWebMcpApproval(info)
      );
    }
  }

  /**
   * Default WebMCP confirm gate: render Persona's native in-panel approval
   * bubble and resolve when the user clicks Approve/Deny. Returns immediately
   * with `true` when `webmcp.autoApprove(info)` opts the tool out of the gate
   * (e.g. a read-only catalog search), so no bubble is shown. The bridge
   * awaits this Promise before executing the page tool.
   */
  public requestWebMcpApproval(info: WebMcpConfirmInfo): Promise<boolean> {
    // Per-tool policy hook: auto-allow opted-out tools without any UI. A
    // throwing predicate must not block the call, so fall through to an
    // explicit gate on error.
    try {
      if (this.config.webmcp?.autoApprove?.(info) === true) {
        return Promise.resolve(true);
      }
    } catch {
      // fall through to explicit approval
    }

    const approval: AgentWidgetApproval = {
      id: `webmcp-${++this.webMcpApprovalSeq}`,
      status: "pending",
      agentId: "",
      executionId: "",
      toolName: info.toolName,
      toolType: "webmcp",
      description:
        info.description ?? `Allow the assistant to run ${info.toolName}?`,
      parameters: info.args,
    };
    const approvalMessageId = `approval-${approval.id}`;

    this.upsertMessage({
      id: approvalMessageId,
      role: "assistant",
      content: "",
      createdAt: new Date().toISOString(),
      streaming: false,
      variant: "approval",
      approval,
    });

    return new Promise<boolean>((resolve) => {
      this.webMcpApprovalResolvers.set(approvalMessageId, resolve);
    });
  }

  /**
   * Resolve a pending WebMCP approval bubble (from the Approve/Deny click in
   * `ui.ts`). Updates the bubble to its resolved state and unblocks the
   * bridge Promise parked in `requestWebMcpApproval`. No-op if already
   * resolved (double-click, re-render).
   */
  public resolveWebMcpApproval(
    approvalMessageId: string,
    decision: "approved" | "denied"
  ): void {
    const resolve = this.webMcpApprovalResolvers.get(approvalMessageId);
    if (!resolve) return;
    this.webMcpApprovalResolvers.delete(approvalMessageId);

    const existing = this.messages.find((m) => m.id === approvalMessageId);
    if (existing?.approval) {
      this.upsertMessage({
        ...existing,
        approval: {
          ...existing.approval,
          status: decision,
          resolvedAt: Date.now(),
        },
      });
    }

    resolve(decision === "approved");
  }

  /**
   * Resolve a tool approval request (approve or deny).
   * Updates the approval message status, calls the API (or custom onDecision),
   * and pipes the response stream through connectStream().
   */
  public async resolveApproval(
    approval: AgentWidgetApproval,
    decision: 'approved' | 'denied',
    options?: AgentWidgetApprovalDecisionOptions
  ): Promise<void> {
    // 1. Update approval message status immediately for responsive UI
    const approvalMessageId = `approval-${approval.id}`;
    const updatedApproval: AgentWidgetApproval = {
      ...approval,
      status: decision,
      resolvedAt: Date.now(),
    };
    // Anchor the bubble where the agent paused for permission. An approval is a
    // timeline checkpoint, not a "now" event, so resolving it must preserve the
    // original message's createdAt/sequence: otherwise sortMessages (which
    // orders by createdAt first) would re-stamp it to now and float it past any
    // message created later (e.g. a long-pending approval resolved after more
    // conversation, or restored/replayed transcripts).
    const existing = this.messages.find((m) => m.id === approvalMessageId);
    const updatedMessage: AgentWidgetMessage = {
      id: approvalMessageId,
      role: "assistant",
      content: "",
      createdAt: existing?.createdAt ?? new Date().toISOString(),
      ...(existing?.sequence !== undefined ? { sequence: existing.sequence } : {}),
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
          decision,
          options
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
            // No stream body for denied: inject a denial message
            this.appendMessage({
              id: `denial-${approval.id}`,
              role: "assistant",
              content: "Tool execution was denied by user.",
              createdAt: new Date().toISOString(),
              streaming: false,
              sequence: this.nextSequence(),
            });
          }
          // No body to pipe: drop the pre-set streaming flag so the indicator
          // doesn't linger forever.
          this.setStreaming(false);
          this.abortController = null;
        }
      } else {
        // onDecision returned void / no response: drop the pre-set flag.
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
   * atomically with the answered flag: guarding against later events that
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
    // Idempotent: guards against rapid double-clicks on answer pills before
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
    // alongside the flag: the answered-state review card depends on
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

    // Show the standalone typing indicator immediately: the network round-trip
    // to /resume is otherwise silent, which reads as broken. The render
    // condition in ui.ts already shows the indicator once streaming flips true
    // and the last message is a user bubble (the answer we inject below).
    // Install an abortController so cancel() works during this silent gap.
    this.abortController?.abort();
    this.abortController = new AbortController();
    this.setStreaming(true);

    // Inject Q→A pair messages: one assistant bubble per question, one user
    // bubble per answer, so the transcript reads like a normal conversation.
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
        // No body to pipe: drop the pre-set streaming flag so the indicator
        // doesn't linger forever.
        this.setStreaming(false);
        this.abortController = null;
      }
    } catch (error) {
      // Mirror sendMessage: a cancel() during the await aborts the controller
      // and surfaces an AbortError: don't treat that as a real failure.
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
   * Collect an auto-resolving LOCAL-tool `step_await` (`webmcp:*` page tools
   * and the built-in `suggest_replies`) into a per-executionId batch
   * and schedule a single deferred flush. Parallel calls (core#3878) emit
   * several `step_await`s for ONE paused execution within the same stream tick;
   * buffering them and flushing once lets us post ONE `/resume` keyed by the
   * per-call `webMcpToolCallId` rather than racing N name-keyed resumes on the
   * same execution (which 404'd on the second and hung the turn).
   *
   * Deferred via `queueMicrotask` (epoch-guarded) for the same reason the old
   * direct resolve was: handleEvent must return first so the dispatch's
   * `connectStream` sees end-of-stream and releases the shared abortController
   * before a resolve grabs it.
   *
   * Awaits without an `executionId` or `toolCall.id` can't be batched (no key)
   *: route them straight to the single-call path, which surfaces the malformed
   * wire shape via `onError` / an `isError` resume.
   */
  private enqueueWebMcpAwait(toolMessage: AgentWidgetMessage): void {
    const executionId = toolMessage.agentMetadata?.executionId;
    const callId = toolMessage.toolCall?.id;
    if (!executionId || !callId) {
      const queuedEpoch = this.webMcpEpoch;
      queueMicrotask(() => {
        if (queuedEpoch !== this.webMcpEpoch) return;
        void this.resolveWebMcpToolCall(toolMessage);
      });
      return;
    }

    let batch = this.webMcpAwaitBatches.get(executionId);
    if (!batch) {
      batch = { snapshots: [], seen: new Set() };
      this.webMcpAwaitBatches.set(executionId, batch);
    }
    // Duplicate step_await re-emit for a call already in this batch: ignore.
    if (batch.seen.has(callId)) return;
    batch.seen.add(callId);
    batch.snapshots.push(toolMessage);
    // NB: no flush is scheduled here. Flushing happens once the stream that is
    // delivering these awaits ENDS (handleEvent's `status: idle` →
    // scheduleWebMcpBatchFlush). Flushing per-await on the next microtask would
    // race SSE chunk boundaries: two PARALLEL step_awaits split across separate
    // `read()` chunks would flush the first alone and post a partial resume.
    // Waiting for stream end guarantees every parallel await is collected first.
  }

  /**
   * Flush every buffered local-tool await batch, one `/resume` per executionId.
   * Called once a stream ends (`status: idle` / `error`): by then all parallel
   * `step_await`s the stream carried have been collected, even if split across
   * SSE chunks. Deferred via `queueMicrotask` (epoch-guarded) so the idle
   * handler returns first and the stream's end-of-stream teardown (streaming /
   * abortController) settles before a resolve grabs them: the same ordering the
   * single-call resolve always relied on.
   */
  private scheduleWebMcpBatchFlush(): void {
    if (this.webMcpAwaitBatches.size === 0) return;
    const queuedEpoch = this.webMcpEpoch;
    queueMicrotask(() => {
      if (queuedEpoch !== this.webMcpEpoch) return;
      for (const executionId of [...this.webMcpAwaitBatches.keys()]) {
        this.flushWebMcpAwaitBatch(executionId);
      }
    });
  }

  /**
   * Run a buffered batch of local-tool awaits for one executionId. Size 1
   * (single call, or distinct-tool turns that happened to arrive alone) takes
   * the original single-call path; size >1 (parallel calls) takes the batched
   * path that posts ONE `/resume`. The batch is removed from the map up front
   * so any later sibling re-emit (e.g. from a re-pause) forms a fresh batch
   * rather than mutating one already in flight.
   */
  private flushWebMcpAwaitBatch(executionId: string): void {
    const batch = this.webMcpAwaitBatches.get(executionId);
    if (!batch) return;
    this.webMcpAwaitBatches.delete(executionId);
    const { snapshots } = batch;
    if (snapshots.length === 1) {
      void this.resolveWebMcpToolCall(snapshots[0]);
    } else if (snapshots.length > 1) {
      void this.resolveWebMcpToolCallBatch(executionId, snapshots);
    }
  }

  private resolveWebMcpToolStartedAt(
    toolMessage: AgentWidgetMessage,
  ): number {
    const stored = this.messages.find((m) => m.id === toolMessage.id);
    const candidates = [
      stored?.toolCall?.startedAt,
      toolMessage.toolCall?.startedAt,
    ];
    for (const candidate of candidates) {
      if (typeof candidate === "number" && Number.isFinite(candidate)) {
        return candidate;
      }
    }
    return Date.now();
  }

  /**
   * Persisted-resolution guard for `suggest_replies`. The in-memory dedupe
   * sets (`webMcpInflightKeys` / `webMcpResolvedKeys`) are cleared by
   * hydrateMessages/clearMessages/cancel, but `suggestRepliesResolved`
   * survives on the stored message, so a stale `step_await` re-emit after a
   * hydration must not re-POST `/resume` for an already-resolved call (the
   * historical double-resume failure mode the batching work exists to avoid).
   * Checks the LIVE message first; the handleEvent snapshot is a fresh wire
   * skeleton whose metadata never carries the flag.
   */
  private isSuggestRepliesAlreadyResolved(
    toolMessage: AgentWidgetMessage,
  ): boolean {
    if (toolMessage.toolCall?.name !== SUGGEST_REPLIES_TOOL_NAME) return false;
    const stored = this.messages.find((m) => m.id === toolMessage.id);
    return (
      (stored ?? toolMessage).agentMetadata?.suggestRepliesResolved === true
    );
  }

  private markWebMcpToolRunning(
    toolMessage: AgentWidgetMessage,
  ): number {
    const startedAt = this.resolveWebMcpToolStartedAt(toolMessage);
    this.upsertMessage({
      ...toolMessage,
      streaming: true,
      agentMetadata: {
        ...toolMessage.agentMetadata,
        awaitingLocalTool: false,
      },
      toolCall: toolMessage.toolCall
        ? {
            ...toolMessage.toolCall,
            status: "running",
            startedAt,
            completedAt: undefined,
            duration: undefined,
            durationMs: undefined,
          }
        : toolMessage.toolCall,
    });
    return startedAt;
  }

  private markWebMcpToolComplete(
    toolMessage: AgentWidgetMessage,
    result: unknown,
    startedAt: number,
    completedAt = Date.now(),
    extraMetadata?: Partial<
      NonNullable<AgentWidgetMessage["agentMetadata"]>
    >,
  ): void {
    // A teardown such as clearMessages()/hydrateMessages()/new send can remove
    // the bubble while an aborted WebMCP promise is settling. Never resurrect a
    // cleared message just to mark the old resolve complete.
    if (!this.messages.some((message) => message.id === toolMessage.id)) return;
    this.upsertMessage({
      ...toolMessage,
      streaming: false,
      agentMetadata: {
        ...toolMessage.agentMetadata,
        awaitingLocalTool: false,
        ...extraMetadata,
      },
      toolCall: toolMessage.toolCall
        ? {
            ...toolMessage.toolCall,
            status: "complete",
            result,
            startedAt,
            completedAt,
            duration: undefined,
            durationMs: Math.max(0, completedAt - startedAt),
          }
        : toolMessage.toolCall,
    });
  }

  /**
   * Resolve TWO OR MORE parallel local-tool awaits sharing one paused
   * executionId with a SINGLE `/resume` (core#3878). Each call is executed
   * against the page registry concurrently: every gated call renders its own
   * native approval bubble, and a sibling's confirm Promise never blocks
   * another's execution. Outputs are keyed by per-call `webMcpToolCallId`
   * (server prefers it over tool name; name-keying remains the fallback for
   * legacy single/distinct-tool turns), so two calls to the SAME tool no longer
   * collide. The server is tolerant: any call we omit (declined-after-abort,
   * dedupe, exec failure) simply re-pauses and is retried on its re-emit.
   *
   * Mirrors `resolveWebMcpToolCall`'s dedupe / abort / streaming machinery, but
   * shares one resume POST and marks every resolved key on that POST's HTTP OK.
   */
  private async resolveWebMcpToolCallBatch(
    executionId: string,
    snapshots: AgentWidgetMessage[],
  ): Promise<void> {
    type ExecutedWebMcpTool = {
      dedupeKey: string;
      resumeKey: string;
      output: unknown;
      toolMessage: AgentWidgetMessage;
      startedAt: number;
      completedAt: number;
    };
    const claimedKeys: string[] = [];
    const controllers: AbortController[] = [];
    // Dedicated controller for the shared resume fetch so cancel() can abort it
    // alongside the per-call ones (all live in webMcpResolveControllers).
    const resumeController = new AbortController();
    this.webMcpResolveControllers.add(resumeController);
    this.setStreaming(true);

    // Phase 1: execute every pending call concurrently. A null result means
    // the call was deduped, aborted, or threw; it's omitted from the resume and
    // (per the tolerant server) re-pauses for retry.
    const executed = await Promise.all(
      snapshots.map(async (toolMessage) => {
        const wireToolName = toolMessage.toolCall?.name;
        const callId = toolMessage.toolCall?.id;
        if (!wireToolName || !callId) return null;

        const dedupeKey = `${executionId}:${callId}`;
        if (
          this.webMcpInflightKeys.has(dedupeKey) ||
          this.webMcpResolvedKeys.has(dedupeKey) ||
          this.isSuggestRepliesAlreadyResolved(toolMessage)
        ) {
          return null;
        }
        this.webMcpInflightKeys.add(dedupeKey);
        claimedKeys.push(dedupeKey);

        // Clear the awaiting flag and keep the tool bubble running while the
        // browser-side WebMCP promise is in flight. The initial `step_await`
        // only means the server paused for a local tool; it is not completion.
        const startedAt = this.markWebMcpToolRunning(toolMessage);

        // Per-call id wins for resume keying; fall back to the wire tool name
        // for legacy servers that don't emit `webMcpToolCallId`.
        const resumeKey =
          toolMessage.agentMetadata?.webMcpToolCallId ?? wireToolName;

        // Built-in fire-and-forget tool: no bridge, no confirm gate, no
        // browser-side execution: the chips render from the message list and
        // the canned output joins the batch's single /resume.
        if (wireToolName === SUGGEST_REPLIES_TOOL_NAME) {
          return {
            dedupeKey,
            resumeKey,
            output: suggestRepliesToolResult(),
            toolMessage,
            startedAt,
            completedAt: Date.now(),
          };
        }

        const controller = new AbortController();
        this.webMcpResolveControllers.add(controller);
        controllers.push(controller);

        const execPromise = this.client.executeWebMcpToolCall(
          wireToolName,
          toolMessage.toolCall?.args,
          controller.signal,
        );

        let output: unknown;
        if (!execPromise) {
          output = {
            isError: true,
            content: [
              { type: "text", text: "WebMCP not enabled on this widget." },
            ],
          };
        } else {
          try {
            output = await execPromise;
          } catch (error) {
            const isAbortError =
              error instanceof Error &&
              (error.name === "AbortError" ||
                error.message.includes("aborted") ||
                error.message.includes("abort"));
            if (!isAbortError) {
              this.callbacks.onError?.(
                error instanceof Error ? error : new Error(String(error)),
              );
            }
            this.markWebMcpToolComplete(
              toolMessage,
              buildWebMcpErrorResult(
                isAbortError
                  ? "Aborted by cancel()"
                  : getWebMcpErrorMessage(error),
              ),
              startedAt,
            );
            // Release the dedupe claim so a re-emit can retry this call.
            this.webMcpInflightKeys.delete(dedupeKey);
            return null;
          }
        }
        if (controller.signal.aborted) {
          this.markWebMcpToolComplete(
            toolMessage,
            buildWebMcpErrorResult("Aborted by cancel()"),
            startedAt,
          );
          this.webMcpInflightKeys.delete(dedupeKey);
          return null;
        }
        return {
          dedupeKey,
          resumeKey,
          output,
          toolMessage,
          startedAt,
          completedAt: Date.now(),
        };
      }),
    );

    let ready: ExecutedWebMcpTool[] = [];
    try {
      ready = executed.filter((r): r is ExecutedWebMcpTool => r !== null);
      // Everything deduped/aborted/failed: nothing to post.
      if (ready.length === 0) return;

      const toolOutputs: Record<string, unknown> = {};
      for (const r of ready) {
        // Two omitted-on-collision safety: if two calls somehow resolve to the
        // same key (only possible on a legacy name fallback), last write wins:        // the server re-pauses the unrepresented call for retry.
        toolOutputs[r.resumeKey] = r.output;
      }

      const response = await this.client.resumeFlow(executionId, toolOutputs, {
        signal: resumeController.signal,
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        throw new Error(errorData?.error ?? `Resume failed: ${response.status}`);
      }
      // Server accepted the batch: mark every included call resolved so stale
      // re-emits don't re-execute the page tool, then complete each bubble.
      // Do this only after /resume HTTP success; if /resume fails, the server
      // may still be paused and the retry path must not show a final result.
      for (const r of ready) {
        this.webMcpResolvedKeys.add(r.dedupeKey);
        this.markWebMcpToolComplete(
          r.toolMessage,
          r.output,
          r.startedAt,
          r.completedAt,
          r.toolMessage.toolCall?.name === SUGGEST_REPLIES_TOOL_NAME
            ? { suggestRepliesResolved: true }
            : undefined,
        );
      }
      if (response.body) {
        await this.connectStream(response.body, { allowReentry: true });
      }
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("abort"));
      if (!isAbortError) {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      } else {
        for (const r of ready) {
          this.markWebMcpToolComplete(
            r.toolMessage,
            buildWebMcpErrorResult("Aborted by cancel()"),
            r.startedAt,
          );
        }
      }
    } finally {
      for (const key of claimedKeys) {
        this.webMcpInflightKeys.delete(key);
      }
      for (const controller of controllers) {
        this.webMcpResolveControllers.delete(controller);
      }
      this.webMcpResolveControllers.delete(resumeController);
      if (this.webMcpResolveControllers.size === 0 && !this.abortController) {
        this.setStreaming(false);
      }
    }
  }

  /**
   * Resolve a paused auto-resolving LOCAL tool call and post the result to
   * `/resume`: `webmcp:*` calls execute against the host page's tool
   * registry; the built-in `suggest_replies` skips execution entirely and
   * resumes with a canned "shown" result (the chips render from the message
   * list, not from this resolve).
   *
   * Triggered automatically from `handleEvent` when a `step_await`-derived
   * message arrives for such a tool: the user does not click a pill; the
   * bridge's confirm-bubble gate (WebMCP only) is the only interactive
   * surface.
   *
   * Idempotent on the message's `toolCall.id`: re-emits of the same step_await
   * (e.g. from message coalescing) won't double-fire `tool.execute`. Failure
   * modes, declined, timed out, throw, unknown tool, all resolve into a
   * `{ isError: true, content: [...] }` payload that resumes the dispatch
   * cleanly so the agent can recover.
   */
  public async resolveWebMcpToolCall(
    toolMessage: AgentWidgetMessage,
  ): Promise<void> {
    const executionId = toolMessage.agentMetadata?.executionId;
    const wireToolName = toolMessage.toolCall?.name;
    const toolCallId = toolMessage.toolCall?.id;

    // Malformed step_await wire shapes shouldn't silently strand the
    // server-side dispatch. Three failure modes:
    //   - no executionId: no /resume target exists; surface to the host
    //     via onError so an operator can react. This is a server-side
    //     wire-shape bug: Persona can't recover it from the client.
    //   - no wireToolName: defensive guard: handleEvent only calls us
    //     for an auto-resolving local tool name (`webmcp:*` or
    //     `suggest_replies`), so this path indicates a direct caller
    //     misuse. Silent return.
    //   - no toolCallId: dedupe key falls apart, but the server can still
    //     advance if we post an isError for the wireToolName. Do that
    //     and bail before the dedupe path.
    if (!executionId) {
      this.callbacks.onError?.(
        new Error(
          "WebMCP step_await missing executionId: dispatch left paused.",
        ),
      );
      return;
    }
    if (!wireToolName) return;
    if (!toolCallId) {
      // No toolCall.id → no per-call dedupe key. Fall back to a synthetic
      // `(executionId):(wireToolName)` so identical malformed re-emits don't
      // re-POST /resume. Idempotent on duplicate bad payloads.
      const malformedKey = `${executionId}:__no_tool_id__:${wireToolName}`;
      if (
        this.webMcpInflightKeys.has(malformedKey) ||
        this.webMcpResolvedKeys.has(malformedKey)
      ) {
        return;
      }
      this.webMcpInflightKeys.add(malformedKey);
      try {
        await this.resumeWithToolOutput(executionId, wireToolName, {
          isError: true,
          content: [
            {
              type: "text",
              text: "WebMCP step_await missing toolCall.id: cannot execute the page tool.",
            },
          ],
        });
        this.webMcpResolvedKeys.add(malformedKey);
      } catch (error) {
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      } finally {
        this.webMcpInflightKeys.delete(malformedKey);
      }
      return;
    }

    // Dedupe key scoped by executionId: see `webMcpInflightKeys` doc comment
    // for the failure-recovery + cross-dispatch rationale. The persisted
    // `suggestRepliesResolved` guard backs the in-memory sets across
    // hydrations.
    const dedupeKey = `${executionId}:${toolCallId}`;
    if (
      this.webMcpInflightKeys.has(dedupeKey) ||
      this.webMcpResolvedKeys.has(dedupeKey) ||
      this.isSuggestRepliesAlreadyResolved(toolMessage)
    ) {
      return;
    }
    this.webMcpInflightKeys.add(dedupeKey);

    // Mark resolved on the message so the UI's local-tool sheet (if any
    // generic one ever lands) does not show: this is a fully-automatic
    // tool from the user's perspective, modulo the confirm bubble. Keep the
    // tool bubble running until the browser-side promise resolves; the
    // initial step_await was only the server pause, not tool completion.
    const startedAt = this.markWebMcpToolRunning(toolMessage);

    // Per-resolve AbortController, NOT the shared `this.abortController`.
    // A single turn can produce multiple `webmcp:*` step_await messages:    // both PARALLEL (two awaits in one stream) and, more commonly, CHAINED
    // (tool A → /resume → tool B, where B's step_await arrives inside A's
    // resume SSE stream). The old code pre-aborted `this.abortController`
    // here to mirror the sibling resolve paths; in the chained case that
    // aborted the stream still delivering B, so B never executed and its
    // /resume was never POSTed: the dispatch hung forever. Using a dedicated
    // per-resolve controller leaves the in-flight resume stream untouched.
    // cancel()/clearMessages()/hydrateMessages()/sendMessage() iterate
    // `webMcpResolveControllers` to tear these down on a real stop / new turn.
    const resolveController = new AbortController();
    this.webMcpResolveControllers.add(resolveController);
    const { signal } = resolveController;
    this.setStreaming(true);

    // Built-in fire-and-forget tool: no bridge, no confirm gate, no
    // browser-side execution: the chips render from the message list and the
    // canned output resumes the execution immediately. Branch BEFORE any
    // bridge access so the missing-bridge error path can never fire for it.
    const isSuggestReplies = wireToolName === SUGGEST_REPLIES_TOOL_NAME;

    const args = toolMessage.toolCall?.args;
    // Thread the signal INTO the bridge: short-circuits the confirm bubble
    // and the execute() race on cancel(), so a late confirm-approval after
    // cancel() cannot fire a host-page side effect with no matching /resume.
    const execPromise = isSuggestReplies
      ? null
      : this.client.executeWebMcpToolCall(wireToolName, args, signal);

    let phase: "execute" | "resume" = "execute";
    let completedAt = startedAt;
    try {
      let resumeOutput: unknown;
      if (isSuggestReplies) {
        resumeOutput = suggestRepliesToolResult();
      } else if (!execPromise) {
        // Client has no bridge (config.webmcp.enabled !== true). Resume with
        // an error so the dispatch can advance instead of hanging.
        resumeOutput = {
          isError: true,
          content: [
            { type: "text", text: "WebMCP not enabled on this widget." },
          ],
        };
      } else {
        resumeOutput = await execPromise;
      }
      completedAt = Date.now();
      // If cancel() fired during execute, the bridge returned an aborted
      // result: don't post it. The server's SSE has been torn down; a
      // /resume now would just produce an orphan dispatch on the server.
      // Streaming/teardown is handled by the shared `finally` below (gated on
      // the resolve set) so we don't clobber a sibling resolve or a live
      // dispatch's controller here.
      if (signal.aborted) {
        this.markWebMcpToolComplete(
          toolMessage,
          buildWebMcpErrorResult("Aborted by cancel()"),
          startedAt,
        );
        return;
      }
      // Mark resolved as soon as the HTTP /resume returns OK: not after the
      // SSE stream finishes. `connectStream` swallows downstream SSE errors
      // (they surface via onError, not by rethrowing), so awaiting it doesn't
      // tell us whether the server actually processed the resume. Marking
      // here pairs with the dedupe semantics: a successful POST means the
      // server got the answer; later step_await re-emits for the same
      // toolCall.id are stale and must not re-execute the page tool.
      // Key the resume by the per-call id (core#3878) when present; the server
      // prefers it over tool name. Falls back to the wire tool name for legacy
      // servers: the original name-keyed contract, still correct for a single
      // call (only same-tool PARALLEL calls could collide on the name).
      const resumeKey =
        toolMessage.agentMetadata?.webMcpToolCallId ?? wireToolName;
      phase = "resume";
      await this.resumeWithToolOutput(executionId, resumeKey, resumeOutput, {
        onHttpOk: () => {
          this.webMcpResolvedKeys.add(dedupeKey);
          this.markWebMcpToolComplete(
            toolMessage,
            resumeOutput,
            startedAt,
            completedAt,
            isSuggestReplies ? { suggestRepliesResolved: true } : undefined,
          );
        },
        signal,
      });
    } catch (error) {
      const isAbortError =
        error instanceof Error &&
        (error.name === "AbortError" ||
          error.message.includes("aborted") ||
          error.message.includes("abort"));
      // Streaming/teardown handled by the shared `finally` (gated on the
      // resolve set): do NOT null the shared `this.abortController` here; it
      // may belong to a live dispatch or sibling resolve, not to us.
      if (phase === "execute" || isAbortError || signal.aborted) {
        this.markWebMcpToolComplete(
          toolMessage,
          buildWebMcpErrorResult(
            isAbortError || signal.aborted
              ? "Aborted by cancel()"
              : getWebMcpErrorMessage(error),
          ),
          startedAt,
        );
      }
      if (!isAbortError) {
        // The bridge normalizes tool errors into result objects, so reaching
        // here means a network failure during `/resume` itself, OR a stream
        // hookup error. Surface to onError, but DO NOT mark resolved: a
        // later step_await re-emit should be allowed to retry the resume.
        this.callbacks.onError?.(
          error instanceof Error ? error : new Error(String(error)),
        );
      }
    } finally {
      this.webMcpInflightKeys.delete(dedupeKey);
      this.webMcpResolveControllers.delete(resolveController);
      // Only flip streaming off when this was the last in-flight resolve AND
      // no shared dispatch is live. Otherwise a finishing resolve would hide
      // the typing indicator while a sibling (parallel) or successor (chained)
      // resolve, or a live dispatch, is still running.
      if (this.webMcpResolveControllers.size === 0 && !this.abortController) {
        this.setStreaming(false);
      }
    }
  }

  /**
   * POST `/resume` with a SINGLE tool's output and pipe the resulting SSE
   * stream back through `connectStream`. Shared by every single-call local-tool
   * resolve path (ask_user_question and single WebMCP calls). Parallel WebMCP
   * calls use `resolveWebMcpToolCallBatch`, which posts one resume for many.
   *
   * `resumeKey` is the `toolOutputs` map key: the per-call `webMcpToolCallId`
   * for WebMCP (core#3878), or the tool name for ask_user_question / legacy
   * servers. `onHttpOk` runs synchronously between the HTTP-status check and the
   * stream pipe; it lets the WebMCP resolve path commit the dedupe flag at
   * "server accepted the answer" rather than "stream finished cleanly".
   */
  private async resumeWithToolOutput(
    executionId: string,
    resumeKey: string,
    output: unknown,
    options?: { onHttpOk?: () => void; signal?: AbortSignal },
  ): Promise<void> {
    const response = await this.client.resumeFlow(
      executionId,
      { [resumeKey]: output },
      { signal: options?.signal },
    );
    if (!response.ok) {
      const errorData = await response.json().catch(() => null);
      throw new Error(errorData?.error ?? `Resume failed: ${response.status}`);
    }
    options?.onHttpOk?.();
    if (response.body) {
      await this.connectStream(response.body, { allowReentry: true });
    } else if (this.webMcpResolveControllers.size === 0) {
      // No stream to pipe. Clear streaming only when no WebMCP resolve is in
      // flight: for a WebMCP caller the current resolve's controller is still
      // in the set, so its own `finally` (gated on the set draining) owns the
      // teardown. Non-WebMCP callers (ask_user_question) keep the old behavior.
      this.setStreaming(false);
      this.abortController = null;
    }
  }

  /**
   * Tear down every in-flight WebMCP resolve and advance the epoch. Each
   * resolve owns a dedicated AbortController (chained/parallel resolves don't
   * share one), so we abort them individually; the aborts propagate into the
   * bridge's execute race and into each `/resume` fetch signal. Bumping
   * `webMcpEpoch` strands any resolve still deferred in a queued microtask:   * it captured the prior epoch and bails before installing a fresh
   * controller, so it can't escape this teardown. Called from every stop /
   * new-turn boundary (cancel, clearMessages, hydrateMessages, sendMessage).
   */
  private abortWebMcpResolves(): void {
    for (const controller of this.webMcpResolveControllers) {
      controller.abort();
    }
    this.webMcpResolveControllers.clear();
    // Settle every approval bubble still awaiting a click. The bridge parks a
    // resolve on `await requestConfirm(...)` (→ requestWebMcpApproval) and only
    // re-checks `signal.aborted` AFTER that await returns: aborting the
    // controller above does NOT unblock it. Left unsettled, the bridge's
    // execute(), its `/resume`, and the resolve's `finally` would all hang
    // forever (and the resolver map would leak across teardowns). Route through
    // `resolveWebMcpApproval(…, "denied")` so each parked Promise resolves
    // `false` AND its bubble message flips out of `pending` (no stale "Approve/
    // Deny" left clickable). The bridge then returns cleanly and its
    // post-confirm `signal.aborted` guard bails before any host-page side effect
    // or stale `/resume`. Snapshot the keys first: resolveWebMcpApproval
    // mutates the map as it deletes each resolver.
    for (const approvalMessageId of [...this.webMcpApprovalResolvers.keys()]) {
      this.resolveWebMcpApproval(approvalMessageId, "denied");
    }
    // Drop any awaits buffered for a not-yet-flushed batch: their messages are
    // being torn down, and a microtask-deferred flush must not survive. The
    // epoch bump below also strands an already-scheduled flush.
    this.webMcpAwaitBatches.clear();
    this.webMcpEpoch++;
  }

  public cancel() {
    this.abortController?.abort();
    this.abortController = null;
    // Tear down every in-flight WebMCP resolve (each owns its own controller,
    // independent of the shared one above). Clear the inflight set so retries
    // are possible if the user re-issues the same step_await context.
    this.abortWebMcpResolves();
    this.webMcpInflightKeys.clear();
    // Stop any in-progress audio too: when the user hits "stop", they want
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
    // Tear down every in-flight WebMCP resolve too: their messages are about
    // to be wiped, and a microtask-deferred resolve must not survive the clear.
    this.abortWebMcpResolves();
    this.messages = [];
    this.agentExecution = null;
    this.clearArtifactState();
    // Clearing messages also wipes the WebMCP dedupe state: a fresh
    // conversation should not refuse to call a webmcp:* tool just because
    // a tool with the same key resolved in the prior conversation.
    this.webMcpInflightKeys.clear();
    this.webMcpResolvedKeys.clear();
    // A fresh conversation must resend the full WebMCP tool list on its next
    // turn: drop the diff-only fingerprint cache (server keys by recordId, so
    // a new conversation has no stored set to match).
    this.client.resetClientToolsFingerprint();
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
    // Hydration replaces the conversation: abort and forget every in-flight
    // WebMCP resolve; their messages are about to be replaced.
    this.abortWebMcpResolves();
    // Wipe the WebMCP dedupe state alongside the message restore: the
    // incoming snapshot is treated as a fresh conversation context.
    this.webMcpInflightKeys.clear();
    this.webMcpResolvedKeys.clear();
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

      // Local-tool auto-resolve: when a step_await emits a tool-variant
      // message for a `webmcp:*` tool, or the built-in fire-and-forget
      // `suggest_replies`: resolve it and post the result to /resume.
      // Unlike ask_user_question, no user pill click is required; for WebMCP
      // the bridge's confirm bubble is the only interactive surface, and
      // suggest_replies resumes with a canned "shown" result while the chips
      // render above the composer.
      //
      // Defer via `queueMicrotask` so handleEvent returns FIRST. The current
      // SSE consumer is still mid-loop; once we return, the dispatch's
      // `connectStream` sees end-of-stream (server closes the SSE at
      // step_await), flips status to "idle", and clears `abortController`
      // before our resolve grabs them. Without this, the original dispatch's
      // finalizer would clobber the new abort controller and `streaming=true`
      // set inside `resolveWebMcpToolCall`.
      //
      // ALWAYS resolve when the wire name carries the `webmcp:` prefix, even
      // if the bridge is non-operational. Otherwise the dispatch stays paused
      // indefinitely: `resolveWebMcpToolCall` translates the missing-bridge
      // case into an isError result that resumes the flow cleanly.
      // `suggest_replies`, by contrast, is gated on its feature flag: when
      // `features.suggestReplies.enabled === false` the widget neither
      // renders chips nor resumes: the same parked-execution posture as a
      // server-declared ask_user_question with its sheet disabled.
      const tc = event.message.toolCall;
      const autoResolvable =
        !!tc?.name &&
        (isWebMcpToolName(tc.name) ||
          (tc.name === SUGGEST_REPLIES_TOOL_NAME &&
            this.config.features?.suggestReplies?.enabled !== false));
      if (
        event.message.agentMetadata?.awaitingLocalTool === true &&
        autoResolvable
      ) {
        // Collect the await into its executionId's batch instead of resolving
        // it on the spot. Parallel same-tool calls (core#3878) arrive as
        // separate `step_await`s in the same stream; batching lets us post ONE
        // `/resume` keyed by per-call id (see `enqueueWebMcpAwait`).
        this.enqueueWebMcpAwait(event.message);
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
        // Keep the typing indicator up while a WebMCP resolve is still in
        // flight: in a chained turn the intermediate resume stream ends with an
        // idle status, but the successor tool is still executing. The resolve's
        // own `finally` flips streaming off once the resolve set drains.
        if (this.webMcpResolveControllers.size === 0) {
          this.setStreaming(false);
          this.abortController = null;
        }
        // Mark agent execution as complete when streaming ends: UNLESS local
        // tools are still outstanding. A batched WebMCP resume is deferred to
        // the microtask below (so `webMcpResolveControllers` is still empty
        // here) and a chained resolve may be mid-flight; marking the run
        // 'complete' now would make isAgentRunning() report a finished run while
        // page tools are still executing. Stay 'running': the resume stream's
        // own idle (with batches drained and resolves settled) marks it done.
        const webMcpPending =
          this.webMcpAwaitBatches.size > 0 ||
          this.webMcpResolveControllers.size > 0;
        if (this.agentExecution?.status === 'running') {
          if (event.status === "error") {
            this.agentExecution.status = 'error';
          } else if (!webMcpPending) {
            this.agentExecution.status = 'complete';
          }
        }
        // The stream that delivered any local-tool `step_await`s has now ended,
        // so every parallel await it carried is collected. Flush them as ONE
        // batched `/resume` per executionId (deferred: see
        // scheduleWebMcpBatchFlush). Runs AFTER the teardown above so a resolve
        // doesn't fight the end-of-stream streaming/abortController reset.
        this.scheduleWebMcpBatchFlush();
      }
    } else if (event.type === "error") {
      this.setStatus("error");
      // Mirror the idle/status handler: don't tear down streaming while a
      // WebMCP resolve is still confirming/executing on another stream: an
      // error on one chained resume stream must not hide the typing indicator
      // (or null a controller) for a sibling/successor resolve still in flight.
      // The resolve's own `finally` flips streaming off once the set drains.
      if (this.webMcpResolveControllers.size === 0) {
        this.setStreaming(false);
        this.abortController = null;
      }
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

    const text = resolveSpeakableText(lastAssistant.content);
    if (!text.trim()) return;

    // Route auto-speak through the same controller as the "Read aloud" button
    // so there's a single owner of the speech engine and the button reflects
    // playback state (and a single message can't be spoken by two paths at once).
    void this.readAloud.play(lastAssistant.id, {
      text,
      voice: ttsConfig.voice,
      rate: ttsConfig.rate,
      pitch: ttsConfig.pitch,
    });
  }

  /**
   * Pick the best available English voice from a list of SpeechSynthesisVoices.
   * Prefers high-quality remote/natural voices, then enhanced local voices,
   * then standard local voices. Retained for backwards compatibility; delegates
   * to the browser speech engine's picker.
   */
  static pickBestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice {
    return pickBestVoice(voices);
  }

  /**
   * Toggle the per-message "Read aloud" action: play → pause → resume (or
   * play → stop when the engine can't pause). Speaks the assistant message's
   * text via the configured speech engine (browser Web Speech API by default,
   * or a hosted engine from `textToSpeech.createEngine`).
   */
  public toggleReadAloud(messageId: string): void {
    const message = this.messages.find(m => m.id === messageId);
    if (!message || message.role !== 'assistant') return;
    const text = resolveSpeakableText(message.content || '');
    if (!text.trim()) return;
    const tts = this.config.textToSpeech;
    this.readAloud.toggle(messageId, {
      text,
      voice: tts?.voice,
      rate: tts?.rate,
      pitch: tts?.pitch,
    });
  }

  /** Current read-aloud playback state for a message (`idle` unless active). */
  public getReadAloudState(messageId: string): ReadAloudState {
    return this.readAloud.stateFor(messageId);
  }

  /** Subscribe to read-aloud state changes. Returns an unsubscribe function. */
  public onReadAloudChange(listener: ReadAloudListener): () => void {
    return this.readAloud.onChange(listener);
  }

  /**
   * Stop any in-progress text-to-speech / read-aloud playback.
   */
  public stopSpeaking() {
    this.readAloud.stop();
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
      // Top-level merge would otherwise replace `agentMetadata` wholesale:      // post-resume events (e.g. `tool_complete` re-emitted from a stale
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
          // Keep awaiting flag false once resolved: never let a stale
          // re-emit flip us back to awaiting.
          awaitingLocalTool: false,
        };
      }
      // suggest_replies equivalent: preserve the persisted fire-and-forget
      // resolution across re-emissions. It is the only dedupe signal that
      // survives a hydration (the in-memory key sets are cleared), so a
      // stale step_await re-emit must not wipe it before
      // `isSuggestRepliesAlreadyResolved` checks it in the resolve path.
      if (
        existing.agentMetadata?.suggestRepliesResolved === true &&
        withSequence.agentMetadata
      ) {
        merged.agentMetadata = {
          ...(merged.agentMetadata ?? withSequence.agentMetadata),
          suggestRepliesResolved: true,
          awaitingLocalTool: false,
        };
      }
      // Approval equivalent: `agent_approval_complete` carries only the
      // resolution (approvalId, decision, resolvedBy): the runtime does not
      // re-send toolName/description/toolType/reason/parameters, so client.ts
      // rebuilds the approval with empty required fields and the optional
      // ones absent. A wholesale `approval` replacement would wipe that
      // context from the resolved bubble on the next full re-render (morph,
      // virtual-scroll re-mount, storage restore). Merge field-wise instead:
      // take the resolution from the incoming event, keep existing context
      // wherever the event is silent or empty.
      if (
        existing.approval &&
        withSequence.approval &&
        existing.approval.id === withSequence.approval.id
      ) {
        const prior = existing.approval;
        const incoming = withSequence.approval;
        merged.approval = {
          ...prior,
          ...incoming,
          executionId: incoming.executionId || prior.executionId,
          toolName: incoming.toolName || prior.toolName,
          description: incoming.description || prior.description,
          toolType: incoming.toolType ?? prior.toolType,
          reason: incoming.reason ?? prior.reason,
          parameters: incoming.parameters ?? prior.parameters,
        };
      }
      // Auto-resolved local-tool equivalent (`webmcp:*` and the built-in
      // `suggest_replies`): once such a tool has started resolving (inflight)
      // or resolved, a duplicate `step_await` re-emit must not flip
      // `awaitingLocalTool` back to true and resurrect the "waiting on
      // local tool" UI. It also must not overwrite an existing running or
      // completed toolCall with the fresh running skeleton emitted by client.ts
      // for every step_await. resolveWebMcpToolCall's dedupe path returns
      // without re-touching the message, so correct the merge here (also avoids
      // a one-frame flash before that microtask runs).
      const reTcName = withSequence.toolCall?.name;
      const reExecId = withSequence.agentMetadata?.executionId;
      const reTcId = withSequence.toolCall?.id;
      if (
        reTcName &&
        isAutoResolvedLocalToolName(reTcName) &&
        reExecId &&
        reTcId &&
        withSequence.agentMetadata?.awaitingLocalTool === true
      ) {
        const reKey = `${reExecId}:${reTcId}`;
        const isInflight = this.webMcpInflightKeys.has(reKey);
        const isResolved = this.webMcpResolvedKeys.has(reKey);
        const existingToolName = existing.toolCall?.name;
        const hasCompletedTool =
          existing.agentMetadata?.executionId === reExecId &&
          existing.toolCall?.id === reTcId &&
          existingToolName !== undefined &&
          isAutoResolvedLocalToolName(existingToolName) &&
          existing.toolCall?.status === "complete";
        if (isInflight || isResolved || hasCompletedTool) {
          merged.agentMetadata = {
            ...(merged.agentMetadata ?? {}),
            awaitingLocalTool: false,
          };
          // Preserve the in-flight/completed tool state. For in-flight calls,
          // this keeps the original `startedAt`; for completed calls, it keeps
          // the measured duration/result even when the call completed with a
          // local/browser error and therefore was not promoted to resolved.
          merged.toolCall = existing.toolCall;
          merged.streaming = existing.streaming;
        }
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
