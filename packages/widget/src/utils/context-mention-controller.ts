import { createPopover, type PopoverHandle } from "../plugin-kit";
import {
  parseMentionTrigger,
  stripMentionQuery,
  type MentionTriggerMatch,
} from "./mention-trigger";
import {
  createMentionMenu,
  type MentionMenuGroup,
  type MentionMenuParts,
} from "../components/context-mention-menu";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
  AgentWidgetMessage,
} from "../types";

export interface ContextMentionControllerOptions {
  mentionConfig: AgentWidgetContextMentionConfig;
  textarea: HTMLTextAreaElement;
  /** Popover anchor — the composer form/pill; the menu opens upward, full-width. */
  anchor: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  getConfig: () => AgentWidgetConfig;
  /** Commit a selection (delegates to the manager); returns false on duplicate/limit. */
  onSelect: (
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ) => boolean;
  announce: (message: string) => void;
  popoverContainer?: HTMLElement | ShadowRoot;
  emit?: (event: string, detail: unknown) => void;
}

const isThenable = (v: unknown): v is Promise<unknown> =>
  !!v && (typeof v === "object" || typeof v === "function") &&
  typeof (v as { then?: unknown }).then === "function";

let listboxSeq = 0;

/**
 * Owns the mention menu lifecycle: `@`-trigger detection, instant open, async-
 * only debounced search with abort, per-group caps, keyboard navigation, and
 * composer-anchored upward positioning. State only — chip/resolve lifecycle is
 * the manager's job (reached via `onSelect`).
 */
export class ContextMentionController {
  private readonly opts: ContextMentionControllerOptions;
  private readonly trigger: string;
  private readonly maxPerGroup: number;
  private readonly debounceMs: number;
  private readonly menu: MentionMenuParts;
  private readonly listboxId: string;

  private popover: PopoverHandle | null = null;
  private isOpenState = false;
  private query = "";
  private triggerMatch: MentionTriggerMatch | null = null;
  private activeIndex = 0;

  private groups: MentionMenuGroup[] = [];
  private flat: {
    source: AgentWidgetContextMentionSource;
    item: AgentWidgetContextMentionItem;
  }[] = [];

  private searchToken = 0;
  private searchAbort: AbortController | null = null;
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly knownAsync = new Set<string>();
  private lastAnnouncedCount = -1;

  constructor(opts: ContextMentionControllerOptions) {
    this.opts = opts;
    this.trigger = opts.mentionConfig.trigger ?? "@";
    this.maxPerGroup = opts.mentionConfig.maxItemsPerGroup ?? 6;
    this.debounceMs = opts.mentionConfig.searchDebounceMs ?? 150;
    this.listboxId = `persona-mention-listbox-${++listboxSeq}`;

    this.menu = opts.mentionConfig.renderMentionMenu
      ? this.createHostMenu()
      : createMentionMenu({
          config: opts.mentionConfig,
          listboxId: this.listboxId,
          onSelectIndex: (i) => this.selectIndex(i),
          onHoverIndex: (i) => this.setActiveIndex(i),
        });

    opts.textarea.setAttribute("aria-haspopup", "listbox");
    opts.textarea.setAttribute("aria-controls", this.listboxId);
    opts.textarea.setAttribute("aria-expanded", "false");
  }

  // The host-render path wraps `renderMentionMenu` output in a positioned shell;
  // positioning, trigger detection, search, and keyboard stay ours. The host
  // owns its own highlight, so `setActiveIndex` just re-renders.
  private createHostMenu(): MentionMenuParts {
    const el = document.createElement("div");
    el.setAttribute("data-persona-mention-menu", "");
    el.setAttribute("role", "listbox");
    el.id = this.listboxId;
    const paint = () => {
      const custom = this.opts.mentionConfig.renderMentionMenu!({
        query: this.query,
        groups: this.groups.map((g) => ({ source: g.source, items: g.items })),
        status: Object.fromEntries(this.groups.map((g) => [g.source.id, g.status])),
        activeIndex: this.activeIndex,
        select: (item) => {
          const group = this.groups.find((g) => g.items.includes(item));
          if (group) this.commit(group.source, item);
        },
        close: () => this.close(),
      });
      el.replaceChildren(custom);
    };
    return {
      el,
      render: paint,
      setActiveIndex: paint,
      destroy: () => el.remove(),
    };
  }

  isOpen(): boolean {
    return this.isOpenState;
  }

  /** Open from the affordance button: insert the trigger at the caret, then parse. */
  openFromButton(): void {
    const ta = this.opts.textarea;
    const caret = ta.selectionStart ?? ta.value.length;
    const before = caret > 0 ? ta.value[caret - 1] : "";
    const needsSpace = before !== "" && !/\s/.test(before);
    const insert = (needsSpace ? " " : "") + this.trigger;
    ta.value = ta.value.slice(0, caret) + insert + ta.value.slice(caret);
    const newCaret = caret + insert.length;
    ta.focus();
    ta.setSelectionRange(newCaret, newCaret);
    this.onInput();
  }

  /** Re-parse the textarea on every input and open/update/close the menu. */
  onInput(): void {
    const ta = this.opts.textarea;
    const caret = ta.selectionStart ?? 0;
    const match = parseMentionTrigger(ta.value, caret, this.trigger);
    if (!match) {
      if (this.isOpenState) this.close();
      return;
    }
    this.triggerMatch = match;
    if (!this.isOpenState) this.open(match.query);
    else this.setQuery(match.query);
  }

  private open(query: string): void {
    this.isOpenState = true;
    this.activeIndex = 0;
    this.lastAnnouncedCount = -1;
    if (!this.popover) {
      this.popover = createPopover({
        anchor: this.opts.anchor,
        content: this.menu.el,
        placement: "top-start",
        matchAnchorWidth: true,
        offset: 6,
        container: this.opts.popoverContainer,
        onDismiss: () => {
          this.isOpenState = false;
          this.opts.textarea.setAttribute("aria-expanded", "false");
        },
      });
    }
    this.popover.open();
    this.opts.textarea.setAttribute("aria-expanded", "true");
    this.opts.emit?.("opened", { trigger: this.trigger });
    this.setQuery(query);
  }

  close(): void {
    if (!this.isOpenState) return;
    this.isOpenState = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.searchAbort?.abort();
    this.popover?.close();
    this.opts.textarea.setAttribute("aria-expanded", "false");
  }

  private setQuery(query: string): void {
    this.query = query;
    const token = ++this.searchToken;
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();

    // Immediate pass: sync sources (and first-time sources) render with zero
    // debounce; sources already known to be async show a loading shimmer.
    for (const source of this.opts.mentionConfig.sources) {
      if (this.knownAsync.has(source.id)) {
        this.setGroupStatus(source.id, "loading");
      } else {
        this.invokeSource(source, token);
      }
    }
    this.render();

    // Debounced pass: re-invoke the known-async (network) sources only.
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      if (token !== this.searchToken) return;
      for (const source of this.opts.mentionConfig.sources) {
        if (this.knownAsync.has(source.id)) this.invokeSource(source, token);
      }
    }, this.debounceMs);
  }

  private invokeSource(
    source: AgentWidgetContextMentionSource,
    token: number
  ): void {
    const ctx = {
      messages: this.opts.getMessages(),
      config: this.opts.getConfig(),
      signal: this.searchAbort!.signal,
    };
    let result:
      | AgentWidgetContextMentionItem[]
      | Promise<AgentWidgetContextMentionItem[]>;
    try {
      result = source.search(this.query, ctx);
    } catch {
      this.setGroupStatus(source.id, "error");
      this.render();
      return;
    }
    if (isThenable(result)) {
      this.knownAsync.add(source.id);
      this.setGroupStatus(source.id, "loading");
      result
        .then((items) => {
          if (token !== this.searchToken) return;
          this.setGroupItems(source.id, items as AgentWidgetContextMentionItem[]);
          this.render();
        })
        .catch(() => {
          if (token !== this.searchToken) return;
          this.setGroupStatus(source.id, "error");
          this.render();
        });
    } else {
      this.setGroupItems(source.id, result);
    }
  }

  private getOrCreateGroup(source: AgentWidgetContextMentionSource): MentionMenuGroup {
    let group = this.groups.find((g) => g.source.id === source.id);
    if (!group) {
      group = { source, items: [], status: "loading", truncated: false };
      // Preserve source declaration order.
      const order = this.opts.mentionConfig.sources;
      this.groups.push(group);
      this.groups.sort(
        (a, b) =>
          order.findIndex((s) => s.id === a.source.id) -
          order.findIndex((s) => s.id === b.source.id)
      );
    }
    return group;
  }

  private setGroupStatus(sourceId: string, status: MentionMenuGroup["status"]): void {
    const source = this.opts.mentionConfig.sources.find((s) => s.id === sourceId);
    if (!source) return;
    this.getOrCreateGroup(source).status = status;
  }

  private setGroupItems(
    sourceId: string,
    items: AgentWidgetContextMentionItem[]
  ): void {
    const source = this.opts.mentionConfig.sources.find((s) => s.id === sourceId);
    if (!source) return;
    const group = this.getOrCreateGroup(source);
    group.truncated = items.length > this.maxPerGroup;
    group.items = items.slice(0, this.maxPerGroup);
    group.status = group.items.length === 0 ? "empty" : "ready";
  }

  private rebuildFlat(): void {
    this.flat = [];
    for (const group of this.groups) {
      if (group.status === "ready") {
        for (const item of group.items) this.flat.push({ source: group.source, item });
      }
    }
    if (this.activeIndex >= this.flat.length) {
      this.activeIndex = Math.max(0, this.flat.length - 1);
    }
  }

  private viewModel() {
    return {
      query: this.query,
      groups: this.groups,
      flat: this.flat,
      activeIndex: this.activeIndex,
    };
  }

  private render(): void {
    this.rebuildFlat();
    this.menu.render(this.viewModel());
    this.popover?.reposition();
    if (this.flat.length !== this.lastAnnouncedCount) {
      this.lastAnnouncedCount = this.flat.length;
      this.opts.announce(
        this.flat.length === 1 ? "1 result" : `${this.flat.length} results`
      );
      this.opts.emit?.("searched", { query: this.query, results: this.flat.length });
    }
  }

  private setActiveIndex(index: number): void {
    if (index < 0 || index >= this.flat.length) return;
    this.activeIndex = index;
    this.menu.setActiveIndex(index);
  }

  /** Returns true when the key was consumed (caller must not also handle it). */
  handleKeydown(event: KeyboardEvent): boolean {
    if (!this.isOpenState) return false;

    switch (event.key) {
      case "ArrowDown": {
        if (this.flat.length === 0) return true;
        event.preventDefault();
        this.setActiveIndex((this.activeIndex + 1) % this.flat.length);
        return true;
      }
      case "ArrowUp": {
        if (this.flat.length === 0) return true;
        event.preventDefault();
        this.setActiveIndex(
          (this.activeIndex - 1 + this.flat.length) % this.flat.length
        );
        return true;
      }
      case "Enter":
      case "Tab": {
        if (this.flat.length === 0) {
          // Nothing to pick — close and let Enter submit / Tab move on.
          this.close();
          return false;
        }
        event.preventDefault();
        this.selectIndex(this.activeIndex);
        return true;
      }
      case "Escape": {
        // Keep the literal trigger char in the textarea.
        event.preventDefault();
        this.close();
        return true;
      }
      case "Backspace": {
        // Deleting back through the trigger closes the menu; let the keystroke
        // proceed so the trigger char itself is removed.
        if (this.query.length === 0) this.close();
        return false;
      }
      default:
        return false;
    }
  }

  private selectIndex(index: number): void {
    const entry = this.flat[index];
    if (!entry) return;
    this.commit(entry.source, entry.item);
  }

  private commit(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): void {
    const ok = this.opts.onSelect(source, item);
    if (ok) {
      this.stripQuery();
      this.opts.emit?.("selected", {
        sourceId: source.id,
        itemId: item.id,
        label: item.label,
      });
    }
    this.close();
    this.opts.textarea.focus();
  }

  private stripQuery(): void {
    if (!this.triggerMatch) return;
    const ta = this.opts.textarea;
    const caret = ta.selectionStart ?? ta.value.length;
    const out = stripMentionQuery(ta.value, this.triggerMatch, caret);
    ta.value = out.value;
    ta.setSelectionRange(out.caret, out.caret);
    // Auto-resize listener reacts to input; our re-parse yields null → stays closed.
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    this.triggerMatch = null;
  }

  destroy(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.searchAbort?.abort();
    this.popover?.destroy();
    this.menu.destroy();
    this.opts.textarea.removeAttribute("aria-haspopup");
    this.opts.textarea.removeAttribute("aria-controls");
    this.opts.textarea.removeAttribute("aria-expanded");
  }
}
