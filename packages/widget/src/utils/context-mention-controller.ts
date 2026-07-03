import { createPopover, type PopoverHandle } from "../plugin-kit";
import {
  parseAnyTrigger,
  stripMentionQuery,
  type MentionTriggerMatch,
  type MentionTriggerPosition,
} from "./mention-trigger";
import {
  createMentionMenu,
  type MentionMenuGroup,
  type MentionMenuParts,
} from "../components/context-mention-menu";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionComposerCapability,
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
  /**
   * Commit a MENTION or SERVER-command selection (delegates to the manager);
   * returns false on duplicate/limit. `args` is the text after a command name
   * (empty for ordinary mentions). Prompt/action commands never reach here —
   * the controller dispatches them directly.
   */
  onSelect: (
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args: string
  ) => boolean;
  /**
   * Composer capability for `command:"prompt"` (insert text / submit) and
   * `command:"action"` handlers. Absent on paths without a wired composer;
   * command dispatch degrades to a no-op then.
   */
  composer?: AgentWidgetContextMentionComposerCapability;
  announce: (message: string) => void;
  popoverContainer?: HTMLElement | ShadowRoot;
  emit?: (event: string, detail: unknown) => void;
}

/** A trigger channel normalized from the config (primary `@` + extras). */
type NormalizedChannel = {
  trigger: string;
  position: MentionTriggerPosition;
  allowSpaces: boolean;
  sources: AgentWidgetContextMentionSource[];
  searchPlaceholder?: string;
};

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
  /** Primary `@` channel + any extra `triggers` channels; one drives the menu. */
  private readonly channels: NormalizedChannel[];
  /** The channel whose trigger is currently open. */
  private activeChannel: NormalizedChannel;
  private readonly maxPerGroup: number;
  private readonly debounceMs: number;
  private readonly menu: MentionMenuParts;
  private readonly listboxId: string;

  private popover: PopoverHandle | null = null;
  private isOpenState = false;
  private query = "";
  private triggerMatch: MentionTriggerMatch | null = null;
  private activeIndex = 0;
  // True while the menu was opened from the affordance button as a picker: no
  // trigger char is in the textarea, so the in-menu search field owns the query
  // and there is nothing to strip on close.
  private pickerMode = false;

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
    const cfg = opts.mentionConfig;
    // Normalize the legacy single-trigger config into channel 0, then append
    // any extra `triggers` channels. The engine drives them all from one menu.
    const primary: NormalizedChannel = {
      trigger: cfg.trigger ?? "@",
      position: cfg.triggerPosition ?? "anywhere",
      allowSpaces: false,
      sources: cfg.sources ?? [],
      searchPlaceholder: cfg.searchPlaceholder,
    };
    const extra: NormalizedChannel[] = (cfg.triggers ?? []).map((ch) => ({
      trigger: ch.trigger,
      position: ch.triggerPosition ?? "anywhere",
      allowSpaces: ch.allowSpaces ?? false,
      sources: ch.sources ?? [],
      searchPlaceholder: ch.searchPlaceholder,
    }));
    // Drop empty channels (e.g. the default `@` channel when only `/` has sources).
    const nonEmpty = [primary, ...extra].filter((c) => c.sources.length > 0);
    this.channels = nonEmpty.length > 0 ? nonEmpty : [primary];
    this.activeChannel = this.channels[0];
    this.maxPerGroup = cfg.maxItemsPerGroup ?? 6;
    this.debounceMs = cfg.searchDebounceMs ?? 150;
    this.listboxId = `persona-mention-listbox-${++listboxSeq}`;

    this.menu = opts.mentionConfig.renderMentionMenu
      ? this.createHostMenu()
      : createMentionMenu({
          config: opts.mentionConfig,
          listboxId: this.listboxId,
          onSelectIndex: (i) => this.selectIndex(i),
          onHoverIndex: (i) => this.setActiveIndex(i),
          // Picker mode: the in-menu search field is the query source and drives
          // keyboard nav, since focus lives in it (not the textarea).
          onSearchInput: (value) => this.setQuery(value),
          onSearchKeydown: (event) => {
            this.handleKeydown(event);
          },
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

  /**
   * Open from the affordance button as a picker (Cursor/Copilot style): open the
   * menu WITHOUT inserting a trigger char into the textarea, and reveal + focus
   * an in-menu search field that owns the query. Because no char is inserted,
   * `triggerMatch` stays null, so `stripQuery()` is a no-op and dismissing the
   * menu leaves the composer text untouched — no stray `@` left behind.
   *
   * When the menu is host-rendered (`renderMentionMenu`), there is no built-in
   * search field; the picker opens in browse-and-click mode with keyboard nav
   * driven from the textarea, and the host owns any filtering UI.
   */
  openFromButton(trigger?: string): void {
    const channel =
      (trigger && this.channels.find((c) => c.trigger === trigger)) ||
      this.channels[0];
    this.pickerMode = true;
    this.triggerMatch = null;
    if (!this.isOpenState) {
      this.open("", channel);
    } else {
      this.switchChannel(channel);
      this.setQuery("");
    }
    if (this.menu.showSearch) this.menu.showSearch("", channel.searchPlaceholder);
    else this.opts.textarea.focus();
  }

  /** Re-parse the textarea on every input and open/update/close the menu. */
  onInput(): void {
    const ta = this.opts.textarea;
    const caret = ta.selectionStart ?? 0;
    const hit = parseAnyTrigger(ta.value, caret, this.channels);
    if (!hit) {
      if (this.isOpenState) this.close();
      return;
    }
    this.triggerMatch = hit.match;
    if (!this.isOpenState) {
      this.open(hit.match.query, hit.channel);
    } else {
      this.switchChannel(hit.channel);
      this.setQuery(hit.match.query);
    }
  }

  /** Switch the active channel while open, resetting stale groups from the old one. */
  private switchChannel(channel: NormalizedChannel): void {
    if (channel === this.activeChannel) return;
    this.activeChannel = channel;
    this.groups = [];
    this.activeIndex = 0;
  }

  private open(query: string, channel: NormalizedChannel): void {
    this.isOpenState = true;
    this.activeChannel = channel;
    this.groups = [];
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
          if (this.pickerMode) {
            this.pickerMode = false;
            this.menu.hideSearch?.();
          }
        },
      });
    }
    this.popover.open();
    this.opts.textarea.setAttribute("aria-expanded", "true");
    this.opts.emit?.("opened", { trigger: channel.trigger });
    this.setQuery(query);
  }

  close(): void {
    if (!this.isOpenState) return;
    this.isOpenState = false;
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.searchAbort?.abort();
    this.popover?.close();
    this.opts.textarea.setAttribute("aria-expanded", "false");
    if (this.pickerMode) {
      // Picker teardown: hide the search field and hand focus back to the
      // composer so the user can keep typing their message.
      this.pickerMode = false;
      this.menu.hideSearch?.();
      this.opts.textarea.focus();
    }
  }

  private setQuery(query: string): void {
    this.query = query;
    const token = ++this.searchToken;
    this.searchAbort?.abort();
    this.searchAbort = new AbortController();

    // Immediate pass: sync sources (and first-time sources) render with zero
    // debounce; sources already known to be async show a loading shimmer.
    for (const source of this.activeChannel.sources) {
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
      for (const source of this.activeChannel.sources) {
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
      // Preserve source declaration order within the active channel.
      const order = this.activeChannel.sources;
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
    const source = this.activeChannel.sources.find((s) => s.id === sourceId);
    if (!source) return;
    this.getOrCreateGroup(source).status = status;
  }

  private setGroupItems(
    sourceId: string,
    items: AgentWidgetContextMentionItem[]
  ): void {
    const source = this.activeChannel.sources.find((s) => s.id === sourceId);
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

  /**
   * Args = the query text after the command name (first token). `"deploy staging"`
   * → `"staging"`; `"deploy"` → `""`. The commands source matches on the first
   * token, so the item stays selectable while the user types args.
   */
  private deriveArgs(query: string): string {
    const trimmed = query.replace(/^\s+/, "");
    const sp = trimmed.search(/\s/);
    return sp === -1 ? "" : trimmed.slice(sp + 1).trim();
  }

  private commit(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): void {
    const kind = item.command;

    // (a) client-action: run and short-circuit. No chip, no send.
    if (kind === "action") {
      const args = this.deriveArgs(this.query);
      this.stripQuery();
      this.close();
      this.runAction(item, args);
      this.opts.emit?.("command", {
        sourceId: source.id,
        itemId: item.id,
        kind: "action",
        args,
      });
      this.opts.textarea.focus();
      return;
    }

    // (b) prompt-macro: write resolved text into the composer, optional submit.
    if (kind === "prompt") {
      const args = this.deriveArgs(this.query);
      const target = this.captureStripTarget();
      this.close();
      void this.runPromptMacro(source, item, args, target);
      this.opts.emit?.("command", {
        sourceId: source.id,
        itemId: item.id,
        kind: "prompt",
        args,
      });
      return;
    }

    // Mentions + server commands: go through the manager (chip + submit
    // resolve). `args` is captured now so a server command's resolve can read it.
    const args = kind === "server" ? this.deriveArgs(this.query) : "";
    const ok = this.opts.onSelect(source, item, args);
    if (ok) {
      this.stripQuery();
      this.opts.emit?.(kind === "server" ? "command" : "selected", {
        sourceId: source.id,
        itemId: item.id,
        label: item.label,
        ...(kind === "server" ? { kind: "server", args } : {}),
      });
    }
    this.close();
    this.opts.textarea.focus();
  }

  /** Run a `command:"action"` handler, guarding against a missing composer/throws. */
  private runAction(item: AgentWidgetContextMentionItem, args: string): void {
    const composer = this.opts.composer;
    if (!item.action || !composer) return;
    try {
      void Promise.resolve(
        item.action({
          args,
          config: this.opts.getConfig(),
          messages: this.opts.getMessages(),
          composer,
        })
      ).catch((error) => {
        if (typeof console !== "undefined") {
          console.warn("[Persona] context-mention command action failed", error);
        }
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[Persona] context-mention command action failed", error);
      }
    }
  }

  /** Capture the pre-token / post-caret composer slices for insert-at-caret. */
  private captureStripTarget(): { before: string; after: string } | null {
    if (!this.triggerMatch) return null;
    const ta = this.opts.textarea;
    const caret = ta.selectionStart ?? ta.value.length;
    return {
      before: ta.value.slice(0, this.triggerMatch.triggerIndex),
      after: ta.value.slice(caret),
    };
  }

  /** Resolve a `command:"prompt"` macro and write its text into the composer. */
  private async runPromptMacro(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args: string,
    target: { before: string; after: string } | null
  ): Promise<void> {
    const composer = this.opts.composer;
    if (!composer) return;
    let payload;
    try {
      payload = await source.resolve(item, {
        messages: this.opts.getMessages(),
        config: this.opts.getConfig(),
        composerText: composer.getValue(),
        args,
        signal: new AbortController().signal,
      });
    } catch (error) {
      if (typeof console !== "undefined") {
        console.warn("[Persona] context-mention prompt resolve failed", error);
      }
      return;
    }
    const text = payload.insertText ?? payload.llmAppend ?? "";
    if (item.insertMode === "insert-at-caret" && target) {
      composer.setValue(target.before + text + target.after);
    } else {
      composer.setValue(text);
    }
    if (item.submitOnSelect) composer.submit();
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
