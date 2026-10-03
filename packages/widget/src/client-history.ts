/**
 * Visitor conversation-history REST for `AgentWidgetClient` (client token
 * mode): list / get / finalize / delete conversations, reset the visitor, and
 * the identity-proof binding and 401 recovery those calls share.
 *
 * Split out of `client.ts` so the IIFE/CDN bundle ships it as the lazy
 * `client-history.js` sibling chunk (see `client-history-loader.ts`): it only
 * runs once a page lists or opens history. The client's public methods keep
 * their signatures and delegate here through a `ClientHistoryHost`.
 */
import type {
  AgentWidgetConfig,
  ClientSession,
  WidgetHistoryInternals,
  HistoryScope,
  HistoryConversationSummary,
  HistoryIdentityStatus,
  HistoryConversationPage,
  HistoryConversationDetail,
  HistoryDisplayProjection
} from "./types";
import type { HistoryClientError } from "./client";
import { VERSION } from "./version";

/** Per-message / per-batch display-projection caps (contract facts #5, #15). */
const DISPLAY_PROJECTION_MESSAGE_CAP = 32768;
const DISPLAY_PROJECTION_BATCH_CAP = 49152;

/** Normalize current history metadata without leaking wire-only aliases. */
const normalizeHistorySummary = (raw: unknown): HistoryConversationSummary => {
  const row = (raw ?? {}) as Record<string, unknown>;
  const targetId = typeof row.targetId === "string" ? row.targetId : null;
  return {
    id: typeof row.id === "string" ? row.id : "",
    title: typeof row.title === "string" ? row.title : "",
    targetId,
    preview: typeof row.preview === "string" ? row.preview : null,
    messageCount: typeof row.messageCount === "number" ? row.messageCount : 0,
    createdAt: typeof row.createdAt === "string" ? row.createdAt : "",
    updatedAt: typeof row.updatedAt === "string" ? row.updatedAt : "",
  };
};

const PROOF_NOT_ADMITTED_MESSAGE =
  "The identity proof was not admitted; account history is unavailable";
const PROOF_REJECTED_MESSAGE = "The identity proof was rejected";
const NO_VISITOR_CREDENTIAL_MESSAGE = "The request carried no visitor credential";
const IDENTITY_MISMATCH_MESSAGE = "The stored visitor belongs to a different signed-in user";

export type ClientHistoryHost = {
  /** Core's class: errors must pass `instanceof` checks outside this chunk. */
  readonly HistoryClientError: typeof HistoryClientError;
  readonly config: AgentWidgetConfig;
  readonly historyInternals: WidgetHistoryInternals;
  readonly clientSession: ClientSession | null;
  clientApiBase(): string;
  setHistoryIdentityStatus(next: HistoryIdentityStatus): void;
  browserOnlyStatus(): HistoryIdentityStatus;
  derivedBrowserOnly(): HistoryIdentityStatus;
  reinitWithProof(proof: string): Promise<ClientSession>;
  isHistoryCapable(): boolean;
  clearClientSession(): void;
  initSession(): Promise<ClientSession>;
  readVisitorToken(): Promise<string | null>;
  isClientTokenMode(): boolean;
};

/** `/v1/client/<path>` with a query string; credentials ride in headers. */
function historyUrl(
  h: ClientHistoryHost,
  path: string,
  query: Record<string, string | number | undefined>
  ): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === '') continue;
    params.set(key, String(value));
  }
  const search = params.toString();
  return `${h.clientApiBase()}/v1/client/${path}${search ? `?${search}` : ''}`;
}

/** Explicit per-operation scope wins; otherwise config, then evidence. */
function resolveHistoryScope(
  h: ClientHistoryHost, requested?: HistoryScope): HistoryScope {
  if (requested) return requested;
  const configured = h.config.features?.history?.scope;
  if (configured) return configured;
  return h.config.getIdentityProof ? 'verified-user' : 'browser';
}

/**
 * Resolve the proof for one logical request. `null` is an intentional
 * browser-scope fallback only while the visitor has never been bound.
 */
async function resolveIdentityProof(
  h: ClientHistoryHost,
  session: ClientSession,
  track: boolean
  ): Promise<string | null> {
  const provider = h.config.getIdentityProof;
  if (!provider) {
    if (track) h.setHistoryIdentityStatus(h.browserOnlyStatus());
    return null;
  }
  if (track) h.setHistoryIdentityStatus({ state: 'verifying' });
  let proof: string | null;
  try {
    proof = (await provider()) ?? null;
  } catch {
    if (track) h.setHistoryIdentityStatus({ state: 'identity_provider_failed' });
    throw new h.HistoryClientError(
      'identity_provider_failed',
      'The identity proof provider failed'
    );
  }
  if (proof) return proof;
  if (session.visitor?.endUserId != null) {
    // Never downgrade a bound visitor into its own browser scope.
    if (track) {
      h.setHistoryIdentityStatus({
        state: 'authentication_required',
        reason: 'proof_unavailable_after_binding',
      });
    }
    throw new h.HistoryClientError(
      'authentication_required',
      'This browser is bound to a signed-in user and needs a fresh identity proof'
    );
  }
  if (track) {
    h.setHistoryIdentityStatus({
      state: 'browser_only',
      reason: 'proof_unavailable_before_binding',
    });
  }
  return null;
}

/** Bind the visitor before the first verified request; admitted proofs only. */
async function bindIdentity(
  h: ClientHistoryHost,
  session: ClientSession,
  proof: string,
  track: boolean
  ): Promise<ClientSession> {
  if (session.visitor?.endUserId != null) return session;
  const bound = await h.reinitWithProof(proof);
  const admitted =
    bound.visitor?.identityStatus === 'admitted' && bound.visitor?.endUserId != null;
  if (!admitted) {
    // "ignored", or a pre-acknowledgement server that left endUserId null.
    if (track) {
      h.setHistoryIdentityStatus({
        state: 'configuration_error',
        reason: 'proof_not_admitted',
      });
    }
    throw new h.HistoryClientError(
      'proof_not_admitted',
      PROOF_NOT_ADMITTED_MESSAGE
    );
  }
  return bound;
}

export async function readErrorCode(
  h: ClientHistoryHost, response: Response): Promise<string> {
  const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (typeof body.error === 'string') return body.error;
  if (typeof body.message === 'string') return body.message;
  return '';
}

/**
 * Selective one-shot 401 recovery. Returns the session to retry under;
 * anything unrecoverable throws typed and is never retried.
 */
export async function recoverFromUnauthorized(
  h: ClientHistoryHost,
  reason: string,
  proof: string | null,
  track: boolean
  ): Promise<ClientSession> {
  const text = reason.toLowerCase();
  if (text.includes('invalid_identity_proof')) {
    if (track) {
      h.setHistoryIdentityStatus({
        state: 'authentication_required',
        reason: 'invalid_identity_proof',
      });
    }
    throw new h.HistoryClientError('invalid_identity_proof', PROOF_REJECTED_MESSAGE);
  }
  if (text.includes('visitor token required')) {
    throw new h.HistoryClientError('visitor_token_missing', NO_VISITOR_CREDENTIAL_MESSAGE);
  }
  if (text.includes('visitor_identity_mismatch')) {
    if (!proof) {
      if (track) {
        h.setHistoryIdentityStatus({
          state: 'authentication_required',
          reason: 'proof_unavailable_after_binding',
        });
      }
      throw new h.HistoryClientError('visitor_identity_mismatch', IDENTITY_MISMATCH_MESSAGE);
    }
    // Same proof: binds this visitor, or gives a different person a clean one.
    return h.reinitWithProof(proof);
  }
  if (text.includes('expired') || text.includes('not found')) {
    h.clearClientSession();
    return h.initSession();
  }
  throw new h.HistoryClientError('unauthorized', reason || 'History request was not authorized');
}

export async function historyErrorFor(
  h: ClientHistoryHost,
  response: Response,
  track: boolean
  ): Promise<HistoryClientError> {
  const code = await readErrorCode(h, response);
  if (response.status === 404) {
    return new h.HistoryClientError('not_found', 'Conversation not found');
  }
  if (response.status === 429) {
    const header = Number.parseInt(response.headers.get('Retry-After') ?? '', 10);
    return new h.HistoryClientError('rate_limited', 'Too many history requests', {
      ...(Number.isFinite(header) ? { retryAfterSeconds: header } : {}),
    });
  }
  if (response.status === 503 && code.includes('identity_proof_not_admitted')) {
    if (track) {
      h.setHistoryIdentityStatus({
        state: 'configuration_error',
        reason: 'proof_not_admitted',
      });
    }
    return new h.HistoryClientError(
      'proof_not_admitted',
      PROOF_NOT_ADMITTED_MESSAGE
    );
  }
  if (response.status === 401) {
    const text = code.toLowerCase();
    if (text.includes('invalid_identity_proof')) {
      if (track) {
        h.setHistoryIdentityStatus({
          state: 'authentication_required',
          reason: 'invalid_identity_proof',
        });
      }
      return new h.HistoryClientError('invalid_identity_proof', PROOF_REJECTED_MESSAGE);
    }
    if (text.includes('visitor token required')) {
      return new h.HistoryClientError('visitor_token_missing', NO_VISITOR_CREDENTIAL_MESSAGE);
    }
    if (text.includes('visitor_identity_mismatch')) {
      return new h.HistoryClientError('visitor_identity_mismatch', IDENTITY_MISMATCH_MESSAGE);
    }
    return new h.HistoryClientError('unauthorized', code || 'History request was not authorized');
  }
  return new h.HistoryClientError(
    'request_failed',
    code || `History request failed (${response.status})`
  );
}

/**
 * Validate `X-History-Identity-Status` before any body is committed: the
 * per-operation acknowledgement, not a prior init, is what proves scope.
 */
function commitIdentityAcknowledgement(
  h: ClientHistoryHost,
  header: string | null,
  proofSent: boolean,
  track: boolean
  ): void {
  const value = header?.toLowerCase() ?? null;
  if (proofSent) {
    if (value === 'admitted') {
      if (track) h.setHistoryIdentityStatus({ state: 'verified' });
      return;
    }
    if (track) {
      h.setHistoryIdentityStatus({
        state: 'configuration_error',
        reason: 'proof_not_admitted',
      });
    }
    if (value === 'ignored') {
      // The gate-off path must fail before I/O; a 2xx here is a broken server.
      throw new h.HistoryClientError(
        'identity_contract_violation',
        'Server reported an ignored identity proof on a success response'
      );
    }
    throw new h.HistoryClientError(
      'proof_not_admitted',
      'The response did not acknowledge the identity proof this request sent'
    );
  }
  if (value === 'admitted') {
    throw new h.HistoryClientError(
      'identity_contract_violation',
      'Server admitted an identity proof that was never sent'
    );
  }
  // "not_provided", a missing header (rolling deploy), or an unknown value:
  // no verified claim was made either way.
  if (track) h.setHistoryIdentityStatus(h.browserOnlyStatus());
}

/**
 * Shared history transport: live session, `sessionId` query param,
 * `X-Visitor-Token` header, one resolved proof, one-shot 401 recovery, and a
 * credential-revision guard that discards a response the store outran.
 */
async function historyFetch<T>(
  h: ClientHistoryHost,
  path: string,
  opts: {
    method: 'GET' | 'POST' | 'PATCH' | 'DELETE';
    query?: Record<string, string | number | undefined>;
    scope?: HistoryScope;
    body?: unknown;
    /** Reset tolerates a missing credential; every other route requires one. */
    visitorTokenOptional?: boolean;
    keepalive?: boolean;
    /** Transport ops validate the acknowledgement but publish no status. */
    trackIdentity?: boolean;
  }
  ): Promise<T> {
  assertHistoryUsable(h);
  const track = opts.trackIdentity !== false;
  let session = await h.initSession();

  // Resolved once per logical request: a recovery retry reuses the same proof
  // so one action cannot switch identities midway.
  let proof: string | null = null;
  if (resolveHistoryScope(h, opts.scope) === 'verified-user') {
    proof = await resolveIdentityProof(h, session, track);
    if (proof) session = await bindIdentity(h, session, proof, track);
  }

  const store = h.historyInternals.visitorStore;
  let recovered = false;
  for (;;) {
    const capturedRevision = store?.revision() ?? 0;
    const visitorToken = await h.readVisitorToken();
    if (!visitorToken && !opts.visitorTokenOptional) {
      throw new h.HistoryClientError(
        'visitor_token_missing',
        'No visitor credential is stored for this browser'
      );
    }
    const response = await fetch(
      historyUrl(h, path, { ...opts.query, sessionId: session.sessionId }),
      {
        method: opts.method,
        headers: {
          'X-Persona-Version': VERSION,
          ...(visitorToken ? { 'X-Visitor-Token': visitorToken } : {}),
          ...(proof ? { 'X-Identity-Proof': proof } : {}),
          ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        ...(opts.body !== undefined ? { body: JSON.stringify(opts.body) } : {}),
        ...(opts.keepalive ? { keepalive: true } : {}),
      }
    );

    if (response.status === 401 && !recovered) {
      recovered = true;
      session = await recoverFromUnauthorized(h, 
        await readErrorCode(h, response),
        proof,
        track
      );
      continue;
    }
    if (!response.ok) {
      throw await historyErrorFor(h, response, track);
    }

    const acknowledgement = response.headers.get('X-History-Identity-Status');
    const data = (await response.json().catch(() => undefined)) as T;
    if (store && store.revision() !== capturedRevision) {
      // Another tab reset or replaced the credential: this body is stale.
      throw new h.HistoryClientError(
        'credential_changed',
        'The visitor credential changed while the request was in flight'
      );
    }
    commitIdentityAcknowledgement(h, acknowledgement, proof !== null, track);
    return data;
  }
}

function assertHistoryUsable(h: ClientHistoryHost): void {
  if (!h.isClientTokenMode()) {
    throw new Error('Conversation history is only available in client token mode');
  }
  if (!h.isHistoryCapable()) {
    throw new h.HistoryClientError(
      'history_disabled',
      'Visitor history is disabled for this surface'
    );
  }
}

/** One page of the visitor's conversations, newest first. */
export async function listConversations(
  h: ClientHistoryHost, opts?: {
  cursor?: string;
  limit?: number;
  targetId?: string;
  scope?: HistoryScope;
  }): Promise<HistoryConversationPage> {
  const page = await historyFetch<{
    data?: unknown[];
    nextCursor?: string | null;
  }>(h, 'conversations', {
    method: 'GET',
    query: {
      ...(opts?.cursor ? { cursor: opts.cursor } : {}),
      ...(opts?.limit !== undefined ? { limit: opts.limit } : {}),
      ...(opts?.targetId ? { targetId: opts.targetId } : {}),
    },
    ...(opts?.scope ? { scope: opts.scope } : {}),
  });
  return {
    data: (Array.isArray(page?.data) ? page.data : []).map(normalizeHistorySummary),
    nextCursor: typeof page?.nextCursor === 'string' ? page.nextCursor : null,
  };
}

/**
 * One transcript page (newest first, oldest-first within the page). Messages
 * stay on the wire shape: `utils/history-messages.ts` owns the mapping.
 */
export async function getConversation(
  h: ClientHistoryHost,
  conversationId: string,
  opts?: { messageCursor?: string; scope?: HistoryScope }
  ): Promise<HistoryConversationDetail> {
  const detail = await historyFetch<Record<string, unknown>>(
    h, `conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'GET',
      query: {
        ...(opts?.messageCursor ? { messageCursor: opts.messageCursor } : {}),
      },
      ...(opts?.scope ? { scope: opts.scope } : {}),
    }
  );
  return {
    summary: normalizeHistorySummary(detail),
    messages: Array.isArray(detail?.messages)
      ? (detail.messages as HistoryConversationDetail['messages'])
      : [],
    nextMessageCursor:
      typeof detail?.nextMessageCursor === 'string' ? detail.nextMessageCursor : null,
    conversationRevision:
      typeof detail?.conversationRevision === 'string' ? detail.conversationRevision : null,
  };
}

/**
 * Finalize browser-derived visitor-visible projections for the ACTIVE
 * conversation. Transport op, not a history read: current session + browser
 * scope, never an identity proof.
 */
export async function finalizeDisplayProjections(
  h: ClientHistoryHost,
  conversationId: string,
  messages: HistoryDisplayProjection[]
  ): Promise<{ conversationRevision: string | null }> {
  assertHistoryUsable(h);
  let total = 0;
  for (const message of messages) {
    const size = message.displayContent.length;
    if (size > DISPLAY_PROJECTION_MESSAGE_CAP) {
      throw new h.HistoryClientError(
        'payload_too_large',
        `displayContent exceeds the ${DISPLAY_PROJECTION_MESSAGE_CAP} character limit`
      );
    }
    total += size;
  }
  if (total > DISPLAY_PROJECTION_BATCH_CAP) {
    throw new h.HistoryClientError(
      'payload_too_large',
      `Display projection batch exceeds the ${DISPLAY_PROJECTION_BATCH_CAP} character limit`
    );
  }

  await h.initSession();
  const store = h.historyInternals.visitorStore;
  const capturedRevision = store?.revision() ?? 0;
  const result = await historyFetch<{ conversationRevision?: string }>(
    h, `conversations/${encodeURIComponent(conversationId)}/display-projections`,
    {
      method: 'PATCH',
      body: { messages },
      scope: 'browser',
      keepalive: total <= DISPLAY_PROJECTION_BATCH_CAP,
      trackIdentity: false,
    }
  );
  const conversationRevision =
    typeof result?.conversationRevision === 'string' ? result.conversationRevision : null;
  // Install only while the same record and the same credential are still live.
  if (
    conversationRevision &&
    h.clientSession?.conversationId === conversationId &&
    (store?.revision() ?? 0) === capturedRevision
  ) {
    h.historyInternals.setStoredConversationRevision?.(conversationRevision);
  }
  return { conversationRevision };
}

export async function deleteConversation(
  h: ClientHistoryHost,
  conversationId: string,
  opts?: { scope?: HistoryScope }
  ): Promise<{ deleted: number }> {
  const result = await historyFetch<{ deleted?: number }>(
    h, `conversations/${encodeURIComponent(conversationId)}`,
    {
      method: 'DELETE',
      ...(opts?.scope ? { scope: opts.scope } : {}),
    }
  );
  return { deleted: typeof result?.deleted === 'number' ? result.deleted : 0 };
}

/**
 * Delete every conversation matching `targetId`. An omitted filter means the
 * whole authorized visitor/client-token scope: headless callers own that
 * choice, the UI always passes the active `ClientSession.targetId`.
 */
export async function deleteAllConversations(
  h: ClientHistoryHost, opts?: {
  targetId?: string;
  scope?: HistoryScope;
  }): Promise<{ deleted: number }> {
  const result = await historyFetch<{ deleted?: number }>(h, 'conversations', {
    method: 'DELETE',
    query: {
      ...(opts?.targetId !== undefined ? { targetId: opts.targetId } : {}),
    },
    ...(opts?.scope ? { scope: opts.scope } : {}),
  });
  return { deleted: typeof result?.deleted === 'number' ? result.deleted : 0 };
}

/**
 * Revoke this browser's visitor credential. Always browser scope (the route
 * accepts no proof) and the local clear is unconditional: a failed remote
 * revocation still detaches this device.
 */
export async function resetVisitor(h: ClientHistoryHost): Promise<{ reset: true }> {
  assertHistoryUsable(h);
  h.setHistoryIdentityStatus({ state: 'resetting' });
  try {
    await historyFetch<{ reset?: boolean }>(h, 'visitor/reset', {
      method: 'POST',
      scope: 'browser',
      visitorTokenOptional: true,
    });
  } finally {
    await h.historyInternals.visitorStore?.clear();
    // Post-reset resting state: this browser is a never-bound visitor again.
    h.setHistoryIdentityStatus(h.derivedBrowserOnly());
  }
  return { reset: true };
}
