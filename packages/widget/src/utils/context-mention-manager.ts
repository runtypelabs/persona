import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionRef,
  AgentWidgetContextMentionSource,
  AgentWidgetContextMentionPayload,
  AgentWidgetMessage,
  ContentPart,
} from "../types";
import { createMentionChip, type MentionChipParts } from "../components/context-mention-chip";

interface PendingMention {
  key: string;
  source: AgentWidgetContextMentionSource;
  item: AgentWidgetContextMentionItem;
  ref: AgentWidgetContextMentionRef;
  status: "resolving" | "ready" | "error";
  payload?: AgentWidgetContextMentionPayload;
  abort?: AbortController;
  /** The in-flight select-time resolve (absent for `resolveOn:"submit"`). Awaited
   *  at submit so `finalize()` reuses it instead of firing a duplicate fetch. */
  resolvePromise?: Promise<void>;
  /** Chip DOM — chip mode only. Inline mode tracks by `ComposerMentionId` key with
   *  no chip (the token lives in the composer prose). */
  chip?: MentionChipParts;
  /** INLINE mode only. Reflect this mention's resolve status onto its live token
   *  element (the composer capability's `setMentionStatus`, closed over its id).
   *  Chip mode leaves this undefined — the chip carries the status instead. */
  reportStatus?: (status: "pending" | "resolved" | "error") => void;
  /** Command args captured at add time (empty for ordinary mentions). */
  args: string;
}

/**
 * The stored ref for a selected item — identical shape at every call site
 * (`add`, `track`, and the controller's inline commit), so it lives here once.
 */
export function refFromItem(
  source: AgentWidgetContextMentionSource,
  item: AgentWidgetContextMentionItem
): AgentWidgetContextMentionRef {
  return {
    sourceId: source.id,
    itemId: item.id,
    label: item.label,
    iconName: item.iconName,
    color: item.color,
  };
}

/** The resolved bundle gathered at submit, merged into the user message. */
export interface MentionSubmitBundle {
  /** Per-mention LLM text, mentions-first; the caller formats the block + prose. */
  llmEntries: { label: string; text: string }[];
  contentParts: ContentPart[];
  /** Namespaced `{ [sourceId]: { [itemId]: context } }` for the opt-in path. */
  context: Record<string, Record<string, unknown>>;
}

export interface ContextMentionManagerOptions {
  mentionConfig: AgentWidgetContextMentionConfig;
  /** The composer context row chips render into (created by the core orchestrator). */
  contextRow: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  getConfig: () => AgentWidgetConfig;
  /** Plain-text composer value, captured at resolve/submit time. */
  getComposerText: () => string;
  /** Polite live-region announcer. */
  announce: (message: string) => void;
  /**
   * Assertive live-region announcer for failures (resolve errors). Falls back to
   * the polite `announce` when the host wires only one region.
   */
  announceError?: (message: string) => void;
  /** Emit a `persona:mention:<event>` analytics DOM event. */
  emit?: (event: string, detail: unknown) => void;
}

const mentionKey = (sourceId: string, itemId: string) => `${sourceId}\u0000${itemId}`;

/**
 * Owns the set of pending mentions: pill chip DOM, eager resolve-on-select with
 * caching + abort, duplicate/limit checks, and the submit-time gather (resolving
 * any `resolveOn:"submit"` sources, dropping failures). No menu/search logic —
 * that's the controller's job.
 */
export class ContextMentionManager {
  private readonly opts: ContextMentionManagerOptions;
  private readonly mentions: PendingMention[] = [];

  constructor(opts: ContextMentionManagerOptions) {
    this.opts = opts;
    this.updateRowVisibility();
  }

  private get maxMentions(): number {
    return this.opts.mentionConfig.maxMentions ?? 8;
  }

  hasMentions(): boolean {
    return this.mentions.length > 0;
  }

  /**
   * Add a selected item. Returns false (and fires `onMentionRejected`) on
   * duplicate/limit. `args` (for server commands) is captured now and threaded
   * into `resolve()`'s context, since the typed token is gone by submit time.
   */
  add(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args = ""
  ): boolean {
    const key = mentionKey(source.id, item.id);
    if (this.mentions.some((m) => m.key === key)) {
      return this.reject(source, item, "duplicate");
    }
    if (this.atLimit()) return this.reject(source, item, "limit");

    const ref = refFromItem(source, item);
    const pending: PendingMention = {
      key,
      source,
      item,
      ref,
      status: "resolving",
      args,
    };
    pending.chip = createMentionChip({
      ref,
      config: this.opts.mentionConfig,
      onRemove: () => this.remove(key),
    });
    this.opts.contextRow.appendChild(pending.chip.el);
    this.updateRowVisibility();
    this.startPending(pending);
    return true;
  }

  /** True when the mention limit is already reached (inline pre-insert gate). */
  atLimit(): boolean {
    return this.mentions.length >= this.maxMentions;
  }

  /**
   * INLINE pre-insert gate: enforce the SAME duplicate/limit policy as `add()`
   * (firing `onMentionRejected` + the `rejected` event) before the controller
   * inserts an atomic token, so a rejected pick never leaves a stray token.
   * Duplicates match on the ref (source + item) rather than the pending key —
   * inline entries are keyed by `ComposerMentionId` — because a repeated pick of
   * the same item would double-emit its payload at `finalize()` (chip parity).
   * Returns true when the mention may be inserted.
   */
  admit(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): boolean {
    const dup = this.mentions.some(
      (m) => m.ref.sourceId === source.id && m.ref.itemId === item.id
    );
    if (dup) return this.reject(source, item, "duplicate");
    if (this.atLimit()) return this.reject(source, item, "limit");
    return true;
  }

  /**
   * INLINE mode: track a mention whose atomic token was already inserted into the
   * composer by the contenteditable adapter, keyed by its `ComposerMentionId`. No
   * chip; duplicate/limit were gated by `admit()` before insertion. `reportStatus`
   * reflects resolve state onto the live token element. Starts resolve-on-select
   * just like `add()`.
   */
  track(
    id: string,
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args = "",
    reportStatus?: (status: "pending" | "resolved" | "error") => void
  ): void {
    const pending: PendingMention = {
      key: id,
      source,
      item,
      ref: refFromItem(source, item),
      status: "resolving",
      args,
      reportStatus,
    };
    this.startPending(pending);
  }

  /** Fire the rejection hooks for a blocked mention and return false (add's sentinel). */
  private reject(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    reason: "duplicate" | "limit"
  ): false {
    this.opts.mentionConfig.onMentionRejected?.(item, reason);
    this.opts.emit?.("rejected", { sourceId: source.id, itemId: item.id, reason });
    return false;
  }

  /**
   * Push a fully-built pending mention and kick off its resolve (shared by
   * `add()` and `track()`): `resolveOn:"submit"` flips straight to ready; anything
   * else starts the select-time resolve, keeping the promise so `finalize()`
   * awaits this exact resolve rather than firing a second one.
   */
  private startPending(pending: PendingMention): void {
    this.mentions.push(pending);
    if (pending.source.resolveOn === "submit") {
      pending.status = "ready";
      pending.chip?.setStatus("ready");
      pending.reportStatus?.("resolved");
    } else {
      pending.resolvePromise = this.resolvePending(pending);
    }
    this.opts.announce(`Added ${pending.ref.label} to context`);
  }

  private buildResolveContext(
    signal: AbortSignal,
    args: string,
    composerText = this.opts.getComposerText()
  ) {
    return {
      messages: this.opts.getMessages(),
      config: this.opts.getConfig(),
      composerText,
      args,
      signal,
    };
  }

  private async resolvePending(pending: PendingMention): Promise<void> {
    const abort = new AbortController();
    pending.abort = abort;
    try {
      const payload = await pending.source.resolve(
        pending.item,
        this.buildResolveContext(abort.signal, pending.args)
      );
      if (abort.signal.aborted) return;
      pending.payload = payload;
      pending.status = "ready";
      pending.chip?.setStatus("ready", payload);
      pending.reportStatus?.("resolved");
    } catch (error) {
      if (abort.signal.aborted) return;
      pending.status = "error";
      pending.chip?.setStatus("error");
      // Inline tokens carry no chip: surface the failure on the token element so a
      // dropped context is visible (finalize() silently skips failed payloads).
      pending.reportStatus?.("error");
      // Speak the failure through the ASSERTIVE region — the visual error state
      // (chip/token color) is otherwise silent for screen-reader users.
      (this.opts.announceError ?? this.opts.announce)(
        `Couldn't attach ${pending.ref.label} to context`
      );
      this.opts.mentionConfig.onMentionResolveError?.(pending.item, error);
      this.opts.emit?.("resolve-error", {
        sourceId: pending.source.id,
        itemId: pending.item.id,
      });
    }
  }

  remove(key: string): void {
    const index = this.mentions.findIndex((m) => m.key === key);
    if (index === -1) return;
    const [pending] = this.mentions.splice(index, 1);
    pending.abort?.abort();
    pending.chip?.el.remove();
    this.updateRowVisibility();
    this.opts.announce(`Removed ${pending.ref.label} from context`);
  }

  /** Remove the most recently added chip (Backspace on an empty composer). */
  removeLast(): boolean {
    const last = this.mentions[this.mentions.length - 1];
    if (!last) return false;
    this.remove(last.key);
    return true;
  }

  clear(): void {
    for (const m of this.mentions) {
      m.abort?.abort();
      m.chip?.el.remove();
    }
    this.mentions.length = 0;
    this.updateRowVisibility();
  }

  /**
   * Gather everything needed at submit. Returns refs synchronously (for the
   * echoed bubble) plus an async `finalize()` that resolves the mentions and
   * returns the merged bundle, dropping failures.
   *
   * Ownership transfer: the pending mentions are DETACHED from the manager here
   * (removed from the list, chip DOM cleared) WITHOUT aborting their in-flight
   * select-time resolves. So the post-submit `clear()` the UI calls is a no-op
   * that can't abort them, and `finalize()` awaits each existing resolve instead
   * of firing a duplicate fetch. `composerText` is captured now for submit-time
   * sources, since the composer is cleared right after.
   */
  collectForSubmit(): { refs: AgentWidgetContextMentionRef[]; finalize: () => Promise<MentionSubmitBundle> } {
    const snapshot = [...this.mentions];
    const refs = snapshot.map((m) => m.ref);
    const composerText = this.opts.getComposerText();

    // Detach: empty the composer chip row without aborting resolves.
    for (const m of snapshot) m.chip?.el.remove();
    this.mentions.length = 0;
    this.updateRowVisibility();

    const finalize = async (): Promise<MentionSubmitBundle> => {
      // Resolve every mention concurrently: submit-deferred sources resolve now;
      // select-time sources reuse their in-flight promise (never re-fetched).
      const payloads = await Promise.all(
        snapshot.map(async (m): Promise<AgentWidgetContextMentionPayload | null> => {
          try {
            if (m.source.resolveOn === "submit") {
              return await m.source.resolve(
                m.item,
                this.buildResolveContext(new AbortController().signal, m.args, composerText)
              );
            }
            if (m.resolvePromise) await m.resolvePromise;
            return m.payload ?? null; // null → select-resolve already failed/dropped
          } catch (error) {
            this.opts.mentionConfig.onMentionResolveError?.(m.item, error);
            this.opts.emit?.("resolve-error", {
              sourceId: m.source.id,
              itemId: m.item.id,
            });
            return null; // drop and still send
          }
        })
      );

      const llmEntries: { label: string; text: string }[] = [];
      const contentParts: ContentPart[] = [];
      const context: Record<string, Record<string, unknown>> = {};
      // Assemble in original selection order (mentions-first block).
      for (let i = 0; i < snapshot.length; i++) {
        const m = snapshot[i];
        const payload = payloads[i];
        if (!payload) continue;
        if (payload.llmAppend && payload.llmAppend.trim()) {
          llmEntries.push({ label: m.ref.label, text: payload.llmAppend });
        }
        if (payload.contentParts?.length) {
          contentParts.push(...payload.contentParts);
        }
        if (payload.context) {
          (context[m.source.id] ??= {})[m.item.id] = payload.context;
        }
      }

      return { llmEntries, contentParts, context };
    };

    return { refs, finalize };
  }

  private updateRowVisibility(): void {
    this.opts.contextRow.style.display = this.mentions.length > 0 ? "flex" : "none";
  }
}
