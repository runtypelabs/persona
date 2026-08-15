/**
 * Internal history provider seam (`docs/visitor-history-implementation-plan.md`
 * D9). Session/UI history code depends on this interface, never on
 * `AgentWidgetClient`.
 *
 * Not public in v1: nothing here is re-exported from `index.ts` or any tsup
 * entry, so the published package can neither ship nor expose it. The shape a
 * future `features.history.provider` would take.
 */

import type {
  AgentWidgetMessage,
  HistoryIdentityStatus,
  HistoryScope,
} from "../types";

/** Fixed for the lifetime of one opened history view/action chain. */
export interface HistoryOperationContext {
  scope: HistoryScope;
}

/**
 * Provider-neutral conversation row. Deliberately excludes the deprecated
 * Runtype `flowId` alias: only the Runtype boundary understands it.
 */
export interface HistoryConversationSummary {
  id: string;
  title: string;
  targetId: string | null;
  preview: string | null;
  messageCount: number;
  createdAt: string;
  updatedAt: string;
  /** Visitor-pinned flag. Absent when the provider has no update capability. */
  starred?: boolean;
}

/** Visitor-editable conversation metadata. Absent fields are left unchanged. */
export interface HistoryConversationPatch {
  title?: string;
  starred?: boolean;
}

/**
 * An authorized-but-not-yet-applied conversation activation. The provider must
 * not mutate the active chat until `commit()`.
 */
export interface PreparedHistoryActivation {
  conversationId: string;
  conversationRevision: string;
  /** Apply the already-authorized provider-specific transport/session binding. */
  commit(): void | Promise<void>;
  /** Idempotently abandon a stale/superseded activation without changing chat. */
  discard(): void;
}

export interface HistoryListOptions {
  cursor?: string;
  limit?: number;
  targetId?: string;
  context: HistoryOperationContext;
}

export interface HistoryListResult {
  items: HistoryConversationSummary[];
  nextCursor: string | null;
}

export interface HistoryPageOptions {
  cursor?: string;
  /** Lets the provider synthesize stable timestamps across page boundaries. */
  beforeCreatedAt?: string;
  context: HistoryOperationContext;
}

export interface HistoryPageResult {
  summary: HistoryConversationSummary;
  /** Already mapped; the visitor-visible projection lives in `content`. */
  messages: AgentWidgetMessage[];
  conversationRevision: string;
  /** Follow for the next older page. `null` at the start of the transcript. */
  nextCursor: string | null;
}

export interface HistoryDeleteAllOptions {
  /** Absent means the whole authorized scope, never the UI default. */
  targetId?: string;
  context: HistoryOperationContext;
}

/** Internal in v1; the shape a future public `features.history.provider` would take. */
export interface HistoryProvider {
  readonly capabilities: {
    scopes: readonly HistoryScope[];
  };
  getIdentityStatus(): HistoryIdentityStatus;
  subscribeIdentityStatus(
    callback: (status: HistoryIdentityStatus) => void
  ): () => void;
  list(opts: HistoryListOptions): Promise<HistoryListResult>;
  getPage(id: string, opts: HistoryPageOptions): Promise<HistoryPageResult>;
  prepareOpen(
    id: string,
    opts: { context: HistoryOperationContext }
  ): Promise<PreparedHistoryActivation>;
  prepareStartNew(opts: {
    context: HistoryOperationContext;
  }): Promise<PreparedHistoryActivation>;
  delete(id: string, opts: { context: HistoryOperationContext }): Promise<void>;
  deleteAll(opts: HistoryDeleteAllOptions): Promise<{ deleted: number }>;
  /**
   * Optional capability: visitor-scoped rename/star. Absence hides every
   * update affordance (star glyphs, built-in title-menu actions). A user-set
   * title pins: the provider must never let a later auto-generated title
   * overwrite one set through this call.
   */
  update?(
    id: string,
    patch: HistoryConversationPatch,
    opts: { context: HistoryOperationContext }
  ): Promise<HistoryConversationSummary>;
  /**
   * Optional capability. Absence hides "forget this device". Resolves (never
   * rejects) on remote failure; credentials are cleared in `finally` either way.
   */
  resetDevice?(): Promise<{ remoteRevocationConfirmed: boolean }>;
  subscribeAvailability?(callback: (available: boolean) => void): () => void;
}

/**
 * The one domain-error vocabulary for provider failures. HTTP strings and
 * status codes never reach the view. Branch on `code`, never on message text.
 */
export type HistoryProviderErrorCode =
  | "not_found"
  | "rate_limited"
  | "authentication_failed"
  | "authentication_required"
  | "identity_provider_failed"
  | "proof_not_admitted"
  | "unsupported_scope"
  | "unavailable";

export class HistoryProviderError extends Error {
  public readonly code: HistoryProviderErrorCode;
  /** Meaningful only for `rate_limited`. */
  public readonly retryAfterSeconds?: number;

  constructor(
    code: HistoryProviderErrorCode,
    message: string,
    options?: { retryAfterSeconds?: number }
  ) {
    super(message);
    this.name = "HistoryProviderError";
    this.code = code;
    if (options?.retryAfterSeconds !== undefined) {
      this.retryAfterSeconds = options.retryAfterSeconds;
    }
  }
}

export function isHistoryProviderError(
  value: unknown
): value is HistoryProviderError {
  return value instanceof HistoryProviderError;
}
