import { computeClientToolsFingerprint } from "./webmcp-bridge";
import type { RuntypeClientInitResponse } from "./generated/runtype-openapi-contract";
import type {
  AgentWidgetMessage, AgentWidgetModelMessageRole, AgentWidgetRequestPayload, AgentWidgetAgentRequestPayload,
  AgentWidgetContextProvider, AgentWidgetRequestMiddleware, AgentWidgetCustomFetch,
  ClientSession, ClientChatRequest, ComposerOptionsPayload, WidgetHistoryInternals, ClientFeedbackRequest, ClientFeedbackType, ClientToolDefinition,
} from "./types";
import type { DispatchOptions, SSEHandler, HistoryClientError } from "./client";
import type { ClientResumeHost } from "./client-resume";
import type { builtInClientToolsForDispatch } from "./ask-user-question-tool";
import { serializeWithToolPairs } from "./utils/tool-pair-replay";
import { divergentDisplayProjection } from "./utils/history-messages";
import { isLocalOnlyMessage } from "./utils/local-only-message";
import { VERSION } from "./version";

/** Live client-owned state; importing this module never creates a second client. */
export type CreateClientSessionOptions = {
    conversationId?: string;
    durableResume?: boolean;
    identityProof?: string | null;
    storedSessionId?: string | null;
    omitVisitorFields?: boolean;
    signal?: AbortSignal;
  };

export interface ClientDispatchHost extends ClientResumeHost {
  HistoryClientError: typeof HistoryClientError;
  claimInFlight: boolean;
  clientToolsFingerprintSessionId: string | null;
  lastSentClientToolsFingerprint: string | null;
  sentNonEmptyClientToolsSessionId: string | null;
  readonly historyInternals: WidgetHistoryInternals;
  markHistoryUnavailable: () => void;
  readonly apiUrl: string;
  readonly contextProviders: AgentWidgetContextProvider[];
  readonly requestMiddleware?: AgentWidgetRequestMiddleware;
  readonly customFetch?: AgentWidgetCustomFetch;
  clientSession: ClientSession | null;
  isCurrentTurn: (turnId: string) => boolean;
  isHistoryCapable: () => boolean;
  createClientSession: (opts: CreateClientSessionOptions) => Promise<ClientSession>;
  finishInit: (session: ClientSession, expected: string | null, isWarm: boolean) => ClientSession;
  resetSessionWarmLatch: () => void;
  resetClientToolsFingerprint: () => void;
  clearClientSession: () => void;
  resolveChatIdentityProof: (signal?: AbortSignal) => Promise<ClientChatRequest["identityProof"]>;
  routing: () => { agentId?: string; flowId?: string; targetPayload?: Record<string, unknown> };
  builtInClientTools: typeof builtInClientToolsForDispatch;
  streamResponse: (body: ReadableStream<Uint8Array>, onEvent: SSEHandler, assistantMessageId?: string, seedContent?: string, signal?: AbortSignal) => Promise<void>;
}

/** A message whose role the model accepts. */
type ModelMessage = AgentWidgetMessage & { role: AgentWidgetModelMessageRole };

/**
 * Whether a message belongs in a model request. Every payload builder gates on
 * this, so a display-only message is dropped from all of them at once.
 */
const hasValidContent = (message: AgentWidgetMessage): message is ModelMessage => {
  // Operator messages (a human on the agent's side, e.g. a support takeover)
  // are display-only. Sending them as `assistant` would put words in the
  // model's mouth, and the API accepts no other role for them.
  if (message.role === "operator") return false;
  // Display-only voice captions are never conversation.
  if (message.voiceCaption) return false;
  if (isLocalOnlyMessage(message)) return false;
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

const sortByCreatedAt = (messages: AgentWidgetMessage[]): AgentWidgetMessage[] =>
  messages
    .slice()
    .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

// Only replay explicit known assistant phase metadata; other widget metadata is private.
const payloadPhase = (message: ModelMessage) => {
  const phase = message.agentMetadata?.providerPhase ?? message.agentMetadata?.phase;
  return message.role === "assistant" && (phase === "commentary" || phase === "partial_answer" || phase === "final_answer")
    ? { phase } : {};
};

// Priority: contentParts (multi-modal) > llmContent (explicit LLM content) > rawContent (structured parsers) > content (display)
const toPayloadMessage = (message: ModelMessage) => ({
  role: message.role,
  content: message.contentParts ?? message.llmContent ?? message.rawContent ?? message.content,
  createdAt: message.createdAt,
  ...payloadPhase(message)
});

export class ClientDispatch {
  constructor(private host: ClientDispatchHost) {}
  async initializeSession(): Promise<ClientSession> {
    await this.host.historyInternals.historyBootstrapReady;
    const previousConversationId = this.host.config.getStoredConversationId?.() || null;
    const durableResume =
      this.host.historyInternals.shouldResumeDurableConversation?.() === true;
    if (!this.host.isHistoryCapable() && !durableResume) {
      return this.#ordinaryInit(previousConversationId, false);
    }
    const storedToken = await this.host.readVisitorToken();

    // Boot resume: reopening the record beats replaying a possibly idle-expired
    // session id, so benign expiry never forks or wipes the conversation.
    if (previousConversationId && storedToken) {
      try {
        const resumed = await this.createClientSession({
          conversationId: previousConversationId,
          durableResume,
        });
        if (durableResume && resumed.durableRecovery?.enabled !== true) {
          this.host.historyInternals.setStoredResumableHandle?.(null);
        }
        return this.host.finishInit(resumed, previousConversationId, false);
      } catch (error) {
        if (
          !(error instanceof this.host.HistoryClientError && error.code === 'not_found') &&
          !(error instanceof this.host.HistoryClientError && error.code === 'visitor_required') &&
          !(error instanceof this.host.HistoryClientError && error.code === 'history_disabled')
        ) {
          throw error;
        }
        if (durableResume) {
          this.host.historyInternals.setStoredResumableHandle?.(null);
        }
        // Record gone or credential dead: exactly one ordinary fallback, never a loop.
        return this.#ordinaryInit(previousConversationId, true);
      }
    }

    return this.#ordinaryInit(previousConversationId, false);
  }

  /**
   * An empty store means this init may mint a visitor, so it runs under the
   * cross-tab first-init lock: a waiter re-reads inside the lock and joins the
   * winner's visitor instead of minting a second one.
   */
  async #ordinaryInit(
    previousConversationId: string | null,
    continuityBroken: boolean
  ): Promise<ClientSession> {
    const store = this.host.historyInternals.visitorStore;
    if (store && !(await this.host.readVisitorToken())) {
      return store.withFirstInitLock(() =>
        this.#doOrdinaryInit(previousConversationId, continuityBroken)
      );
    }
    return this.#doOrdinaryInit(previousConversationId, continuityBroken);
  }

  async #doOrdinaryInit(
    previousConversationId: string | null,
    continuityBroken: boolean
  ): Promise<ClientSession> {
    const storedSessionId = this.host.config.getStoredSessionId?.() || null;
    const first = await this.createClientSession({ storedSessionId });
    const session = await this.#claimFirstConversation(first);
    return this.host.finishInit(session, previousConversationId, continuityBroken);
  }

  /**
   * A minted visitor means the record this session just created is still
   * unowned; one immediate re-init with `{visitorToken, sessionId}` claims it.
   */
  async #claimFirstConversation(first: ClientSession): Promise<ClientSession> {
    if (
      !first.visitor?.token ||
      this.host.claimInFlight ||
      (!this.host.isHistoryCapable() && first.durableRecovery?.enabled !== true)
    ) {
      return first;
    }
    this.host.claimInFlight = true;
    try {
      return await this.createClientSession({ storedSessionId: first.sessionId });
    } catch {
      // Non-fatal: the next page load claims through the normal backend path.
      return first;
    } finally {
      this.host.claimInFlight = false;
    }
  }

  async sendWithClientToolsDiff(
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
    const sameSession = this.host.clientToolsFingerprintSessionId === sessionId;
    const unchanged =
      hasClientTools && sameSession && this.host.lastSentClientToolsFingerprint === clientToolsFingerprint;
    // Keyed on `sentNonEmptyClientToolsSessionId`, NOT the fingerprint: an
    // interleaved empty-tool chat turn commits a null fingerprint without
    // clearing the tools persisted for a still-paused execution, so the
    // fingerprint alone would lose the pending clear. The dedicated flag
    // survives omitted-empty commits and is reset only once an explicit []
    // replace is confirmed.
    const sendEmptyReplace =
      !hasClientTools &&
      opts?.emptyMeansReplace === true &&
      this.host.sentNonEmptyClientToolsSessionId === sessionId;

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
          this.host.lastSentClientToolsFingerprint = null;
          continue;
        }
      }
      break;
    }

    return {
      response,
      commit: () => {
        this.host.lastSentClientToolsFingerprint = clientToolsFingerprint ?? null;
        this.host.clientToolsFingerprintSessionId = sessionId;
        if (hasClientTools) {
          this.host.sentNonEmptyClientToolsSessionId = sessionId;
        } else if (sendEmptyReplace) {
          // The explicit [] replaced the persisted set server-side; the
          // pending clear is done.
          this.host.sentNonEmptyClientToolsSessionId = null;
        }
        // Omitted-empty commits (chat with zero tools) leave the flag set:
        // they don't touch tools persisted for a paused execution.
      },
    };
  }

  async createClientSession(opts: CreateClientSessionOptions): Promise<ClientSession> {
    const historyCapable = this.host.isHistoryCapable() && !opts.omitVisitorFields;
    // Recovery is negotiated independently from the history UI. New servers
    // return an explicit capability bit; old strict servers reject the
    // additive request field, which the fallback below handles once.
    const durableRecoveryRequested = !opts.omitVisitorFields;
    let visitorToken: string | null = null;
    if (historyCapable || durableRecoveryRequested) {
      // Never read persisted state before the controller's stored-state gate.
      await this.host.historyInternals.historyBootstrapReady;
      visitorToken = await this.host.readVisitorToken();
    }

    const routed = this.host.routing();
    const sessionTargetId = routed.agentId ?? routed.flowId;
    const resumeConversationId =
      historyCapable || opts.durableResume ? opts.conversationId : undefined;
    const requestBody: Record<string, unknown> = {
      token: this.host.config.clientToken,
      ...(sessionTargetId && { flowId: sessionTargetId }),
      ...(historyCapable && { visitorHistory: true }),
      ...(durableRecoveryRequested && { durableRecovery: true }),
      ...((historyCapable || durableRecoveryRequested) && visitorToken
        ? { visitorToken }
        : {}),
      // Independent of the strict conversationId/sessionId union: a proof also
      // binds the visitor on an ordinary init.
      ...(historyCapable && opts.identityProof
        ? { identityProof: opts.identityProof }
        : {}),
      ...(resumeConversationId
        ? { conversationId: resumeConversationId }
        : opts.storedSessionId
          ? { sessionId: opts.storedSessionId }
          : {}),
    };

    opts.signal?.throwIfAborted();
    const response = await fetch(this.host.getClientApiUrl('init'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Persona-Version': VERSION,
      },
      body: JSON.stringify(requestBody),
      signal: opts.signal,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Session initialization failed' }));
      if (historyCapable && response.status === 403 && error.error === 'visitor_history_disabled') {
        this.host.markHistoryUnavailable();
        // A resume must not silently degrade into some other conversation.
        if (resumeConversationId) {
          throw new this.host.HistoryClientError(
            'history_disabled',
            'Visitor history is disabled for this surface'
          );
        }
        return this.createClientSession({ ...opts, omitVisitorFields: true });
      }
      if (response.status === 403 && error.error === 'durable_recovery_disabled') {
        throw new this.host.HistoryClientError(
          'history_disabled',
          'Durable recovery is disabled for this surface'
        );
      }
      if (
        (historyCapable || opts.durableResume) &&
        response.status === 401 &&
        error.error === 'visitor_required'
      ) {
        throw new this.host.HistoryClientError('visitor_required', 'Visitor credential no longer resolves');
      }
      if (resumeConversationId && response.status === 404) {
        throw new this.host.HistoryClientError('not_found', 'Conversation not found');
      }
      if (response.status === 401) {
        throw new Error(`Invalid client token: ${error.hint || error.error}`);
      }
      if (response.status === 403) {
        throw new Error(`Origin not allowed: ${error.hint || error.error}`);
      }
      throw new Error(error.error || 'Failed to initialize session');
    }

    const data: RuntypeClientInitResponse = await response.json();

    // First awaited op after parse: the server cannot re-issue a minted secret.
    if (data.visitor?.token) {
      await this.host.historyInternals.visitorStore?.set(data.visitor.token);
    }

    return {
      sessionId: data.sessionId,
      expiresAt: new Date(data.expiresAt),
      // Preserve the published session facade while consuming the current wire type.
      flow: data.flow as ClientSession["flow"],
      ...(data.conversationId ? { conversationId: data.conversationId } : {}),
      ...(data.targetId ? { targetId: data.targetId } : {}),
      ...(data.conversationRevision
        ? { conversationRevision: data.conversationRevision }
        : {}),
      ...(data.durableRecovery ? { durableRecovery: data.durableRecovery } : {}),
      ...(data.visitor ? { visitor: data.visitor } : {}),
      config: {
        welcomeMessage: data.config.welcomeMessage,
        placeholder: data.config.placeholder,
        theme: data.config.theme as ClientSession["config"]["theme"],
      },
    };
  }

  async sendFeedback(feedback: ClientFeedbackRequest): Promise<void> {
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

    if (this.host.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] sending feedback", feedback);
    }

    // Scope the feedback request to the caller's client token, sourced the same
    // way as the chat/init requests. sendFeedback is client-token-mode only
    // (guarded above), so clientToken is always present here and an API key can
    // never leak into the body. Left undefined only when the embed has none.
    const requestBody = {
      ...feedback,
      ...(this.host.config.clientToken && { token: this.host.config.clientToken }),
    };

    const response = await fetch(`${this.host.clientApiBase()}/v1/client/feedback`, {
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
        this.host.clientSession = null;
        this.host.resetSessionWarmLatch();
        this.host.config.onSessionExpired?.();
        throw new Error('Session expired. Please refresh to continue.');
      }

      throw new Error(errorData.error || 'Failed to submit feedback');
    }
  }

  async dispatchClientToken(options: DispatchOptions, onEvent: SSEHandler, turnId: string) {
    const { HistoryClientError } = this.host;
    const isCurrentTurn = () => this.host.isCurrentTurn(turnId);
    // Terminal frames of a superseded run must not reopen the composer or paint
    // into the new turn's bubble; status frames are equally misleading.
    const forward: SSEHandler = (event) => {
      if (!isCurrentTurn()) return;
      onEvent(event);
    };


    try {
      const assertCurrentTurn = () => {
        options.signal?.throwIfAborted();
        if (!isCurrentTurn()) throw new DOMException('Turn superseded', 'AbortError');
      };
      let session = this.host.clientSession ?? (await this.host.initSession());
      assertCurrentTurn();
      const renewSession = async () => {
        assertCurrentTurn();
        const previous = session;
        const durable = previous.durableRecovery?.enabled === true;
        if (durable && (!previous.conversationId || !(await this.host.readVisitorToken()))) {
          throw new Error('Renewing this conversation requires its visitor credential.');
        }
        assertCurrentTurn();
        const renewed = await this.host.createClientSession({
          ...(durable || this.host.isHistoryCapable()
            ? { conversationId: previous.conversationId, durableResume: durable }
            : { storedSessionId: previous.sessionId }),
          signal: options.signal,
        });
        assertCurrentTurn();
        if (
          (previous.conversationId && renewed.conversationId !== previous.conversationId) ||
          (durable && renewed.durableRecovery?.enabled !== true)
        ) {
          throw new Error('Session renewal did not preserve this conversation.');
        }
        session = this.host.finishInit(renewed, previous.conversationId ?? null, false);
        this.host.clientSession = session;
        this.host.resetSessionWarmLatch();
        this.host.resetClientToolsFingerprint();
        this.host.config.onSessionInit?.(session);
      };
      if (Date.now() >= session.expiresAt.getTime() - 60000) {
        await renewSession();
      }

      // Build the standard payload to get context/metadata from middleware
      const basePayload = await this.#buildPayload(options.messages);

      // Build the chat request payload with message IDs for feedback tracking
      // Filter out sessionId from metadata if present (it's only for local storage)
      const sanitizedMetadata = basePayload.metadata
        ? Object.fromEntries(
            Object.entries(basePayload.metadata).filter(([key]) => key !== 'sessionId' && key !== 'session_id')
          )
        : undefined;

      // Common (tools-independent) fields for the chat request.
      const historyCapable = this.host.isHistoryCapable();
      const baseChatRequest: Omit<ClientChatRequest, 'clientTools' | 'clientToolsFingerprint'> = {
        sessionId: session.sessionId,
        // Filter out messages with empty content to prevent validation errors
        messages: options.messages.filter(hasValidContent).map(m => {
          // The visitor-visible projection rides along only where it diverges
          // from the model channel, and only on the history-capable plane.
          const displayContent = historyCapable
            ? divergentDisplayProjection(m)
            : undefined;
          return {
            id: m.id, // Include message ID for tracking
            role: m.role,
            // Priority: contentParts (multi-modal) > llmContent (explicit LLM content) > rawContent (structured parsers) > content (display)
            content: m.contentParts ?? m.llmContent ?? m.rawContent ?? m.content,
            ...(displayContent !== undefined && { displayContent }),
          };
        }),
        // Include pre-generated assistant message ID if provided
        ...(options.assistantMessageId && { assistantMessageId: options.assistantMessageId }),
        // Include metadata/context from middleware if present (excluding sessionId)
        ...(sanitizedMetadata && Object.keys(sanitizedMetadata).length > 0 && { metadata: sanitizedMetadata }),
        ...(basePayload.inputs && Object.keys(basePayload.inputs).length > 0 && { inputs: basePayload.inputs }),
        ...(basePayload.context && { context: basePayload.context }),
        // Every client-token turn carries a turnId so the server can suppress a
        // superseded run and this client can drop its stale events below.
        turnId,
        ...(options.interrupt && { submitMode: 'interrupt' as const }),
        ...(options.voiceSpoken && {
          voice: {
            spoken: true as const,
            ...(options.voicePriorToolResults?.length && { priorToolResults: options.voicePriorToolResults }),
          },
        }),
      };

      // Diff-only / send-once WebMCP tool dispatch. `buildPayload()` already
      // snapshotted the full set; `sendWithClientToolsDiff` decides whether to
      // ship it again or just its fingerprint (retrying once on a 409 registry
      // miss). The cache is committed only after a successful stream start
      // (below), so a 409/failure leaves it untouched.
      const send = async () => {
        assertCurrentTurn();
        const recoveryVisitorToken =
          session.durableRecovery?.enabled === true ? await this.host.readVisitorToken() : null;
        assertCurrentTurn();
        return this.host.sendWithClientToolsDiff(session.sessionId, basePayload.clientTools, async (toolFields) => {
          assertCurrentTurn();
          const identityProof = await this.host.resolveChatIdentityProof(options.signal);
          assertCurrentTurn();
          const chatRequest: ClientChatRequest = {
            ...baseChatRequest,
            sessionId: session.sessionId,
            ...toolFields,
            ...(identityProof && { identityProof }),
          };

          if (this.host.debug) {
            // eslint-disable-next-line no-console
            console.debug("[AgentWidgetClient] client token dispatch", {
              ...chatRequest,
              ...(identityProof && { identityProof: { provider: identityProof.provider, token: '[REDACTED]' } }),
            });
          }

          return fetch(this.host.getClientApiUrl('chat'), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Persona-Version': VERSION,
              ...(recoveryVisitorToken
                ? { 'X-Visitor-Token': recoveryVisitorToken }
                : {}),
            },
            body: JSON.stringify(chatRequest),
            signal: options.signal,
          });
        });
      };
      let result = await send();
      assertCurrentTurn();
      if (result.response.status === 401) {
        const rejection = await result.response.clone().json().catch(() => null);
        assertCurrentTurn();
        if (rejection?.error === 'Session not found or expired') {
          await renewSession();
          result = await send();
          assertCurrentTurn();
        }
      }
      const { response, commit: commitClientToolsFingerprint } = result;

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'Chat request failed' }));

        if (response.status === 401 && data.error === 'invalid_identity_proof') {
          const error = new HistoryClientError('invalid_identity_proof', "The identity proof was rejected");
          forward({ type: 'error', error });
          throw error;
        }

        if (response.status === 401) {
          // Session expired
          this.host.clearClientSession();
          this.host.config.onSessionExpired?.();
          const error = new Error('Session expired. Please refresh to continue.');
          forward({ type: "error", error });
          throw error;
        }

        if (response.status === 429) {
          const error = new Error(data.hint || 'Message limit reached for this session.');
          forward({ type: "error", error });
          throw error;
        }

        // The active record was deleted elsewhere. No client-level retry: the
        // old payload would recreate the transcript in a fresh record, so
        // WidgetSession owns recovery.
        if (response.status === 410 && data.error === 'conversation_deleted') {
          const error = new HistoryClientError(
            'conversation_deleted',
            'This conversation was deleted'
          );
          forward({ type: "error", error });
          throw error;
        }

        const error = new Error(data.error || 'Failed to send message');
        forward({ type: "error", error });
        throw error;
      }

      if (!response.body) {
        const error = new Error('No response body received');
        forward({ type: "error", error });
        throw error;
      }

      // Stream is good: the server now holds this tool set under this
      // fingerprint for the session. Commit the cache so unchanged follow-up
      // turns can send fingerprint-only.
      commitClientToolsFingerprint();

      forward({ type: "status", status: "connected" });

      // Stream the response (same SSE handling as proxy mode)
      try {
        await this.host.streamResponse(response.body, forward, options.assistantMessageId, undefined, options.signal);
      } finally {
        forward({ type: "status", status: "idle" });
      }
    } catch (error) {
      const err = error instanceof Error ? error : new Error(String(error));
      // Only emit error if it wasn't already emitted
      if (
        !(err instanceof HistoryClientError) &&
        !err.message.includes('Session expired') &&
        !err.message.includes('Message limit')
      ) {
        forward({ type: "error", error: err });
      }
      throw err;
    }
  }

  /**
   * Proxy mode dispatch (original implementation)
   */
  async dispatchProxy(options: DispatchOptions, onEvent: SSEHandler) {

    const payload = await this.#buildPayload(
      options.messages,
      options.composerOptions
    );

    if (this.host.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] dispatch payload", payload);
    }

    // Build headers - merge static headers with dynamic headers if provided
    let headers = { ...this.host.headers };
    if (this.host.getHeaders) {
      try {
        const dynamicHeaders = await this.host.getHeaders();
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
    if (this.host.customFetch) {
      try {
        response = await this.host.customFetch(
          this.host.apiUrl,
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
      response = await fetch(this.host.apiUrl, {
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
      await this.host.streamResponse(response.body, onEvent, undefined, undefined, options.signal);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  /**
   * Agent mode dispatch
   */
  async dispatchAgent(options: DispatchOptions, onEvent: SSEHandler) {

    const payload = await this.#buildAgentPayload(
      options.messages,
      options.composerOptions
    );

    if (this.host.debug) {
      // eslint-disable-next-line no-console
      console.debug("[AgentWidgetClient] agent dispatch payload", payload);
    }

    // Build headers - merge static headers with dynamic headers if provided
    let headers = { ...this.host.headers };
    if (this.host.getHeaders) {
      try {
        const dynamicHeaders = await this.host.getHeaders();
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
    if (this.host.customFetch) {
      try {
        response = await this.host.customFetch(
          this.host.apiUrl,
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
      response = await fetch(this.host.apiUrl, {
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
      await this.host.streamResponse(response.body, onEvent, options.assistantMessageId, undefined, options.signal);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  #latestMentionContext(
    messages: AgentWidgetMessage[]
  ): Record<string, unknown> | null {
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i];
      if (m.role !== "user") continue;
      // First user message from the end IS the latest user turn: use its
      // mention context if any, and never look further back.
      if (m.mentionContext && Object.keys(m.mentionContext).length > 0) {
        return { mentions: m.mentionContext };
      }
      return null;
    }
    return null;
  }

  /**
   * Aggregate request `context`: merge every context provider's result with the
   * opt-in mention context from the latest user turn. Returns null when nothing
   * contributed, so callers can skip setting `payload.context`. Shared by the
   * agent and flow payload builders.
   */
  async #buildContextAggregate(
    messages: AgentWidgetMessage[]
  ): Promise<Record<string, unknown> | null> {
    const contextAggregate: Record<string, unknown> = {};
    if (this.host.contextProviders.length) {
      await Promise.all(
        this.host.contextProviders.map(async (provider) => {
          try {
            const result = await provider({
              messages,
              config: this.host.config
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
    }
    const mentionContext = this.#latestMentionContext(messages);
    if (mentionContext) Object.assign(contextAggregate, mentionContext);
    return Object.keys(contextAggregate).length ? contextAggregate : null;
  }

  /**
   * Non-empty composer selections only. An empty snapshot leaves the field off
   * the wire entirely, so a widget with no picker and no modes sends exactly
   * what it sent before.
   */
  #normalizeComposerOptions(
    options: ComposerOptionsPayload | undefined
  ): ComposerOptionsPayload | undefined {
    if (!options) return undefined;
    const normalized: ComposerOptionsPayload = {};
    if (options.selectedModelId) normalized.selectedModelId = options.selectedModelId;
    if (options.activeModeIds?.length) {
      normalized.activeModeIds = [...options.activeModeIds];
    }
    return Object.keys(normalized).length > 0 ? normalized : undefined;
  }

  /**
   * Rule 4: an inline client-defined agent may take the turn's model from the
   * composer, but only for an id the host actually declared in
   * `composer.models`. Config is untouched; the mapping is per request.
   */
  #applyInlineAgentModel(
    agent: AgentWidgetAgentRequestPayload["agent"],
    composerOptions: ComposerOptionsPayload | undefined
  ): AgentWidgetAgentRequestPayload["agent"] {
    const selected = composerOptions?.selectedModelId;
    if (!selected || !("model" in agent)) return agent;
    const declared = this.host.config.composer?.models?.some(
      (model) => model.id === selected
    );
    return declared ? { ...agent, model: selected } : agent;
  }

  async #buildAgentPayload(
    messages: AgentWidgetMessage[],
    composerOptions?: ComposerOptionsPayload
  ): Promise<AgentWidgetAgentRequestPayload> {
    const routedAgentId = this.host.routing().agentId;
    if (!this.host.config.agent && !routedAgentId) {
      throw new Error('Agent configuration required for agent mode');
    }

    // Filter out messages with empty content and normalize; answered
    // client-tool calls replay as paired toolCalls/toolResults messages.
    const normalizedMessages = serializeWithToolPairs(
      sortByCreatedAt(messages),
      (message) =>
        hasValidContent(message) &&
        (message.role === "user" || message.role === "assistant" || message.role === "system") &&
        (!message.variant || message.variant === "assistant")
          ? toPayloadMessage(message)
          : null
    );

    const composer = this.#normalizeComposerOptions(composerOptions);
    const payload: AgentWidgetAgentRequestPayload = {
      agent: this.#applyInlineAgentModel(
        this.host.config.agent ?? { agentId: routedAgentId! },
        composer
      ),
      messages: normalizedMessages,
      options: {
        streamResponse: true,
        recordMode: 'virtual',
        ...this.host.config.agentOptions
      }
    };
    if (composer) payload.composerOptions = composer;

    // Client tools: built-in widget tools (ask_user_question, when exposed)
    // plus the per-turn WebMCP page-registry snapshot. Name collisions are
    // impossible: WebMCP entries are `webmcp:`-prefixed server-side while
    // `sdk`-origin built-ins keep bare names. Both kinds ride the same
    // diff-only fingerprint path in client-token mode. Kept to a single await
    // so dispatch microtask timing is unchanged.
    const clientTools = [
      ...this.host.builtInClientTools(this.host.config),
      ...((await (await this.host.getWebMcpBridge())?.snapshotForDispatch()) ?? []),
    ];
    if (clientTools.length > 0) {
      payload.clientTools = clientTools;
    }

    // Add context from providers + opt-in mention context.
    const contextAggregate = await this.#buildContextAggregate(messages);
    if (contextAggregate) payload.context = contextAggregate;

    return payload;
  }

  async #buildPayload(
    messages: AgentWidgetMessage[],
    composerOptions?: ComposerOptionsPayload
  ): Promise<AgentWidgetRequestPayload> {
    // Filter out messages with empty content to prevent validation errors;
    // answered client-tool calls replay as paired toolCalls/toolResults
    // messages. Client-token mode maps `options.messages` itself and never
    // reads these, so the server stays the replay owner there.
    const normalizedMessages = serializeWithToolPairs(
      sortByCreatedAt(messages),
      (message) => (hasValidContent(message) ? toPayloadMessage(message) : null)
    );

    const routed = this.host.routing();
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
      ...this.host.builtInClientTools(this.host.config),
      ...((await (await this.host.getWebMcpBridge())?.snapshotForDispatch()) ?? []),
    ];
    if (clientTools.length > 0) {
      payload.clientTools = clientTools;
    }

    const contextAggregate = await this.#buildContextAggregate(messages);
    if (contextAggregate) payload.context = contextAggregate;

    // Its own field, never folded into `context`: a value in generic context
    // does not change inference, and each transport must decide explicitly.
    // Set before the middleware runs so hosts can read, rewrite, or drop it.
    const composer = this.#normalizeComposerOptions(composerOptions);
    if (composer) payload.composerOptions = composer;

    if (this.host.requestMiddleware) {
      try {
        const result = await this.host.requestMiddleware({
          payload: { ...payload },
          config: this.host.config
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

}
