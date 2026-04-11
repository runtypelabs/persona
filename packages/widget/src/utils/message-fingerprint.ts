/**
 * Message-level fingerprint cache for skipping re-renders of unchanged messages.
 *
 * During streaming, every SSE chunk triggers renderMessagesWithPluginsImpl which
 * rebuilds ALL message bubbles. The fingerprint cache lets us skip rebuilding
 * messages whose content hasn't changed, so only the actively streaming message
 * is re-rendered each cycle.
 */

export type FingerprintableMessage = {
  id: string;
  role: string;
  content: string;
  streaming?: boolean;
  variant?: string;
  rawContent?: string;
  llmContent?: string;
  approval?: { status?: string; [key: string]: unknown };
  toolCall?: {
    status?: string;
    chunks?: string[];
    args?: unknown;
    [key: string]: unknown;
  };
  reasoning?: { chunks?: string[]; status?: string; [key: string]: unknown };
  contentParts?: unknown[];
};

export type MessageCacheEntry = {
  fingerprint: string;
  wrapper: HTMLElement;
};

export type MessageCache = Map<string, MessageCacheEntry>;

/**
 * Compute a fast fingerprint for a message to detect changes.
 * Uses string concatenation with a delimiter rather than JSON.stringify for performance.
 * The configVersion parameter ensures cache invalidation when widget config changes.
 */
export function computeMessageFingerprint(
  message: FingerprintableMessage,
  configVersion: number
): string {
  return [
    message.id,
    message.role,
    message.content?.length ?? 0,
    message.content?.slice(-32) ?? "",
    message.streaming ? "1" : "0",
    message.variant ?? "",
    message.rawContent?.length ?? 0,
    message.llmContent?.length ?? 0,
    message.approval?.status ?? "",
    message.toolCall?.status ?? "",
    message.toolCall?.chunks?.length ?? 0,
    message.toolCall?.chunks?.[message.toolCall.chunks.length - 1]?.slice(-32) ?? "",
    typeof message.toolCall?.args === "string"
      ? message.toolCall.args.length
      : message.toolCall?.args
        ? JSON.stringify(message.toolCall.args).length
        : 0,
    message.reasoning?.chunks?.length ?? 0,
    message.contentParts?.length ?? 0,
    configVersion,
  ].join("\x00");
}

/**
 * Create a new message cache instance.
 */
export function createMessageCache(): MessageCache {
  return new Map();
}

/**
 * Look up a cached wrapper for a message. Returns the cached wrapper
 * if the fingerprint matches, or null if the message needs re-rendering.
 */
export function getCachedWrapper(
  cache: MessageCache,
  messageId: string,
  fingerprint: string
): HTMLElement | null {
  const entry = cache.get(messageId);
  if (entry && entry.fingerprint === fingerprint) {
    return entry.wrapper;
  }
  return null;
}

/**
 * Store a rendered wrapper in the cache.
 */
export function setCachedWrapper(
  cache: MessageCache,
  messageId: string,
  fingerprint: string,
  wrapper: HTMLElement
): void {
  cache.set(messageId, { fingerprint, wrapper });
}

/**
 * Remove cache entries for messages that no longer exist.
 * Call after each render pass with the current message IDs.
 */
export function pruneCache(
  cache: MessageCache,
  activeMessageIds: Set<string>
): void {
  for (const key of cache.keys()) {
    if (!activeMessageIds.has(key)) {
      cache.delete(key);
    }
  }
}
