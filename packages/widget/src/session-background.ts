import type {
  AgentWidgetMessage,
  AgentWidgetStreamCheckpoint,
  BackgroundConversationAdapter,
  ConversationExecutionState,
  PersonaArtifactRecord,
  ResumableHandle,
} from "./types";

export type BackgroundCheckpoint = {
  conversationId: string;
  handle: ResumableHandle;
  messages: AgentWidgetMessage[];
  artifacts: PersonaArtifactRecord[];
  selectedArtifactId: string | null;
  streamCheckpoint?: AgentWidgetStreamCheckpoint;
  observedStatus?: ConversationExecutionState["status"];
};

// Clone mutable transcript data without rejecting host-provided component props.
function copy<T>(value: T, seen = new WeakMap<object, unknown>()): T {
  if (!value || typeof value !== "object") return value;
  if (seen.has(value)) return seen.get(value) as T;
  if (Array.isArray(value)) {
    const result: unknown[] = [];
    seen.set(value, result);
    value.forEach((item) => result.push(copy(item, seen)));
    return result as T;
  }
  if (Object.getPrototypeOf(value) !== Object.prototype) return value;
  const result: Record<string, unknown> = {};
  seen.set(value, result);
  for (const [key, item] of Object.entries(value)) result[key] = copy(item, seen);
  return result as T;
}

/** Loaded with reconnect; ordinary embeds pay no checkpoint/store runtime cost. */
export class BackgroundConversationController {
  private checkpoints = new Map<string, BackgroundCheckpoint>();
  private watches = new Map<string, { executionId: string; unsubscribe?: () => void }>();

  constructor(
    private adapter: BackgroundConversationAdapter,
    private emit: (state: ConversationExecutionState) => void,
  ) {}

  observe(conversationId: string, executionId: string, status: ConversationExecutionState["status"], detached = false): void {
    this.emit({ conversationId, executionId, status, detached });
  }

  save(checkpoint: BackgroundCheckpoint): void {
    this.clear(checkpoint.conversationId);
    this.checkpoints.set(checkpoint.conversationId, copy({ ...checkpoint, observedStatus: "running" }));
    const { conversationId, handle: { executionId } } = checkpoint;
    this.observe(conversationId, executionId, "running", true);
    const watch: { executionId: string; unsubscribe?: () => void } = { executionId };
    this.watches.set(conversationId, watch);
    // A subscription is optional. Never synthesize completion from a timer or
    // from locally closing the transport. An adapter throwing cannot undo an
    // already committed navigation; recovery remains possible without status.
    try {
      const unsubscribe = this.adapter.subscribeStatus?.({ conversationId, executionId }, (status) => {
        if (this.watches.get(conversationId) !== watch || !["running", "needs-attention", "completed", "failed"].includes(status)) return;
        const saved = this.checkpoints.get(conversationId);
        if (saved) saved.observedStatus = status;
        this.observe(conversationId, executionId, status, true);
        if (status === "completed" || status === "failed") {
          this.watches.delete(conversationId);
          try { watch.unsubscribe?.(); } catch { /* Status teardown is best effort. */ }
        }
      });
      watch.unsubscribe = unsubscribe;
      if (this.watches.get(conversationId) !== watch) { try { unsubscribe?.(); } catch { /* Already terminal. */ } }
    } catch { this.watches.delete(conversationId); }
  }

  take(conversationId: string): BackgroundCheckpoint | undefined {
    const checkpoint = this.checkpoints.get(conversationId);
    this.clear(conversationId);
    return checkpoint;
  }

  clear(conversationId?: string): void {
    for (const [id, watch] of this.watches) {
      if (conversationId !== undefined && conversationId !== id) continue;
      this.watches.delete(id);
      try { watch.unsubscribe?.(); } catch { /* Status teardown is best effort. */ }
    }
    if (conversationId === undefined) this.checkpoints.clear();
    else this.checkpoints.delete(conversationId);
  }
}
