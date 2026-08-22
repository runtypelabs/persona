/**
 * In-memory `HistoryProvider` (D9's second consumer). Keeps the seam honest:
 * anything it cannot express without a Runtype special case is a seam defect.
 *
 * Not public and not in any tsup entry or package export. Demo pages reach it
 * through the `apps/web` Vite alias
 * (`@runtypelabs/persona/internal/demo-history-provider` -> source) and mount it
 * with `setHistoryProviderFactory()`.
 *
 * Advertises `browser` scope only and omits `resetDevice`, so the "forget this
 * device" control stays hidden.
 */

import type {
  AgentMessageMetadata,
  AgentWidgetMessage,
  AgentWidgetMessageRole,
  ContentPart,
  HistoryIdentityStatus,
  HistoryScope,
} from "../types";
import { createFilePart, createImagePart, createTextPart } from "../utils/content";
import { isHistoryDisplayUnavailable } from "../utils/history-messages";
import {
  HistoryProviderError,
  type HistoryConversationSummary,
  type HistoryDeleteAllOptions,
  type HistoryListOptions,
  type HistoryListResult,
  type HistoryOperationContext,
  type HistoryPageOptions,
  type HistoryPageResult,
  type HistoryProvider,
  type HistoryProviderErrorCode,
  type PreparedHistoryActivation,
} from "./history-provider";

/** Every provider call that can be delayed or made to fail. */
export type DemoHistoryOperation =
  | "list"
  | "getPage"
  | "prepareOpen"
  | "prepareStartNew"
  | "delete"
  | "deleteAll"
  | "update";

export interface DemoHistoryErrorInit {
  code: HistoryProviderErrorCode;
  message?: string;
  /** Meaningful only for `rate_limited`. */
  retryAfterSeconds?: number;
}

export interface DemoHistoryMessageSeed {
  id?: string;
  role: AgentWidgetMessageRole;
  /** Visitor-visible projection only; the demo has no model channel. */
  content: string;
  createdAt?: string;
  contentParts?: ContentPart[];
  /** Renders the withheld-content transcript gap. */
  displayUnavailable?: true;
}

export interface DemoHistoryConversationSeed {
  id?: string;
  title: string;
  targetId?: string | null;
  /** Omitted derives a bounded preview from the newest message. */
  preview?: string | null;
  createdAt?: string;
  updatedAt?: string;
  starred?: boolean;
  /** Oldest first, the order the transcript reads in. */
  messages: DemoHistoryMessageSeed[];
}

export interface DemoHistoryProviderOptions {
  /** Replaces the built-in seed set entirely. */
  conversations?: DemoHistoryConversationSeed[];
  /** List default limit and the fixed message page size. Default 25. */
  pageSize?: number;
  /** Artificial delay applied to every operation. Default 0. */
  latencyMs?: number;
  identityStatus?: HistoryIdentityStatus;
  /** Persistent per-operation failures; clear one with `setFailure(op, null)`. */
  failures?: Partial<Record<DemoHistoryOperation, DemoHistoryErrorInit>>;
  /** Clock for the built-in seed set and minted timestamps. */
  now?: () => number;
  activeConversationId?: string | null;
}

export interface DemoHistoryProvider extends HistoryProvider {
  /** Test/demo-only injection. Notifies subscribers only on a real change. */
  setIdentityStatus(status: HistoryIdentityStatus): void;
  setLatency(ms: number): void;
  /** One-shot, queued per operation; consumed before persistent failures. */
  failNext(operation: DemoHistoryOperation, error: DemoHistoryErrorInit): void;
  /** Persistent until replaced or cleared with `null`. */
  setFailure(
    operation: DemoHistoryOperation,
    error: DemoHistoryErrorInit | null
  ): void;
  clearFailures(): void;
  getActiveConversationId(): string | null;
  getConversationRevision(id: string): string | null;
  /** Simulates a transcript mutation: bumps revision, `updatedAt`, and preview. */
  appendMessage(conversationId: string, message: DemoHistoryMessageSeed): void;
  /** Stored ids in list order (newest first), including empty conversations. */
  getConversationIds(): string[];
}

type DemoConversation = {
  id: string;
  title: string;
  targetId: string | null;
  preview: string | null;
  createdAt: string;
  updatedAt: string;
  starred: boolean;
  revision: string;
  /** Oldest first. */
  messages: AgentWidgetMessage[];
};

/** Local widening, mirroring `utils/history-messages.ts`. */
type HistoryAgentMetadata = AgentMessageMetadata & {
  historyDisplayUnavailable?: true;
};

const DEFAULT_PAGE_SIZE = 25;
const MAX_PAGE_SIZE = 100;
const PREVIEW_MAX = 140;
const LIST_CURSOR_PREFIX = "dhcl_";
const PAGE_CURSOR_PREFIX = "dhcm_";

const DEFAULT_IDENTITY_STATUS: HistoryIdentityStatus = {
  state: "browser_only",
  reason: "no_identity_provider",
};

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const TRANSPARENT_PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
const TINY_PDF = "data:application/pdf;base64,JVBERi0xLjQKJSVFT0YK";

function iso(ms: number): string {
  return new Date(ms).toISOString();
}

function clampPageSize(value: number | undefined, fallback: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) return fallback;
  return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(value)));
}

function encodeCursor(prefix: string, offset: number): string {
  return `${prefix}${offset.toString(36)}`;
}

/** Opaque to callers; malformed values are treated as a missing resource. */
function decodeCursor(prefix: string, cursor: string): number {
  if (!cursor.startsWith(prefix)) {
    throw new HistoryProviderError("not_found", "Unknown history cursor.");
  }
  const offset = Number.parseInt(cursor.slice(prefix.length), 36);
  if (!Number.isFinite(offset) || offset < 0) {
    throw new HistoryProviderError("not_found", "Unknown history cursor.");
  }
  return offset;
}

function truncatePreview(text: string): string {
  const collapsed = text.replace(/\s+/g, " ").trim();
  if (collapsed.length <= PREVIEW_MAX) return collapsed;
  return `${collapsed.slice(0, PREVIEW_MAX - 1)}…`;
}

function derivePreview(messages: AgentWidgetMessage[]): string | null {
  for (let index = messages.length - 1; index >= 0; index -= 1) {
    const message = messages[index];
    if (isHistoryDisplayUnavailable(message)) continue;
    if (message.content) return truncatePreview(message.content);
  }
  return null;
}

function identityKey(status: HistoryIdentityStatus): string {
  const reason = "reason" in status ? status.reason : "";
  return `${status.state}:${reason}`;
}

function toMessage(
  seed: DemoHistoryMessageSeed,
  conversationId: string,
  index: number,
  createdAtMs: number
): AgentWidgetMessage {
  const base: AgentWidgetMessage = {
    id: seed.id ?? `${conversationId}-m${index + 1}`,
    role: seed.role,
    content: seed.displayUnavailable ? "" : seed.content,
    createdAt: seed.createdAt ?? iso(createdAtMs),
  };
  if (seed.displayUnavailable) {
    const agentMetadata: HistoryAgentMetadata = {
      historyDisplayUnavailable: true,
    };
    return { ...base, agentMetadata };
  }
  if (seed.contentParts && seed.contentParts.length > 0) {
    return { ...base, contentParts: [...seed.contentParts] };
  }
  return base;
}

/** Detached copy so callers cannot mutate the store through a returned page. */
function cloneMessage(message: AgentWidgetMessage): AgentWidgetMessage {
  return {
    ...message,
    ...(message.contentParts && { contentParts: [...message.contentParts] }),
    ...(message.agentMetadata && { agentMetadata: { ...message.agentMetadata } }),
  };
}

function summarize(conversation: DemoConversation): HistoryConversationSummary {
  return {
    id: conversation.id,
    title: conversation.title,
    targetId: conversation.targetId,
    preview: conversation.preview,
    messageCount: conversation.messages.length,
    createdAt: conversation.createdAt,
    updatedAt: conversation.updatedAt,
    starred: conversation.starred,
  };
}

/** `updatedAt DESC, id DESC`, matching the Runtype list order. */
function byRecency(a: DemoConversation, b: DemoConversation): number {
  if (a.updatedAt !== b.updatedAt) return a.updatedAt < b.updatedAt ? 1 : -1;
  return a.id < b.id ? 1 : -1;
}

const DEMO_TARGET_ID = "demo-flow";
const DEMO_SECOND_TARGET_ID = "demo-support-agent";

const USER_LINES = [
  "Can you check that for me?",
  "That still is not what I meant.",
  "Okay, and what happens after that?",
  "How long does this usually take?",
  "Could you send that to my email too?",
  "Thanks, one more thing.",
];

const ASSISTANT_LINES = [
  "Sure. Give me a moment while I pull that up.",
  "Here is what I found on your account.",
  "That step usually completes within two business days.",
  "I have noted it. Anything else you want changed?",
  "Done. You should see the update shortly.",
  "Happy to help with that.",
];

/** Alternating user/assistant filler with deterministic minute spacing. */
function buildTurns(count: number, startMs: number): DemoHistoryMessageSeed[] {
  const seeds: DemoHistoryMessageSeed[] = [];
  for (let index = 0; index < count; index += 1) {
    const isUser = index % 2 === 0;
    const lines = isUser ? USER_LINES : ASSISTANT_LINES;
    seeds.push({
      role: isUser ? "user" : "assistant",
      content: lines[Math.floor(index / 2) % lines.length],
      createdAt: iso(startMs + index * MINUTE),
    });
  }
  return seeds;
}

/** Realistic default set: today, yesterday, last month, plus paging depth. */
function defaultSeeds(nowMs: number): DemoHistoryConversationSeed[] {
  const orderStart = nowMs - 40 * MINUTE;
  const refundStart = nowMs - 4 * HOUR;
  const bulkStart = nowMs - 26 * HOUR;
  const giftStart = nowMs - 5 * DAY;
  const subscriptionStart = nowMs - 34 * DAY;

  return [
    {
      id: "demo-conv-order-status",
      title: "Where is my order?",
      targetId: DEMO_TARGET_ID,
      createdAt: iso(orderStart),
      updatedAt: iso(orderStart + 5 * MINUTE),
      messages: [
        {
          role: "user",
          content: "Order 41822 still says processing. Has it shipped?",
          createdAt: iso(orderStart),
        },
        {
          role: "assistant",
          content:
            "It left the warehouse this morning and is due Thursday. Tracking number is 1Z999AA10123456784.",
          createdAt: iso(orderStart + 2 * MINUTE),
        },
        {
          role: "user",
          content: "Can it go to my work address instead?",
          createdAt: iso(orderStart + 4 * MINUTE),
        },
        {
          role: "assistant",
          content:
            "Once a parcel is scanned I cannot reroute it, but the carrier can hold it at a pickup point for you.",
          createdAt: iso(orderStart + 5 * MINUTE),
        },
      ],
    },
    {
      id: "demo-conv-damaged-mug",
      title: "Refund for the damaged mug",
      targetId: DEMO_TARGET_ID,
      createdAt: iso(refundStart),
      updatedAt: iso(refundStart + 33 * MINUTE),
      messages: [
        {
          role: "user",
          content: "The mug arrived cracked. Photo attached.",
          contentParts: [
            createTextPart("The mug arrived cracked. Photo attached."),
            createImagePart(TRANSPARENT_PNG, {
              mimeType: "image/png",
              alt: "Cracked mug",
            }),
          ],
          createdAt: iso(refundStart),
        },
        {
          role: "assistant",
          content: "That should not have shipped. Here is your refund receipt.",
          contentParts: [
            createTextPart(
              "That should not have shipped. Here is your refund receipt."
            ),
            createFilePart(TINY_PDF, "application/pdf", "refund-receipt.pdf"),
          ],
          createdAt: iso(refundStart + MINUTE),
        },
        ...buildTurns(32, refundStart + 2 * MINUTE),
      ],
    },
    {
      id: "demo-conv-bulk-order",
      title: "Bulk order for the office",
      targetId: DEMO_TARGET_ID,
      createdAt: iso(bulkStart),
      updatedAt: iso(bulkStart + 11 * MINUTE),
      messages: [
        {
          role: "user",
          content: "We need 40 of the navy notebooks by the 12th.",
          createdAt: iso(bulkStart),
        },
        {
          role: "assistant",
          content: "",
          displayUnavailable: true,
          createdAt: iso(bulkStart + MINUTE),
        },
        ...buildTurns(10, bulkStart + 2 * MINUTE),
      ],
    },
    {
      id: "demo-conv-gift-wrap",
      title: "Gift wrapping and delivery windows",
      targetId: DEMO_SECOND_TARGET_ID,
      createdAt: iso(giftStart),
      updatedAt: iso(giftStart + 3 * MINUTE),
      messages: [
        {
          role: "user",
          content: "Do you wrap orders, and can I pick the delivery day?",
          createdAt: iso(giftStart),
        },
        {
          role: "assistant",
          content:
            "Wrapping is free on gift orders, and you can choose any weekday inside the next three weeks.",
          createdAt: iso(giftStart + 2 * MINUTE),
        },
      ],
    },
    {
      id: "demo-conv-subscription",
      title: "Pausing my subscription",
      targetId: DEMO_TARGET_ID,
      createdAt: iso(subscriptionStart),
      updatedAt: iso(subscriptionStart + 51 * MINUTE),
      messages: buildTurns(52, subscriptionStart),
    },
  ];
}

export function createDemoHistoryProvider(
  options: DemoHistoryProviderOptions = {}
): DemoHistoryProvider {
  const now = options.now ?? (() => Date.now());
  const pageSize = clampPageSize(options.pageSize, DEFAULT_PAGE_SIZE);
  const seeds = options.conversations ?? defaultSeeds(now());

  let revisionCounter = 0;
  const nextRevision = (): string => {
    revisionCounter += 1;
    return `demo-rev-${revisionCounter.toString(36)}`;
  };

  const conversations = new Map<string, DemoConversation>();
  seeds.forEach((seed, seedIndex) => {
    const id = seed.id ?? `demo-conv-${seedIndex + 1}`;
    const baseMs = now() - (seeds.length - seedIndex) * MINUTE;
    const messages = seed.messages.map((message, index) =>
      toMessage(message, id, index, baseMs + index * MINUTE)
    );
    conversations.set(id, {
      id,
      title: seed.title,
      targetId: seed.targetId ?? null,
      preview: seed.preview !== undefined ? seed.preview : derivePreview(messages),
      createdAt: seed.createdAt ?? messages[0]?.createdAt ?? iso(baseMs),
      updatedAt:
        seed.updatedAt ?? messages[messages.length - 1]?.createdAt ?? iso(baseMs),
      starred: seed.starred ?? false,
      revision: nextRevision(),
      messages,
    });
  });

  let activeConversationId = options.activeConversationId ?? null;
  let latencyMs = options.latencyMs ?? 0;
  let identityStatus = options.identityStatus ?? DEFAULT_IDENTITY_STATUS;
  const identitySubscribers = new Set<(status: HistoryIdentityStatus) => void>();

  const persistentFailures = new Map<DemoHistoryOperation, DemoHistoryErrorInit>();
  for (const [operation, error] of Object.entries(options.failures ?? {})) {
    if (error) persistentFailures.set(operation as DemoHistoryOperation, error);
  }
  const queuedFailures = new Map<DemoHistoryOperation, DemoHistoryErrorInit[]>();

  const capabilities = { scopes: ["browser"] as readonly HistoryScope[] };

  const toError = (init: DemoHistoryErrorInit): HistoryProviderError =>
    new HistoryProviderError(
      init.code,
      init.message ?? `Demo history provider failure: ${init.code}`,
      init.retryAfterSeconds !== undefined
        ? { retryAfterSeconds: init.retryAfterSeconds }
        : undefined
    );

  const delay = async (): Promise<void> => {
    if (latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, latencyMs));
    }
  };

  /** Scope check first (local failure), then latency, then injected failures. */
  const begin = async (
    operation: DemoHistoryOperation,
    context: HistoryOperationContext
  ): Promise<void> => {
    if (!capabilities.scopes.includes(context.scope)) {
      throw new HistoryProviderError(
        "unsupported_scope",
        `Demo history provider supports browser scope only, got ${context.scope}.`
      );
    }
    await delay();
    const queued = queuedFailures.get(operation);
    const injected = queued?.shift() ?? persistentFailures.get(operation);
    if (injected) throw toError(injected);
  };

  const mustGet = (id: string): DemoConversation => {
    const conversation = conversations.get(id);
    if (!conversation) {
      throw new HistoryProviderError("not_found", "Conversation not found.");
    }
    return conversation;
  };

  const touch = (conversation: DemoConversation): void => {
    conversation.revision = nextRevision();
    conversation.updatedAt = iso(now());
    conversation.preview = derivePreview(conversation.messages);
  };

  /** Settles once: commit and discard are mutually exclusive and idempotent. */
  const prepare = (
    conversationId: string,
    conversationRevision: string,
    apply: () => void
  ): PreparedHistoryActivation => {
    let settled = false;
    return {
      conversationId,
      conversationRevision,
      commit() {
        if (settled) return;
        settled = true;
        apply();
      },
      discard() {
        settled = true;
      },
    };
  };

  return {
    capabilities,

    getIdentityStatus() {
      return identityStatus;
    },

    subscribeIdentityStatus(callback) {
      identitySubscribers.add(callback);
      return () => {
        identitySubscribers.delete(callback);
      };
    },

    async list(opts: HistoryListOptions): Promise<HistoryListResult> {
      await begin("list", opts.context);
      const limit = clampPageSize(opts.limit, pageSize);
      const rows = [...conversations.values()]
        // The API lists only conversations that have stored messages.
        .filter((conversation) => conversation.messages.length > 0)
        .filter(
          (conversation) =>
            opts.targetId === undefined ||
            conversation.targetId === opts.targetId
        )
        .sort(byRecency);
      const offset = opts.cursor ? decodeCursor(LIST_CURSOR_PREFIX, opts.cursor) : 0;
      const items = rows.slice(offset, offset + limit).map(summarize);
      const nextOffset = offset + items.length;
      return {
        items,
        nextCursor:
          nextOffset < rows.length
            ? encodeCursor(LIST_CURSOR_PREFIX, nextOffset)
            : null,
      };
    },

    /**
     * Newest page first, oldest-first within the page; follow `nextCursor` for
     * older pages. `beforeCreatedAt` is ignored: every seeded message has a
     * timestamp, so nothing needs synthesizing.
     */
    async getPage(id: string, opts: HistoryPageOptions): Promise<HistoryPageResult> {
      await begin("getPage", opts.context);
      const conversation = mustGet(id);
      const end = opts.cursor
        ? Math.min(decodeCursor(PAGE_CURSOR_PREFIX, opts.cursor), conversation.messages.length)
        : conversation.messages.length;
      const start = Math.max(0, end - pageSize);
      return {
        summary: summarize(conversation),
        messages: conversation.messages.slice(start, end).map(cloneMessage),
        conversationRevision: conversation.revision,
        nextCursor: start > 0 ? encodeCursor(PAGE_CURSOR_PREFIX, start) : null,
      };
    },

    async prepareOpen(id, opts) {
      await begin("prepareOpen", opts.context);
      const conversation = mustGet(id);
      return prepare(conversation.id, conversation.revision, () => {
        activeConversationId = conversation.id;
      });
    },

    async prepareStartNew(opts) {
      await begin("prepareStartNew", opts.context);
      const id = `demo-conv-new-${conversations.size + 1}`;
      const revision = nextRevision();
      const createdAt = iso(now());
      return prepare(id, revision, () => {
        conversations.set(id, {
          id,
          title: "New conversation",
          targetId: DEMO_TARGET_ID,
          preview: null,
          createdAt,
          updatedAt: createdAt,
          starred: false,
          revision,
          messages: [],
        });
        activeConversationId = id;
      });
    },

    async delete(id, opts) {
      await begin("delete", opts.context);
      mustGet(id);
      conversations.delete(id);
      if (activeConversationId === id) activeConversationId = null;
    },

    async update(id, patch, opts) {
      await begin("update", opts.context);
      const conversation = mustGet(id);
      const title = patch.title?.trim();
      // Rename never reorders the list: only the revision moves, not updatedAt.
      if (title) conversation.title = title;
      if (patch.starred !== undefined) conversation.starred = patch.starred;
      conversation.revision = nextRevision();
      return summarize(conversation);
    },

    async deleteAll(opts: HistoryDeleteAllOptions) {
      await begin("deleteAll", opts.context);
      const doomed = [...conversations.values()].filter(
        (conversation) =>
          opts.targetId === undefined || conversation.targetId === opts.targetId
      );
      for (const conversation of doomed) {
        conversations.delete(conversation.id);
        if (activeConversationId === conversation.id) activeConversationId = null;
      }
      return { deleted: doomed.length };
    },

    // --- demo/test controls -------------------------------------------------

    setIdentityStatus(status) {
      if (identityKey(status) === identityKey(identityStatus)) return;
      identityStatus = status;
      for (const subscriber of [...identitySubscribers]) subscriber(status);
    },

    setLatency(ms) {
      latencyMs = Math.max(0, ms);
    },

    failNext(operation, error) {
      const queue = queuedFailures.get(operation) ?? [];
      queue.push(error);
      queuedFailures.set(operation, queue);
    },

    setFailure(operation, error) {
      if (error) persistentFailures.set(operation, error);
      else persistentFailures.delete(operation);
    },

    clearFailures() {
      persistentFailures.clear();
      queuedFailures.clear();
    },

    getActiveConversationId() {
      return activeConversationId;
    },

    getConversationRevision(id) {
      return conversations.get(id)?.revision ?? null;
    },

    appendMessage(conversationId, message) {
      const conversation = mustGet(conversationId);
      conversation.messages.push(
        toMessage(message, conversation.id, conversation.messages.length, now())
      );
      touch(conversation);
    },

    getConversationIds() {
      return [...conversations.values()].sort(byRecency).map((row) => row.id);
    },
  };
}
