import { getClientDispatchSync, loadClientDispatch } from "./client-dispatch-loader";
import type { CreateClientSessionOptions, ClientDispatchHost } from "./client-dispatch";
import {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetEvent,
  AgentWidgetStreamParser,
  AgentWidgetContextProvider,
  AgentWidgetRequestMiddleware,
  AgentWidgetCustomFetch,
  AgentWidgetSSEEventParser,
  AgentWidgetStreamCheckpoint,
  AgentWidgetHeadersFunction,
  AgentWidgetSSEEventResult as _AgentWidgetSSEEventResult,
  ClientSession,
  ClientChatRequest,
  VoicePriorToolResult,
  ClientToolDefinition,
  ClientFeedbackRequest,
  PreparedClientSession,
  WidgetHistoryInternals,
  HistoryScope,
  HistoryIdentityStatus,
  HistoryConversationPage,
  HistoryConversationDetail,
  HistoryDisplayProjection,
  ComposerOptionsPayload,
  WebMcpConfirmHandler
} from "./types";
import {
  computeClientToolsFingerprint,
  getWebMcpToolDisplayTitle,
  loadWebMcpPolyfillModule,
  recordWebMcpToolDisplayTitles,
} from "./webmcp-bridge";
import { loadWebMcpRuntime } from "./webmcp-runtime-loader";
import { loadVoiceClientTools } from "./voice-client-tools-loader";
import type { WebMcpBridge } from "./webmcp-runtime-entry";
import { resolveTarget } from "./utils/target";
import { generateTurnId } from "./utils/message-id";
import { builtInClientToolsForDispatch } from "./ask-user-question-tool";
import {
  createPlainTextParser,
  createJsonStreamParser,
  createRegexJsonParser,
  createXmlParser
} from "./utils/formatting";
import { VERSION } from "./version";
import { getClientStreamSync, loadClientStream } from "./client-stream-loader";
import { loadClientHistory } from "./client-history-loader";
import type { ClientHistoryHost } from "./client-history";
import type { ClientResumeHost } from "./client-resume";

/** History transcripts stay on the wire shape; `utils/history-messages.ts` maps them. */
export type { HistoryWireMessage } from "./utils/history-messages";
// artifactsSidebarEnabled is used in ui.ts to gate the sidebar pane rendering;
// artifact events are always processed here regardless of config.

export type DispatchOptions = {
  messages: AgentWidgetMessage[];
  signal?: AbortSignal;
  /** Pre-generated ID for the expected assistant response (for feedback tracking) */
  assistantMessageId?: string;
  /**
   * Per-turn composer selections. Rides the proxy/custom-backend and agent
   * payloads as `composerOptions`; on the inline-agent path a selected model
   * that `composer.models` declares also maps to that turn's `agent.model`.
   * Client-token mode drops it: that route's agent is pinned server side.
   */
  composerOptions?: ComposerOptionsPayload;
  /**
   * Client-token only: this turn supersedes the in-flight one. Sends
   * `submitMode: "interrupt"` so the server cancels the prior run.
   */
  interrupt?: boolean;
  /**
   * Client-token only: a voice model reads the reply aloud (a delegated voice
   * turn). Sends `voice: { spoken: true }` so the server asks for a speakable
   * answer.
   */
  voiceSpoken?: boolean;
  /**
   * Client-token only: page tools the voice server already ran for this
   * delegated turn, sent as `voice.priorToolResults` with `voiceSpoken`.
   * Proxy/agent payloads carry them as replayed tool rows instead.
   */
  voicePriorToolResults?: VoicePriorToolResult[];
};

export type SSEHandler = (event: AgentWidgetEvent) => void;

const DEFAULT_ENDPOINT = "https://api.runtype.com/v1/dispatch";
import { DEFAULT_CLIENT_API_BASE } from "./utils/constants";

/** Branch on `code`, never on message text. */
export type HistoryClientErrorCode =
  | "visitor_required"
  | "not_found"
  | "conversation_credential_missing"
  | "history_disabled"
  /** No stored visitor credential; a retry cannot repair a missing header. */
  | "visitor_token_missing"
  /** The store changed under the request: the response must not be committed. */
  | "credential_changed"
  /** A bound visitor lost its proof, or the server rejected the one we sent. */
  | "authentication_required"
  /** The host's `getIdentityProof` threw or rejected. */
  | "identity_provider_failed"
  | "invalid_identity_proof"
  | "visitor_identity_mismatch"
  /** Admission gate off: verified scope is a misconfiguration, not an outage. */
  | "proof_not_admitted"
  /** Server acknowledgement contradicts what the request actually sent. */
  | "identity_contract_violation"
  | "unauthorized"
  | "rate_limited"
  | "payload_too_large"
  /** Chat 410: the active conversation record was deleted elsewhere. */
  | "conversation_deleted"
  | "request_failed";

export class HistoryClientError extends Error {
  public readonly code: HistoryClientErrorCode;
  /** Present on `rate_limited` when the server sent `Retry-After`. */
  public readonly retryAfterSeconds?: number;
  constructor(
    code: HistoryClientErrorCode,
    message: string,
    opts?: { retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = "HistoryClientError";
    this.code = code;
    if (opts?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = opts.retryAfterSeconds;
    }
  }
}

const identityReason = (status: HistoryIdentityStatus): string | undefined =>
  "reason" in status ? status.reason : undefined;

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

export class AgentWidgetClient {
  readonly #apiUrl: string;
  readonly #headers: Record<string, string>;
  readonly #debug: boolean;
  #historyInternals: WidgetHistoryInternals;
  #config: AgentWidgetConfig;
  readonly #createStreamParser: () => AgentWidgetStreamParser;
  readonly #contextProviders: AgentWidgetContextProvider[];
  readonly #requestMiddleware?: AgentWidgetRequestMiddleware;
  readonly #customFetch?: AgentWidgetCustomFetch;
  readonly #parseSSEEvent?: AgentWidgetSSEEventParser;
  readonly #getHeaders?: AgentWidgetHeadersFunction;
  #onSSEEvent?: SSEEventCallback;
  #streamGeneration = 0;
  #streamReaders = new Set<ReadableStreamDefaultReader<Uint8Array>>();
  
  // Client token mode properties
  /**
   * Turn id of the newest client-token dispatch. A dispatch whose id no longer
   * matches is superseded, and every SSE frame it still receives is dropped
   */
  #currentClientTurnId: string | null = null;
  private clientSession: ClientSession | null = null;
  #sessionInitPromise: Promise<ClientSession> | null = null;
  /**
   * Early-init latch for `warmSession()`. `false` = armed. Otherwise it holds
   * the session value (`null` or an expired session) the one early attempt was
   * made against, so a failed attempt is not retried on every keystroke. It is
   * re-armed when a session is installed or cleared, so each session lifetime
   * gets one early init.
   */
  #sessionWarmLatch: ClientSession | null | false = false;

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
  #sentNonEmptyClientToolsSessionId: string | null = null;

  // Visitor history (client-token mode ONLY). `historyUnavailable` latches for
  // the client's lifetime on a 403 `visitor_history_disabled`; `claimInFlight`
  // bounds the immediate first-conversation claim to one extra init.
  #historyUnavailable = false;
  #historyUnavailableWarned = false;
  #claimInFlight = false;
  // Evidence-based identity state. Null means "never moved off the resting
  // state", which is recomputed from config so `update()` stays honest.
  #historyIdentityStatus: HistoryIdentityStatus | null = null;
  // Fan-out beside the single internals callback: the Runtype history provider
  // bridges these into the generic seam. Cleared with the client instance.
  #historyIdentitySubscribers = new Set<
    (status: HistoryIdentityStatus) => void
  >();
  #historyAvailabilitySubscribers = new Set<(available: boolean) => void>();

  // WebMCP: page-discovered tool consumption. The bridge runtime ships in the
  // lazy webmcp-runtime chunk; `webMcpBridge` stays null until the chunk is
  // adopted (and forever when `config.webmcp?.enabled !== true`). Dispatch
  // paths await `getWebMcpBridge()`; sync callers read the cached instance.
  private webMcpBridge: WebMcpBridge | null = null;
  #webMcpBridgePromise: Promise<WebMcpBridge | null> | null = null;
  /** undefined = never set; null = explicitly cleared. Applied at adoption. */
  #pendingWebMcpConfirmHandler: WebMcpConfirmHandler | null | undefined;

  constructor(
    config: AgentWidgetConfig = {},
    historyInternals: WidgetHistoryInternals = {}
  ) {
    this.#config = config;
    this.#historyInternals = historyInternals;
    if (config.target && (config.agentId || config.flowId || config.agent)) {
      throw new Error(
        "[Persona] `target` is mutually exclusive with `agentId`, `flowId`, and `agent`. Set only one routing field.",
      );
    }
    this.#apiUrl = config.apiUrl ?? DEFAULT_ENDPOINT;
    this.#headers = {
      "Content-Type": "application/json",
      "X-Persona-Version": VERSION,
      ...config.headers
    };
    this.#debug = Boolean(config.debug);
    // Use custom stream parser if provided, otherwise use parserType, or fall back to plain text parser
    this.#createStreamParser = config.streamParser ?? getParserFromType(config.parserType);
    this.#contextProviders = config.contextProviders ?? [];
    this.#requestMiddleware = config.requestMiddleware;
    this.#customFetch = config.customFetch;
    this.#parseSSEEvent = config.parseSSEEvent;
    this.#getHeaders = config.getHeaders;
    if (config.webmcp?.enabled === true) {
      // Kick the runtime chunk fetch now so the bridge is warm before the
      // first dispatch snapshot (which awaits it either way).
      this.#webMcpBridgePromise = this.#createWebMcpBridge(config.webmcp);
    }
  }

  /** Load the lazy runtime chunk and construct the bridge with core-owned deps. */
  #createWebMcpBridge(
    webmcpConfig: NonNullable<AgentWidgetConfig["webmcp"]>
  ): Promise<WebMcpBridge | null> {
    return loadWebMcpRuntime()
      .then((mod) => {
        const bridge = new mod.WebMcpBridge(webmcpConfig, {
          recordToolDisplayTitles: recordWebMcpToolDisplayTitles,
          getToolDisplayTitle: getWebMcpToolDisplayTitle,
          loadPolyfill: loadWebMcpPolyfillModule,
        });
        if (this.#pendingWebMcpConfirmHandler !== undefined) {
          bridge.setConfirmHandler(this.#pendingWebMcpConfirmHandler);
        }
        this.webMcpBridge = bridge;
        return bridge;
      })
      .catch((err) => {
        // Failed chunk fetch: clear the memoized promise so the next dispatch
        // retries (the chunk loader clears its own rejection too).
        this.#webMcpBridgePromise = null;
        // Always surface this: a silently-absent bridge means empty tool
        // snapshots and failed webmcp resumes with no operator signal.
        console.warn("[Persona] Failed to load the WebMCP runtime chunk", err);
        return null;
      });
  }

  /** Resolve the bridge, loading the runtime chunk on first use. */
  #getWebMcpBridge(): Promise<WebMcpBridge | null> {
    if (this.webMcpBridge) return Promise.resolve(this.webMcpBridge);
    if (this.#config.webmcp?.enabled !== true) return Promise.resolve(null);
    if (!this.#webMcpBridgePromise) {
      this.#webMcpBridgePromise = this.#createWebMcpBridge(this.#config.webmcp);
    }
    return this.#webMcpBridgePromise;
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
    this.#config = next;
  }

  /** Re-thread the controller-owned history dependencies (store rebuild). */
  public setHistoryInternals(internals: WidgetHistoryInternals): void {
    this.#historyInternals = internals;
  }

  /**
   * Set callback for capturing raw SSE events
   */
  /** @internal Invalidate all readers at a local conversation/identity boundary. */
  public cancelStreams(): void {
    this.#streamGeneration += 1;
    // Durable detachment explicitly closes its attachment. Other transports
    // retain their existing customFetch producer teardown contract; invalidate
    // their events without introducing a new reader.cancel() side effect.
    if (!this.#config.backgroundConversations) return;
    for (const reader of this.#streamReaders) void reader.cancel().catch(() => {});
  }

  public setSSEEventCallback(callback: SSEEventCallback): void {
    this.#onSSEEvent = callback;
  }

  /**
   * WebMCP: wire (or replace) the confirm-bubble handler. Called from
   * `ui.ts` once the widget panel is built and the approval-bubble
   * chrome is ready to render.
   */
  public setWebMcpConfirmHandler(handler: WebMcpConfirmHandler | null): void {
    // Queue for a bridge still in flight; apply immediately once adopted.
    this.#pendingWebMcpConfirmHandler = handler;
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
  /**
   * WebMCP access for a Runtype voice call's fast tier: the same per-turn
   * snapshot `clientTools[]` carries, registry change notifications, and the
   * voice execute path. `null` when WebMCP is not enabled.
   */
  public getVoiceClientTools():import("./types").VoiceClientTools | null {
    if (this.#config.webmcp?.enabled !== true) return null;
    const bridge = () => this.#getWebMcpBridge();
    const surface: import("./types").VoiceClientTools = {
      open: async (channel) => (await loadVoiceClientTools()).createVoiceClientToolsSession(surface, channel),
      snapshot: async () => {
        const tools = (await (await bridge())?.snapshotForDispatch()) ?? [];
        return { tools, fingerprint: computeClientToolsFingerprint(tools) };
      },
      onChange: (listener) => {
        let stop: (() => void) | null = null;
        let stopped = false;
        void bridge().then((b) => {
          if (b && !stopped) stop = b.watchToolChanges(listener);
        });
        return () => {
          stopped = true;
          stop?.();
        };
      },
      execute: async (name, args, options) => {
        const b = await bridge();
        if (!b) {
          return { status: "failed", error: { message: "WebMCP runtime failed to load." } };
        }
        return b.executeVoiceToolCall(name, args, options);
      },
    };
    return surface;
  }

  public executeWebMcpToolCall(
    wireToolName: string,
    args: unknown,
    signal?: AbortSignal,
    toolCallId?: string,
  ): Promise<import("./types").WebMcpToolResult> | null {
    // Route on CONFIG, not bridge presence: the lazily-loaded bridge may not
    // have adopted yet, and returning null would misroute the call to the
    // legacy local-tool resume path.
    if (this.#config.webmcp?.enabled !== true) return null;
    return this.#getWebMcpBridge().then((bridge) =>
      bridge
        ? bridge.executeToolCall(wireToolName, args, signal, toolCallId)
        : {
            isError: true,
            content: [
              { type: "text", text: "WebMCP runtime failed to load." },
            ],
          }
    );
  }

  /**
   * Get the current SSE event callback (used to preserve across client recreation)
   */
  public getSSEEventCallback(): SSEEventCallback | undefined {
    return this.#onSSEEvent;
  }

  /**
   * Check if running in client token mode
   */
  public isClientTokenMode(): boolean {
    return !!this.#config.clientToken;
  }

  /**
   * Resolve the effective backend routing for the current config. Combines the
   * explicit `agentId`/`flowId` fields with the normalized `target` string
   * (resolved via `resolveTarget`). Computed on demand so it stays correct
   * across `update()`; the `target`/explicit-field conflict is rejected in the
   * constructor, so at most one source is set here.
   */
  #routing(): {
    agentId?: string;
    flowId?: string;
    targetPayload?: Record<string, unknown>;
  } {
    const { agentId, flowId, target, targetProviders } = this.#config;
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
    return !!(this.#config.agent || this.#routing().agentId);
  }

  /**
   * Base URL for Runtype client-surface routes (`/v1/client/*`,
   * `/v1/agents/*`). Strips a configured `/v1/dispatch` suffix so an apiUrl
   * pointed at the dispatch endpoint still resolves its sibling routes. Not
   * used for proxy-mode URLs, whose resume route is `${apiUrl}/resume`.
   */
  #clientApiBase(): string {
    return (
      this.#config.apiUrl?.replace(/\/+$/, '').replace(/\/v1\/dispatch$/, '') ||
      DEFAULT_CLIENT_API_BASE
    );
  }

  /**
   * Get the appropriate API URL based on mode
   */
  #getClientApiUrl(endpoint: 'init' | 'chat' | 'resume'): string {
    return `${this.#clientApiBase()}/v1/client/${endpoint}`;
  }

  /**
   * Get the current client session (if any)
   */
  public getClientSession(): ClientSession | null {
    return this.clientSession;
  }

  /** Persona's built-in reconnect transport for client-token sessions. */
  public async reconnectClientTokenStream(ctx: {
    executionId: string;
    after: string;
    signal: AbortSignal;
  }): Promise<Response> {
    let session = await this.initSession();
    let recovered = false;

    for (;;) {
      const conversationId = session.conversationId;
      const visitorToken = await this.readVisitorToken();
      if (session.durableRecovery?.enabled !== true || !conversationId || !visitorToken) {
        throw new HistoryClientError(
          'visitor_token_missing',
          'Durable recovery is not enabled for this client session'
        );
      }
      const path =
        `${this.#clientApiBase()}/v1/client/conversations/` +
        `${encodeURIComponent(conversationId)}/executions/` +
        `${encodeURIComponent(ctx.executionId)}/events`;
      const query = new URLSearchParams({
        sessionId: session.sessionId,
        after: ctx.after,
      });
      const response = await fetch(`${path}?${query}`, {
        method: 'GET',
        headers: {
          'X-Persona-Version': VERSION,
          'X-Visitor-Token': visitorToken,
        },
        signal: ctx.signal,
      });
      if (response.status === 401 && !recovered) {
        recovered = true;
        const history = await loadClientHistory();
        session = await history.recoverFromUnauthorized(
          this.#historyHost(),
          await history.readErrorCode(this.#historyHost(), response),
          null,
          true
        );
        continue;
      }
      if (!response.ok) {
        throw await (await loadClientHistory()).historyErrorFor(this.#historyHost(), response, true);
      }
      return response;
    }
  }

  /**
   * Fire-and-forget early `initSession()` for client-token mode, driven by the
   * widget's `sessionInit` trigger (or a host calling it directly, e.g. on
   * hover). It fires at most once per session lifetime and is a no-op while a
   * session is live or an init is already in flight. Errors are swallowed, with
   * no `onSessionExpired` and no UI: a send calls `initSession()` again and
   * reuses the in-flight promise, so any failure resurfaces there exactly as it
   * would without the early init. Sends nothing new on the wire. Outside
   * client-token mode this does nothing.
   *
   * Resolves with the session this call initialized, or `null` when it was
   * skipped or failed. It never rejects.
   */
  public async warmSession(): Promise<ClientSession | null> {
    const current = this.clientSession;
    if (
      !this.isClientTokenMode() ||
      this.#sessionInitPromise ||
      (current && new Date() < current.expiresAt) ||
      this.#sessionWarmLatch === current
    ) {
      return null;
    }
    this.#sessionWarmLatch = current;
    // Swallowed on purpose: the send's own initSession() reports failures.
    return this.initSession().catch(() => null);
  }

  /**
   * Initialize session for client token mode.
   * Called by the send if no live session exists. The widget normally calls
   * it earlier, when the visitor shows intent to send (see the `sessionInit`
   * config option and `warmSession()`), and concurrent calls share one
   * in-flight request, so a send racing an early init issues a single
   * `/v1/client/init`.
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
    if (this.#sessionInitPromise) {
      return this.#sessionInitPromise;
    }

    // Callers that dedupe share this promise, so the stale check below covers
    // them too (the send reusing an early init included).
    const pending: Promise<ClientSession> = (this.#sessionInitPromise = this.#_doInitSession()
      .then((session) => {
        // A clear or replacement (credential change, start-new, proof re-init)
        // while this was in flight makes the result stale: never install it.
        if (this.#sessionInitPromise !== pending) return this.initSession();
        this.clientSession = session;
        this.#sessionWarmLatch = false;
        // A freshly-minted session must resend the full WebMCP tool list on its
        // next turn: drop any diff-only fingerprint cached under a prior session,
        // so we never claim "unchanged" against a session the server didn't store
        // the set under. (Belt-and-suspenders with the sessionId comparison in the
        // send decision and the server's 409 resend signal.)
        this.resetClientToolsFingerprint();
        this.#config.onSessionInit?.(session);
        return session;
      })
      .finally(() => {
        if (this.#sessionInitPromise === pending) this.#sessionInitPromise = null;
      }));
    return pending;
  }

  /** Visitor history rides on client-token init only, and latches off after a 403 degrade. */
  #isHistoryCapable(): boolean {
    return (
      this.#config.features?.history?.enabled === true &&
      this.isClientTokenMode() &&
      !this.#historyUnavailable
    );
  }

  private async readVisitorToken(): Promise<string | null> {
    const store = this.#historyInternals.visitorStore;
    if (!store) return null;
    await store.ready;
    return (await store.get()) ?? null;
  }

  /** One-way, client-lifetime latch: chat keeps working without history. */
  #markHistoryUnavailable(): void {
    if (this.#historyUnavailable) return;
    // Announce before the latch flips, or the resting state already matches.
    this.#setHistoryIdentityStatus({ state: 'unavailable', reason: 'history_disabled' });
    this.#historyUnavailable = true;
    if (!this.#historyUnavailableWarned && typeof console !== 'undefined') {
      this.#historyUnavailableWarned = true;
      // eslint-disable-next-line no-console
      console.warn(
        '[Persona] Visitor history is disabled for this surface; continuing without it.'
      );
    }
    this.#historyInternals.onHistoryAvailabilityChanged?.(false);
    for (const subscriber of [...this.#historyAvailabilitySubscribers]) {
      subscriber(false);
    }
  }

  /** Public, secret-free view of the current identity state. */
  public getHistoryIdentityStatus(): HistoryIdentityStatus {
    return this.#historyIdentityStatus ?? this.#restingIdentityStatus();
  }

  /** Deduped status notifications; carries no token, proof, or identity value. */
  public subscribeHistoryIdentityStatus(
    callback: (status: HistoryIdentityStatus) => void
  ): () => void {
    this.#historyIdentitySubscribers.add(callback);
    return () => {
      this.#historyIdentitySubscribers.delete(callback);
    };
  }

  /** Fires only on the one-way 403 degrade; availability never returns. */
  public subscribeHistoryAvailability(
    callback: (available: boolean) => void
  ): () => void {
    this.#historyAvailabilitySubscribers.add(callback);
    if (this.#historyUnavailable) callback(false);
    return () => {
      this.#historyAvailabilitySubscribers.delete(callback);
    };
  }

  /** Config-derived state before any per-operation evidence exists. */
  #restingIdentityStatus(): HistoryIdentityStatus {
    if (!this.isClientTokenMode()) {
      return { state: 'unavailable', reason: 'ineligible_mode' };
    }
    if (this.#config.features?.history?.enabled !== true || this.#historyUnavailable) {
      return { state: 'unavailable', reason: 'history_disabled' };
    }
    return this.#browserOnlyStatus();
  }

  /** Keeps an already-observed browser_only reason; otherwise derives one. */
  #browserOnlyStatus(): HistoryIdentityStatus {
    const current = this.#historyIdentityStatus;
    if (current?.state === 'browser_only') return current;
    return this.#derivedBrowserOnly();
  }

  #derivedBrowserOnly(): HistoryIdentityStatus {
    if (this.#config.features?.history?.scope === 'browser') {
      return { state: 'browser_only', reason: 'configured_browser_scope' };
    }
    if (!this.#config.getIdentityProof) {
      return { state: 'browser_only', reason: 'no_identity_provider' };
    }
    return { state: 'browser_only', reason: 'proof_unavailable_before_binding' };
  }

  /** Identical consecutive states are not re-announced. */
  #setHistoryIdentityStatus(next: HistoryIdentityStatus): void {
    const current = this.getHistoryIdentityStatus();
    const unchanged =
      current.state === next.state && identityReason(current) === identityReason(next);
    this.#historyIdentityStatus = next;
    if (unchanged) return;
    this.#historyInternals.onHistoryIdentityStatusChanged?.(next);
    for (const subscriber of [...this.#historyIdentitySubscribers]) subscriber(next);
  }

  /**
   * The single uncached init primitive: builds one body, performs one fetch.
   * `conversationId` and `sessionId` are mutually exclusive on the wire (strict
   * server union), so a resume never carries the stored session id.
   */
  async #createClientSession(opts: CreateClientSessionOptions): Promise<ClientSession> {
    const runtime = getClientDispatchSync() ?? await loadClientDispatch();
    return new runtime.ClientDispatch(this.#dispatchHost()).createClientSession(opts);
  }

  async #_doInitSession(): Promise<ClientSession> {
    const runtime = getClientDispatchSync() ?? await loadClientDispatch();
    return new runtime.ClientDispatch(this.#dispatchHost()).initializeSession();
  }

  /**
   * Ordinary init carrying an identity proof: binds/rebinds the visitor,
   * persists any replacement token (inside `createClientSession`), and installs
   * the result as the live session.
   */
  async #reinitWithProof(proof: string): Promise<ClientSession> {
    const storedSessionId = this.#config.getStoredSessionId?.() || null;
    const previousConversationId = this.#config.getStoredConversationId?.() || null;
    const session = await this.#createClientSession({
      storedSessionId,
      identityProof: proof,
    });
    const installed = this.#finishInit(session, previousConversationId, false);
    this.clientSession = installed;
    this.#sessionInitPromise = null;
    this.#sessionWarmLatch = false;
    this.resetClientToolsFingerprint();
    return installed;
  }

  /**
   * Continuity guard + id persistence. A different record than the persisted
   * one is a privacy transition, announced before the new id is written.
   */
  #finishInit(
    session: ClientSession,
    previousConversationId: string | null,
    continuityBroken: boolean
  ): ClientSession {
    const conversationId = session.conversationId;
    if (
      conversationId &&
      previousConversationId &&
      (continuityBroken || conversationId !== previousConversationId)
    ) {
      this.#historyInternals.onHistoryContinuityChanged?.({
        previousConversationId,
        conversationId,
      });
    }
    this.#config.setStoredSessionId?.(session.sessionId);
    if (conversationId) {
      this.#config.setStoredConversationId?.(conversationId);
      this.#historyInternals.setStoredConversationRevision?.(
        session.conversationRevision ?? null
      );
    }
    return session;
  }

  /** Wrap an uncached init so nothing installs until the winner commits. */
  #prepared(session: ClientSession): PreparedClientSession {
    let settled = false;
    return {
      session,
      commit: () => {
        if (settled) return;
        settled = true;
        this.clientSession = session;
        this.#sessionWarmLatch = false;
        this.resetClientToolsFingerprint();
      },
      discard: () => {
        settled = true;
      },
    };
  }

  /**
   * Transactional reopen of a known conversation. Always bypasses the session
   * cache, never sends the stored session id, and needs a credential the server
   * will accept (stored visitor token or a caller-supplied proof).
   */
  public async prepareConversationSession(
    conversationId: string,
    opts?: { proof?: string | null }
  ): Promise<PreparedClientSession> {
    if (!this.isClientTokenMode()) {
      throw new Error('prepareConversationSession() only available in client token mode');
    }
    if (!this.#isHistoryCapable()) {
      throw new HistoryClientError(
        'history_disabled',
        'Visitor history is disabled for this surface'
      );
    }
    await this.#historyInternals.historyBootstrapReady;
    const proof = opts?.proof ?? null;
    const visitorToken = await this.readVisitorToken();
    if (!visitorToken && !proof) {
      throw new HistoryClientError(
        'conversation_credential_missing',
        'Reopening a conversation requires a stored visitor token or an identity proof'
      );
    }
    const session = await this.#createClientSession({
      conversationId,
      identityProof: proof,
    });
    return this.#prepared(session);
  }

  /** Transactional new conversation: no stored session id, no conversation id. */
  public async prepareNewConversationSession(): Promise<PreparedClientSession> {
    if (!this.isClientTokenMode()) {
      throw new Error('prepareNewConversationSession() only available in client token mode');
    }
    await this.#historyInternals.historyBootstrapReady;
    const session = await this.#createClientSession({});
    return this.#prepared(session);
  }

  /**
   * D3 privacy boundary: a sibling tab replaced or revoked the shared visitor
   * credential. Revoking it does not revoke an already-minted chat session, so
   * the cache must go, and whatever this visitor was bound to is gone with it.
   */
  public handleExternalCredentialChange(): void {
    this.clearClientSession();
    if (this.#isHistoryCapable()) {
      this.#setHistoryIdentityStatus(this.#derivedBrowserOnly());
    }
  }

  /**
   * Clear the current client session
   */
  public clearClientSession(): void {
    this.clientSession = null;
    this.#sessionInitPromise = null;
    this.#sessionWarmLatch = false;
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
    this.#sentNonEmptyClientToolsSessionId = null;
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

    const runtime = getClientDispatchSync() ?? await loadClientDispatch();
    return new runtime.ClientDispatch(this.#dispatchHost()).sendFeedback(feedback);
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
    // Feedback on a restored transcript can precede any init (`sessionInit`
    // defers it to intent); the feedback click is intent enough.
    const session = this.getClientSession() ?? (await this.initSession());

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
    const session = this.getClientSession() ?? (await this.initSession());

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
    const session = this.getClientSession() ?? (await this.initSession());

    return this.sendFeedback({
      sessionId: session.sessionId,
      type: 'nps',
      rating,
      comment,
    });
  }

  // ==========================================================================
  // Visitor conversation history REST (client token mode only). The bodies
  // live in `client-history.ts` (lazy `client-history.js` chunk on the CDN).
  // ==========================================================================

  async #resolveChatIdentityProof(signal?: AbortSignal): Promise<ClientChatRequest['identityProof']> {
    signal?.throwIfAborted();
    const provider = this.#config.identityProvider;
    if (provider === undefined) return undefined;
    const getIdentityProof = this.#config.getIdentityProof;
    if (!provider.trim() || !getIdentityProof) {
      throw new Error('Chat identity requires identityProvider and getIdentityProof.');
    }
    let token: string | null;
    let onAbort: (() => void) | undefined;
    try {
      const proof = Promise.resolve().then(() => getIdentityProof());
      token = signal
        ? await Promise.race([
            proof,
            new Promise<never>((_, reject) => {
              onAbort = () => reject(signal.reason);
              signal.addEventListener('abort', onAbort, { once: true });
              if (signal.aborted) onAbort();
            }),
          ])
        : await proof;
    } catch {
      signal?.throwIfAborted();
      throw new Error('The identity proof provider failed.');
    } finally {
      if (onAbort) signal?.removeEventListener('abort', onAbort);
    }
    if (typeof token !== 'string' || !token.trim()) {
      throw new Error('A fresh identity proof is required to send this message.');
    }
    return { provider, token };
  }

  // Live accessors for the approval / resume requests (`client-resume.ts`,
  // shipped in the lazy client-stream chunk on the CDN).
  #resumeHostCache: ClientResumeHost | null = null;
  #resumeHost(): ClientResumeHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    return (this.#resumeHostCache ??= {
      get config() {
        return client.#config;
      },
      headers: this.#headers,
      getHeaders: this.#getHeaders,
      debug: this.#debug,
      clientApiBase: () => client.#clientApiBase(),
      getClientApiUrl: (endpoint) => client.#getClientApiUrl(endpoint),
      getWebMcpBridge: () => client.#getWebMcpBridge(),
      sendWithClientToolsDiff: (sessionId, tools, doFetch, opts) =>
        client.#sendWithClientToolsDiff(sessionId, tools, doFetch, opts),
      initSession: () => client.initSession(),
      readVisitorToken: () => client.readVisitorToken(),
      isClientTokenMode: () => client.isClientTokenMode(),
    });
  }

  // Live accessors handed to the lazily loaded history REST functions
  // (`client-history.ts`); built once per client.
  #historyHostCache: ClientHistoryHost | null = null;
  #historyHost(): ClientHistoryHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    return (this.#historyHostCache ??= {
      HistoryClientError,
      get config() {
        return client.#config;
      },
      get historyInternals() {
        return client.#historyInternals;
      },
      get clientSession() {
        return client.clientSession;
      },
      clientApiBase: () => client.#clientApiBase(),
      setHistoryIdentityStatus: (next) => client.#setHistoryIdentityStatus(next),
      browserOnlyStatus: () => client.#browserOnlyStatus(),
      derivedBrowserOnly: () => client.#derivedBrowserOnly(),
      reinitWithProof: (proof) => client.#reinitWithProof(proof),
      isHistoryCapable: () => client.#isHistoryCapable(),
      clearClientSession: () => client.clearClientSession(),
      initSession: () => client.initSession(),
      readVisitorToken: () => client.readVisitorToken(),
      isClientTokenMode: () => client.isClientTokenMode(),
    });
  }

  /** One page of the visitor's conversations, newest first. */
  public async listConversations(opts?: {
    cursor?: string;
    limit?: number;
    targetId?: string;
    scope?: HistoryScope;
  }): Promise<HistoryConversationPage> {
    return (await loadClientHistory()).listConversations(this.#historyHost(), opts);
  }

  /**
   * One transcript page (newest first, oldest-first within the page). Messages
   * stay on the wire shape: `utils/history-messages.ts` owns the mapping.
   */
  public async getConversation(
    conversationId: string,
    opts?: { messageCursor?: string; scope?: HistoryScope }
  ): Promise<HistoryConversationDetail> {
    return (await loadClientHistory()).getConversation(this.#historyHost(), conversationId, opts);
  }

  /**
   * Finalize browser-derived visitor-visible projections for the ACTIVE
   * conversation. Transport op, not a history read: current session + browser
   * scope, never an identity proof.
   */
  public async finalizeDisplayProjections(
    conversationId: string,
    messages: HistoryDisplayProjection[]
  ): Promise<{ conversationRevision: string | null }> {
    return (await loadClientHistory()).finalizeDisplayProjections(this.#historyHost(), conversationId, messages);
  }

  public async deleteConversation(
    conversationId: string,
    opts?: { scope?: HistoryScope }
  ): Promise<{ deleted: number }> {
    return (await loadClientHistory()).deleteConversation(this.#historyHost(), conversationId, opts);
  }

  /**
   * Delete every conversation matching `targetId`. An omitted filter means the
   * whole authorized visitor/client-token scope: headless callers own that
   * choice, the UI always passes the active `ClientSession.targetId`.
   */
  public async deleteAllConversations(opts?: {
    targetId?: string;
    scope?: HistoryScope;
  }): Promise<{ deleted: number }> {
    return (await loadClientHistory()).deleteAllConversations(this.#historyHost(), opts);
  }

  /**
   * Revoke this browser's visitor credential. Always browser scope (the route
   * accepts no proof) and the local clear is unconditional: a failed remote
   * revocation still detaches this device.
   */
  public async resetVisitor(): Promise<{ reset: true }> {
    return (await loadClientHistory()).resetVisitor(this.#historyHost());
  }

  /**
   * Send a message - handles both proxy and client token modes
   */
  public async dispatch(options: DispatchOptions, onEvent: SSEHandler) {
    options.signal?.throwIfAborted();
    // Fetch the stream processor in parallel with the request; a failure here
    // is retried by the awaited load in #streamResponse.
    loadClientStream().catch(() => {});
    const clientToken = this.isClientTokenMode();
    const agentMode = this.isAgentMode();
    // Claim before loading: an interrupted turn must never resume after its
    // replacement merely because its module request completed later.
    const turnId = generateTurnId();
    if (clientToken) this.#currentClientTurnId = turnId;
    onEvent({ type: "status", status: "connecting" });
    const runtime = getClientDispatchSync() ?? await loadClientDispatch().catch((error: unknown) => {
      const err = error instanceof Error ? error : new Error(String(error));
      if (!clientToken || this.#currentClientTurnId === turnId) onEvent({ type: "error", error: err });
      throw err;
    });
    options.signal?.throwIfAborted();
    if (clientToken && this.#currentClientTurnId !== turnId) throw new DOMException("Turn superseded", "AbortError");
    const dispatch = new runtime.ClientDispatch(this.#dispatchHost());
    if (clientToken) return dispatch.dispatchClientToken(options, onEvent, turnId);
    if (agentMode) return dispatch.dispatchAgent(options, onEvent);
    return dispatch.dispatchProxy(options, onEvent);
  }

  #dispatchHost(): ClientDispatchHost {
    // eslint-disable-next-line @typescript-eslint/no-this-alias
    const client = this;
    return Object.setPrototypeOf({
      HistoryClientError,
      get claimInFlight() { return client.#claimInFlight; },
      set claimInFlight(value: boolean) { client.#claimInFlight = value; },
      get clientToolsFingerprintSessionId() { return client.clientToolsFingerprintSessionId; },
      set clientToolsFingerprintSessionId(value: string | null) { client.clientToolsFingerprintSessionId = value; },
      get lastSentClientToolsFingerprint() { return client.lastSentClientToolsFingerprint; },
      set lastSentClientToolsFingerprint(value: string | null) { client.lastSentClientToolsFingerprint = value; },
      get sentNonEmptyClientToolsSessionId() { return client.#sentNonEmptyClientToolsSessionId; },
      set sentNonEmptyClientToolsSessionId(value: string | null) { client.#sentNonEmptyClientToolsSessionId = value; },
      get historyInternals() { return client.#historyInternals; },
      markHistoryUnavailable: () => client.#markHistoryUnavailable(),
      apiUrl: this.#apiUrl,
      contextProviders: this.#contextProviders,
      requestMiddleware: this.#requestMiddleware,
      customFetch: this.#customFetch,
      get clientSession() { return client.clientSession; },
      set clientSession(value: ClientSession | null) { client.clientSession = value; },
      isCurrentTurn: (turnId: string) => client.#currentClientTurnId === turnId,
      isHistoryCapable: () => client.#isHistoryCapable(),
      createClientSession: (opts: Parameters<ClientDispatchHost["createClientSession"]>[0]) => client.#createClientSession(opts),
      finishInit: (session: ClientSession, expected: string | null, warm: boolean) => client.#finishInit(session, expected, warm),
      resetSessionWarmLatch: () => { client.#sessionWarmLatch = false; },
      resetClientToolsFingerprint: () => client.resetClientToolsFingerprint(),
      clearClientSession: () => client.clearClientSession(),
      resolveChatIdentityProof: (signal?: AbortSignal) => client.#resolveChatIdentityProof(signal),
      routing: () => client.#routing(),
      builtInClientTools: builtInClientToolsForDispatch,
      streamResponse: (...args: Parameters<ClientDispatchHost["streamResponse"]>) => client.#streamResponse(...args),
    }, this.#resumeHost()) as ClientDispatchHost;
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
    seedContent?: string,
    signal?: AbortSignal,
    resumeMessages?: AgentWidgetMessage[],
    checkpoint?: AgentWidgetStreamCheckpoint
  ): Promise<void> {
    onEvent({ type: "status", status: "connected" });
    try {
      await this.#streamResponse(body, onEvent, assistantMessageId, seedContent, signal, resumeMessages, checkpoint);
    } finally {
      onEvent({ type: "status", status: "idle" });
    }
  }

  /**
   * Send an approval decision to the API and return the response
   * for streaming continuation.
   *
   * Routes by mode:
   *  - **client-token mode**: POST `${apiBase}/v1/client/approve` with the
   *    active `sessionId` and no Bearer key (runtypelabs/core#9518). Answers a
   *    gate authored `tools.approval.approver: 'end-user'`; the SSE body has
   *    the same shape as `/v1/client/resume`.
   *  - **dispatch / proxy mode**: POST `${apiBase}/v1/agents/{agentId}/approve`
   *    with the host's headers.
   */
  public async resolveApproval(
    approval: { agentId: string; executionId: string; approvalId: string },
    decision: 'approved' | 'denied',
    options?: { assistantMessageId?: string }
  ): Promise<Response> {
    return (await loadClientStream()).resolveApproval(this.#resumeHost(), approval, decision, options);
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
   * @param executionId - The paused execution id carried on `await`.
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
  async #sendWithClientToolsDiff(
    sessionId: string,
    fullClientTools: ClientToolDefinition[] | undefined,
    doFetch: (
      toolFields: Pick<ClientChatRequest, 'clientTools' | 'clientToolsFingerprint'>
    ) => Promise<Response>,
    opts?: { emptyMeansReplace?: boolean }
  ): Promise<{ response: Response; commit: () => void }> {
    const runtime = getClientDispatchSync() ?? await loadClientDispatch();
    return new runtime.ClientDispatch(this.#dispatchHost()).sendWithClientToolsDiff(sessionId, fullClientTools, doFetch, opts);
  }

  public async resumeFlow(
    executionId: string,
    toolOutputs: Record<string, unknown>,
    options?: {
      streamResponse?: boolean;
      signal?: AbortSignal;
      after?: string;
      assistantMessageId?: string;
    }
  ): Promise<Response> {
    return (await loadClientStream()).resumeFlow(this.#resumeHost(), executionId, toolOutputs, options);
  }

  /**
   * The opt-in structured mention channel: the MOST RECENT user turn's
   * `mentionContext` (set by `session.applyMentionBundle`) namespaced under
   * `mentions`. Only the latest user message is consulted — otherwise an older
   * turn's mentions would re-attach to `context.mentions` on every later send.
   * Returns null when the latest user turn carried no structured mention context.
   * The default model-visible path (`llmAppend`) already rode into the message's
   * `llmContent`/`contentParts`, so it needs nothing here.
   */
  async #streamResponse(
    body: ReadableStream<Uint8Array>,
    onEvent: SSEHandler,
    assistantMessageId?: string,
    seedContent?: string,
    signal?: AbortSignal,
    resumeMessages?: AgentWidgetMessage[],
    checkpoint?: AgentWidgetStreamCheckpoint
  ) {
    const { streamResponse } = getClientStreamSync() ?? (await loadClientStream());
    return streamResponse(
      {
        config: () => this.#config,
        streamGeneration: () => this.#streamGeneration,
        streamReaders: this.#streamReaders,
        createStreamParser: this.#createStreamParser,
        parseSSEEvent: this.#parseSSEEvent,
        onSSEEvent: (eventType, payload) => this.#onSSEEvent?.(eventType, payload),
      },
      body,
      onEvent,
      assistantMessageId,
      seedContent,
      signal,
      resumeMessages,
      checkpoint
    );
  }
}
