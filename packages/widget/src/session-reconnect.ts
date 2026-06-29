// Durable-session reconnect orchestration (the cold path).
//
// This module holds the heavy reconnect machinery — the bounded backoff loop,
// the focus/online wake listeners, and the give-up finalizer. It is only ever
// reached through a dynamic `import("./session-reconnect")` in `session.ts`,
// gated on `config.reconnectStream`, so a widget that never opts into durable
// reconnect (the overwhelming majority, including the theme-editor preview)
// never loads it. With code-splitting enabled on the ESM subpath builds, that
// keeps this code out of those bundles entirely.
//
// IMPORTANT: this module must NOT statically import from `session.ts` (that
// would form a runtime cycle and pull the whole session back into the split
// chunk, defeating the point). It reaches everything it needs through the
// `ReconnectHost` interface the session hands it. Type-only imports are erased
// at build time, so importing `AgentWidgetSessionStatus` as a type is fine.

import type {
  AgentWidgetConfig,
  AgentWidgetMessage,
  ResumableHandle,
} from "./types";
import type { AgentWidgetSessionStatus } from "./session";

/**
 * The narrow surface the reconnect loop needs from the owning session. The
 * session builds this once (lazily, alongside the controller) so the loop can
 * read/advance the resume handle, drive status/streaming, and pipe the resumed
 * stream back through the session's own `connectStream`.
 */
export interface ReconnectHost {
  readonly config: AgentWidgetConfig;
  getResumable(): ResumableHandle | null;
  clearResumable(): void;
  getStatus(): AgentWidgetSessionStatus;
  setStatus(status: AgentWidgetSessionStatus): void;
  setStreaming(streaming: boolean): void;
  setReconnecting(value: boolean): void;
  setAbortController(controller: AbortController | null): void;
  getMessages(): AgentWidgetMessage[];
  notifyMessagesChanged(): void;
  /** Pipe a resumed SSE body through the session, filling the same bubble. */
  resumeConnect(
    body: ReadableStream<Uint8Array>,
    assistantMessageId: string,
    seedContent: string
  ): Promise<void>;
  appendMessage(message: AgentWidgetMessage): void;
  nextSequence(): number;
  emitReconnect(event: {
    phase: "paused" | "resuming" | "resumed";
    handle: ResumableHandle;
    attempt?: number;
  }): void;
  /** Build the give-up bubble content (honors `config.errorMessage`). */
  buildErrorContent(message: string): string;
  onError(error: Error): void;
}

export interface ReconnectController {
  /** Start the backoff loop. The session has already flipped the visible state
   *  (streaming + `resuming` status + `paused` event) synchronously. */
  begin(): void;
  /** Cancel any pending backoff and drop the wake listeners. */
  teardown(): void;
  /** Short-circuit the current backoff sleep (focus/online or manual retry). */
  wake(): void;
}

const DEFAULT_BACKOFF_MS = [1000, 2000, 4000, 8000, 8000];

export function createReconnectController(
  host: ReconnectHost
): ReconnectController {
  // 1-based attempt counter for the active run (0 = not running).
  let attempt = 0;
  let waitResolve: (() => void) | null = null;
  let waitTimer: ReturnType<typeof setTimeout> | null = null;
  let listenersAttached = false;

  const wake = (): void => {
    if (waitTimer) {
      clearTimeout(waitTimer);
      waitTimer = null;
    }
    if (waitResolve) {
      const resolve = waitResolve;
      waitResolve = null;
      resolve();
    }
  };

  const handleWake = (): void => {
    const status = host.getStatus();
    if (status !== "resuming" && status !== "paused") return;
    // On a tab refocus only wake when actually visible; `online` always wakes.
    if (typeof document !== "undefined" && document.visibilityState === "hidden") {
      return;
    }
    wake();
  };

  const attachListeners = (): void => {
    if (listenersAttached) return;
    if (typeof document !== "undefined") {
      document.addEventListener("visibilitychange", handleWake);
    }
    if (typeof window !== "undefined") {
      window.addEventListener("online", handleWake);
    }
    listenersAttached = true;
  };

  const detachListeners = (): void => {
    if (!listenersAttached) return;
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", handleWake);
    }
    if (typeof window !== "undefined") {
      window.removeEventListener("online", handleWake);
    }
    listenersAttached = false;
  };

  const waitBackoff = (ms: number): Promise<void> =>
    new Promise<void>((resolve) => {
      waitResolve = resolve;
      waitTimer = setTimeout(() => {
        waitTimer = null;
        waitResolve = null;
        resolve();
      }, ms);
    });

  /** Give up after exhausting attempts: finalize the bubble and surface error. */
  const finalizeFailure = (): void => {
    const handle = host.getResumable();
    host.clearResumable();
    host.setReconnecting(false);
    attempt = 0;
    detachListeners();
    host.setAbortController(null);

    let changed = false;
    for (const msg of host.getMessages()) {
      if (msg.streaming) {
        msg.streaming = false;
        changed = true;
      }
    }

    const content = host.buildErrorContent(
      "Connection lost and the response could not be resumed."
    );
    if (content) {
      host.appendMessage({
        id: `reconnect-failed-${handle?.executionId ?? host.nextSequence()}`,
        role: "assistant",
        content,
        createdAt: new Date().toISOString(),
        streaming: false,
        sequence: host.nextSequence(),
      });
    } else if (changed) {
      host.notifyMessagesChanged();
    }

    host.setStreaming(false);
    host.setStatus("idle");
    host.onError(new Error("Durable session reconnect failed."));
  };

  const runLoop = async (): Promise<void> => {
    const backoff = host.config.reconnect?.backoffMs ?? DEFAULT_BACKOFF_MS;
    const maxAttempts = host.config.reconnect?.maxAttempts ?? backoff.length;
    const reconnectStream = host.config.reconnectStream;
    if (!reconnectStream) {
      host.setReconnecting(false);
      return;
    }

    while (host.getResumable() && attempt < maxAttempts) {
      attempt += 1;
      // An attempt is in flight. No-op for attempt 1 (the session's synchronous
      // `beginReconnect` already set `resuming`); flips back from `paused` after
      // each backoff wait.
      host.setStatus("resuming");
      const handle = host.getResumable()!;
      const before = handle.lastEventId;
      const controller = new AbortController();
      host.setAbortController(controller);
      host.emitReconnect({ phase: "resuming", handle, attempt });

      let body: ReadableStream<Uint8Array> | null = null;
      try {
        const res = await reconnectStream({
          executionId: handle.executionId,
          after: handle.lastEventId,
          signal: controller.signal,
        });
        if (res && res.ok && res.body) body = res.body;
      } catch {
        body = null;
      }
      if (controller.signal.aborted) return; // torn down (cancel/new turn)

      if (body) {
        // Seed the resume with the text already shown so post-cursor deltas
        // append rather than clobber the bubble.
        const found = host
          .getMessages()
          .find((m) => m.id === handle.assistantMessageId)?.content;
        const seedContent = typeof found === "string" ? found : "";
        try {
          await host.resumeConnect(body, handle.assistantMessageId, seedContent);
        } catch {
          // resumeConnect swallows resume-stream errors while `resuming`;
          // anything escaping here just falls through to backoff/retry.
        }
        if (controller.signal.aborted) return;
        // Reconnect reached a terminal: the idle(terminal)/error handler cleared
        // the handle. We're done.
        if (!host.getResumable()) {
          host.setReconnecting(false);
          attempt = 0;
          detachListeners();
          host.emitReconnect({ phase: "resumed", handle });
          return;
        }
        // Made forward progress before dropping again → reset the attempt
        // budget so a long, flaky run isn't capped by total drops.
        if (host.getResumable()!.lastEventId !== before) attempt = 0;
      }

      if (host.getResumable() && attempt < maxAttempts) {
        // Dropped and waiting to retry: surface `paused` so
        // `statusIndicator.pausedText` renders during the backoff sleep.
        host.setStatus("paused");
        await waitBackoff(
          backoff[Math.min(attempt - 1, backoff.length - 1)] ?? 1000
        );
        if (controller.signal.aborted) return;
      }
    }

    if (host.getResumable()) finalizeFailure();
  };

  return {
    begin(): void {
      attempt = 0;
      attachListeners();
      void runLoop();
    },
    teardown(): void {
      if (waitTimer) {
        clearTimeout(waitTimer);
        waitTimer = null;
      }
      waitResolve = null;
      attempt = 0;
      detachListeners();
    },
    wake,
  };
}
