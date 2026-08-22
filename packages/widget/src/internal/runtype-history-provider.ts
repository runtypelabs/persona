/**
 * Runtype `HistoryProvider`: the only production provider in v1. Wraps the
 * Phase 1 `AgentWidgetClient` history methods behind the generic seam
 * (`docs/visitor-history-implementation-plan.md` D9).
 *
 * Credential-shaped concerns (visitor store, proofs, 401 recovery, claim, 403
 * degrade, remote reset) stay inside `AgentWidgetClient`; this file only
 * adapts shapes and maps HTTP/client errors onto the one domain vocabulary.
 * No HTTP string or status code escapes into the view.
 *
 * Not public and not in any tsup entry or package export.
 */

import { HistoryClientError, type AgentWidgetClient } from "../client";
import type { ClientSession, HistoryScope } from "../types";
import {
  mapWireMessages,
  mergeWireMessagesById,
} from "../utils/history-messages";
import {
  HistoryProviderError,
  type HistoryConversationSummary,
  type HistoryDeleteAllOptions,
  type HistoryListOptions,
  type HistoryListResult,
  type HistoryPageOptions,
  type HistoryPageResult,
  type HistoryProvider,
  type HistoryProviderErrorCode,
  type PreparedHistoryActivation,
} from "./history-provider";

export interface RuntypeHistoryProviderOptions {
  client: AgentWidgetClient;
  /** Advertise `verified-user` only when the host supplies a proof callback. */
  getIdentityProofConfigured: () => boolean;
  /**
   * Session-owned activation binding. Runs inside a winning `commit()`, after
   * the prepared client session is installed and before the caller continues.
   */
  onActivationCommitted: (session: ClientSession) => void | Promise<void>;
  /** Live client rebuilds hand the provider its replacement. */
  getClient?: () => AgentWidgetClient;
}

/** Client error code -> domain code. Anything unmapped is `unavailable`. */
const ERROR_CODE_MAP = new Map<string, HistoryProviderErrorCode>([
  ["not_found", "not_found"],
  ["conversation_deleted", "not_found"],
  ["rate_limited", "rate_limited"],
  ["authentication_required", "authentication_required"],
  ["invalid_identity_proof", "authentication_required"],
  ["visitor_identity_mismatch", "authentication_required"],
  ["visitor_required", "authentication_required"],
  ["identity_provider_failed", "identity_provider_failed"],
  ["proof_not_admitted", "proof_not_admitted"],
  ["identity_contract_violation", "proof_not_admitted"],
  ["unauthorized", "authentication_failed"],
  ["visitor_token_missing", "authentication_failed"],
  ["conversation_credential_missing", "authentication_failed"],
]);

/** Secret-free, HTTP-free messages: the view branches on `code` anyway. */
const DOMAIN_MESSAGE = new Map<HistoryProviderErrorCode, string>([
  ["not_found", "That conversation is no longer available."],
  ["rate_limited", "Too many history requests."],
  ["authentication_failed", "History access was not authorized."],
  ["authentication_required", "Sign in again to view account history."],
  ["identity_provider_failed", "The identity provider did not respond."],
  [
    "proof_not_admitted",
    "Account history is not available for this configuration.",
  ],
  ["unsupported_scope", "This history scope is not supported."],
  ["unavailable", "Conversation history is unavailable right now."],
]);

const domainMessage = (code: HistoryProviderErrorCode): string =>
  DOMAIN_MESSAGE.get(code) ?? "Conversation history is unavailable right now.";

export function toHistoryProviderError(error: unknown): HistoryProviderError {
  if (error instanceof HistoryProviderError) return error;
  if (error instanceof HistoryClientError) {
    const code = ERROR_CODE_MAP.get(error.code) ?? "unavailable";
    return new HistoryProviderError(code, domainMessage(code), {
      ...(error.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: error.retryAfterSeconds }
        : {}),
    });
  }
  return new HistoryProviderError("unavailable", domainMessage("unavailable"));
}

export function createRuntypeHistoryProvider(
  options: RuntypeHistoryProviderOptions
): HistoryProvider {
  const client = (): AgentWidgetClient =>
    options.getClient?.() ?? options.client;

  const scopes: readonly HistoryScope[] = options.getIdentityProofConfigured()
    ? ["browser", "verified-user"]
    : ["browser"];
  const capabilities = { scopes };

  const assertScope = (scope: HistoryScope): void => {
    if (!scopes.includes(scope)) {
      throw new HistoryProviderError(
        "unsupported_scope",
        domainMessage("unsupported_scope")
      );
    }
  };

  const run = async <T>(scope: HistoryScope, fn: () => Promise<T>): Promise<T> => {
    assertScope(scope);
    try {
      return await fn();
    } catch (error) {
      throw toHistoryProviderError(error);
    }
  };

  /** Commit installs the client session, then runs the session binding. */
  const wrap = (
    prepared: { session: ClientSession; commit(): void; discard(): void }
  ): PreparedHistoryActivation => {
    let settled = false;
    return {
      conversationId: prepared.session.conversationId ?? "",
      conversationRevision: prepared.session.conversationRevision ?? "",
      async commit() {
        if (settled) return;
        settled = true;
        prepared.commit();
        await options.onActivationCommitted(prepared.session);
      },
      discard() {
        if (settled) return;
        settled = true;
        prepared.discard();
      },
    };
  };

  return {
    capabilities,

    getIdentityStatus() {
      return client().getHistoryIdentityStatus();
    },

    subscribeIdentityStatus(callback) {
      return client().subscribeHistoryIdentityStatus(callback);
    },

    subscribeAvailability(callback) {
      return client().subscribeHistoryAvailability(callback);
    },

    async list(opts: HistoryListOptions): Promise<HistoryListResult> {
      return run(opts.context.scope, async () => {
        const page = await client().listConversations({
          ...(opts.cursor ? { cursor: opts.cursor } : {}),
          ...(opts.limit !== undefined ? { limit: opts.limit } : {}),
          ...(opts.targetId ? { targetId: opts.targetId } : {}),
          scope: opts.context.scope,
        });
        return {
          items: page.data as HistoryConversationSummary[],
          nextCursor: page.nextCursor,
        };
      });
    },

    /**
     * Newest page first; `beforeCreatedAt` is the transcript boundary the
     * mapper needs to synthesize missing timestamps for a prepended page.
     */
    async getPage(id: string, opts: HistoryPageOptions): Promise<HistoryPageResult> {
      return run(opts.context.scope, async () => {
        const detail = await client().getConversation(id, {
          ...(opts.cursor ? { messageCursor: opts.cursor } : {}),
          scope: opts.context.scope,
        });
        const mapped = mapWireMessages(detail.messages, {
          ...(opts.beforeCreatedAt
            ? { beforeCreatedAt: opts.beforeCreatedAt }
            : {}),
        });
        return {
          summary: detail.summary as HistoryConversationSummary,
          // Cursor overlap can repeat rows: dedupe by id before returning.
          messages: mergeWireMessagesById([], mapped),
          conversationRevision: detail.conversationRevision ?? "",
          nextCursor: detail.nextMessageCursor,
        };
      });
    },

    async prepareOpen(id, opts) {
      return run(opts.context.scope, async () =>
        wrap(await client().prepareConversationSession(id))
      );
    },

    async prepareStartNew(opts) {
      return run(opts.context.scope, async () =>
        wrap(await client().prepareNewConversationSession())
      );
    },

    async delete(id, opts) {
      await run(opts.context.scope, () =>
        client().deleteConversation(id, { scope: opts.context.scope })
      );
    },

    async deleteAll(opts: HistoryDeleteAllOptions) {
      return run(opts.context.scope, () =>
        client().deleteAllConversations({
          ...(opts.targetId !== undefined ? { targetId: opts.targetId } : {}),
          scope: opts.context.scope,
        })
      );
    },

    /**
     * Never rejects on remote failure: the client clears credentials in its own
     * `finally`, so an unconfirmed revocation still detaches this browser.
     */
    async resetDevice() {
      try {
        await client().resetVisitor();
        return { remoteRevocationConfirmed: true };
      } catch {
        return { remoteRevocationConfirmed: false };
      }
    },
  };
}
