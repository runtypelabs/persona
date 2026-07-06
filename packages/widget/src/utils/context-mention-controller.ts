import { createPopover, injectStyles, type PopoverHandle } from "../plugin-kit";
import { MENTION_MENU_CSS } from "../styles/context-mention-menu-css";
import {
  parseAnyTrigger,
  stripMentionQuery,
  type MentionTriggerMatch,
} from "./mention-trigger";
import {
  normalizeMentionChannels,
  type NormalizedMentionChannel,
} from "./mention-channels";
import { splitCommandQuery } from "./mention-matcher";
import {
  createMentionMenu,
  type MentionMenuGroup,
  type MentionMenuParts,
} from "../components/context-mention-menu";
import { refFromItem, type MentionSubmitBundle } from "./context-mention-manager";
import type { ComposerInputCapability } from "./composer-input";
import type { ComposerMentionId } from "./composer-document";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionRef,
  AgentWidgetContextMentionSource,
  AgentWidgetMessage,
} from "../types";

/**
 * Outcome of dispatching an inline slash command at submit (Slack-style). The UI
 * acts on the kind: an `"action"` already ran and nothing is sent; a `"prompt"`
 * replaces the outgoing text with `sendText`; a `"server"` sends the typed text
 * and attaches `mentions` context (refs empty — no chip).
 */
export type InlineCommandResult =
  | { kind: "action" }
  | { kind: "prompt"; sendText: string }
  | {
      kind: "server";
      mentions: {
        refs: AgentWidgetContextMentionRef[];
        finalize: () => Promise<MentionSubmitBundle>;
      };
    };

export interface ContextMentionControllerOptions {
  mentionConfig: AgentWidgetContextMentionConfig;
  /**
   * The composer input surface (chip: textarea adapter; inline: contenteditable
   * adapter). The controller drives all text/selection/document ops through this
   * one capability — it also serves as the `command:"prompt"`/`"action"` composer
   * (the superset includes `getValue`/`setValue`/`submit`).
   */
  composerInput: ComposerInputCapability;
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
   * INLINE display only. Track a mention whose atomic token was just inserted
   * into the composer, keyed by the composer-generated `ComposerMentionId`.
   * Chip mode leaves this undefined and commits through `onSelect` (chip row).
   */
  onInsertMention?: (
    id: ComposerMentionId,
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args: string
  ) => void;
  /**
   * INLINE display only. Admission gate run BEFORE a token is inserted: returns
   * false (and fires the manager's rejection hooks) when the pick hits the mention
   * limit, so a rejected pick never leaves a stray token. Owns the same
   * limit/rejection policy as chip mode's `onSelect` path.
   */
  admitMention?: (
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
  /** Primary `@` channel + any extra `triggers` channels; one drives the menu. */
  private readonly channels: NormalizedMentionChannel[];
  /** The channel whose trigger is currently open. */
  private activeChannel: NormalizedMentionChannel;
  private readonly maxPerGroup: number;
  private readonly debounceMs: number;
  private readonly menu: MentionMenuParts;
  private readonly listboxId: string;

  private popover: PopoverHandle | null = null;
  // Watches the composer box while the menu is open: an auto-grow line-wrap moves
  // the `@` glyph (x changes) and shifts the composer's edges (the upward menu's
  // top changes), so on each resize we re-measure the trigger anchor and
  // reposition. Connected on open, disconnected on close/destroy (never leaks).
  private resizeObserver: ResizeObserver | null = null;
  private isOpenState = false;
  private query = "";
  private triggerMatch: MentionTriggerMatch | null = null;
  private activeIndex = 0;
  /** Identity (`sourceId, itemId`) of the highlighted row, so the highlight
   *  follows the same item when async results reorder the flat list. */
  private activeKey: string | null = null;
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

  // Trigger-anchored menu positioning (inline mode). `triggerAnchorOffset` is the
  // horizontal distance from the composer's left edge to the `@` trigger glyph,
  // measured ONCE per trigger session (see `updateTriggerAnchor`). It is a delta
  // from the anchor, so it survives scroll/pan; the popover adds it to the live
  // anchor rect each reposition instead of re-measuring per keystroke.
  private triggerAnchorOffset: number | null = null;
  private measuredTriggerIndex: number | null = null;

  constructor(opts: ContextMentionControllerOptions) {
    this.opts = opts;
    const cfg = opts.mentionConfig;
    // One shared normalizer (primary `@` channel + any extra `triggers`); the
    // engine drives them all from one menu. Drop empty channels (e.g. the default
    // `@` channel when only `/` has sources); fall back to the primary if the
    // config somehow declared none (the orchestrator gates this case upstream).
    const all = normalizeMentionChannels(cfg);
    const nonEmpty = all.filter((c) => c.sources.length > 0);
    this.channels = nonEmpty.length > 0 ? nonEmpty : [all[0]];
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
          // Hover highlights without scrolling (keyboard scrolls; a moving cursor
          // shouldn't yank the list).
          onHoverIndex: (i) => this.setActiveIndex(i, false),
          onRetry: (sourceId) => this.retrySource(sourceId),
          // Picker mode: the in-menu search field is the query source and drives
          // keyboard nav, since focus lives in it (not the textarea).
          onSearchInput: (value) => this.setQuery(value),
          onSearchKeydown: (event) => {
            this.handleKeydown(event);
          },
        });

    const el = opts.composerInput.element;
    el.setAttribute("aria-haspopup", "listbox");
    el.setAttribute("aria-controls", this.listboxId);
    el.setAttribute("aria-expanded", "false");
  }

  /** The composer input surface — all text/selection ops route through this. */
  private get input(): ComposerInputCapability {
    return this.opts.composerInput;
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

    // If a live trigger token for THIS channel already sits at the caret (the
    // user typed `@que` then clicked the button), adopt it as a normal typed
    // trigger so selection strips the query — rather than opening a picker that
    // would leave the `@que` text stranded in the composer.
    const caret = this.input.getSelection().start;
    const typed = parseAnyTrigger(this.input.getLogicalText(), caret, [channel]);
    if (typed) {
      this.pickerMode = false;
      this.triggerMatch = typed.match;
      if (!this.isOpenState) {
        this.open(typed.match.query, channel);
      } else {
        this.switchChannel(channel);
        this.setQuery(typed.match.query);
      }
      this.input.focus();
      return;
    }

    this.pickerMode = true;
    this.triggerMatch = null;
    if (!this.isOpenState) {
      this.open("", channel);
    } else {
      this.switchChannel(channel);
      this.setQuery("");
    }
    if (this.menu.showSearch) this.menu.showSearch("", channel.searchPlaceholder);
    else this.input.focus();
  }

  /** Re-parse the composer on every input and open/update/close the menu. */
  onInput(): void {
    const caret = this.input.getSelection().start;
    const hit = parseAnyTrigger(this.input.getLogicalText(), caret, this.channels);
    if (!hit) {
      if (this.isOpenState) this.close();
      return;
    }
    if (this.isInlineArgTail(hit.channel, hit.match.query)) {
      // The command name is complete and the caret is into the argument — the
      // menu has nothing left to offer, so keep it closed (Slack-style). The
      // command runs at submit via `dispatchInlineCommand`.
      this.triggerMatch = null;
      if (this.isOpenState) this.close(false);
      return;
    }
    this.triggerMatch = hit.match;
    if (!this.isOpenState) {
      this.open(hit.match.query, hit.channel);
    } else {
      this.switchChannel(hit.channel);
      // Re-anchor only when the trigger MOVED (new session / edit before the `@`).
      // Plain query typing keeps the same `triggerIndex`, so the menu stays put —
      // no per-keystroke layout work (Slack behavior).
      if (this.measuredTriggerIndex !== hit.match.triggerIndex) {
        this.updateTriggerAnchor();
      }
      this.setQuery(hit.match.query);
    }
  }

  /** Switch the active channel while open, resetting stale groups from the old one. */
  private switchChannel(channel: NormalizedMentionChannel): void {
    if (channel === this.activeChannel) return;
    this.activeChannel = channel;
    this.groups = [];
    this.activeIndex = 0;
  }

  private open(query: string, channel: NormalizedMentionChannel): void {
    this.isOpenState = true;
    this.activeChannel = channel;
    this.groups = [];
    this.activeIndex = 0;
    this.lastAnnouncedCount = -1;
    if (!this.popover) {
      // Inline mode with a measurable composer trigger-anchors the menu to the `@`
      // glyph (Slack-style): the menu is content-sized and shifts horizontally.
      // Every other mode keeps the composer-anchored, full-width menu unchanged.
      const anchored = this.canAnchorMenu();
      this.popover = createPopover({
        anchor: this.opts.anchor,
        content: this.menu.el,
        placement: "top-start",
        // Full-width menu only in composer-anchored mode; the trigger-anchored
        // menu must be content-sized so it has room to shift within the composer.
        matchAnchorWidth: !anchored,
        offset: 6,
        container: this.opts.popoverContainer,
        // Trigger-anchored horizontal offset (px from the composer's left edge),
        // or null → composer-anchored fallback. Omitted entirely when not anchored.
        horizontalOffset: anchored ? () => this.triggerAnchorOffset : undefined,
        // Outside-click / anchor-removed: run the SAME teardown as an explicit
        // close so the debounce timer, in-flight search, and search token are
        // cleaned up too. `popover.close()` inside is a no-op here (the popover
        // already closed itself before firing this), so there's no recursion.
        // Don't steal focus back to the composer on an outside click.
        onDismiss: () => this.close(false),
      });
      // Content-sized menu (popover caps max-width to the composer); a floor keeps
      // short result lists from collapsing. Set inline so no menu-CSS rule is needed.
      // Computed in px against the composer: a `min(220px, 100%)` percentage would
      // resolve against the viewport (the popover is fixed-positioned) and, as
      // min-width beats max-width, overflow composers narrower than 220px.
      if (anchored) {
        const anchorWidth = this.opts.anchor.getBoundingClientRect().width;
        this.menu.el.style.minWidth = `${Math.min(220, anchorWidth)}px`;
      }
    }
    // Measure the trigger glyph ONCE for this session (before the first reposition
    // in setQuery). Re-measures only on a trigger-index change (new session); the
    // popover's own scroll/resize reposition reuses the cached anchor-relative
    // delta, so panning/scrolling stays aligned without re-measuring.
    this.updateTriggerAnchor();
    this.popover.open();
    // Inject the menu CSS into whatever root the menu now lives in (document
    // head by default; the shadow root under `useShadowDom`). Idempotent per
    // root — this chunk carries the menu styles instead of the eager widget.css.
    injectStyles(this.menu.el, "persona-mention-menu", MENTION_MENU_CSS);
    this.input.element.setAttribute("aria-expanded", "true");
    this.observeComposerResize();
    this.opts.emit?.("opened", { trigger: channel.trigger });
    this.setQuery(query);
  }

  /**
   * While the menu is open, follow the composer as it auto-grows on line-wrap.
   * A wrap moves the `@` glyph to a new line (x shifts) and changes the
   * composer's box (the upward menu's top shifts), so on each resize we re-measure
   * the trigger anchor and reposition. ResizeObserver fires on wrap boundaries,
   * not per character, so this keeps the once-per-session measurement discipline.
   * Repositioning the fixed-position menu never touches the composer's box, so
   * there is no observer feedback loop. Degrades silently where ResizeObserver is
   * unavailable (e.g. jsdom), so behavior falls back to scroll/window-resize only.
   */
  private observeComposerResize(): void {
    if (typeof ResizeObserver === "undefined" || this.resizeObserver) return;
    this.resizeObserver = new ResizeObserver(() => {
      if (!this.isOpenState) return;
      this.updateTriggerAnchor();
      this.popover?.reposition();
    });
    this.resizeObserver.observe(this.opts.anchor);
  }

  private disconnectComposerResize(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
  }

  /**
   * True when the menu can trigger-anchor to the `@` glyph: inline display with a
   * composer that can measure a logical range rect. Chip/textarea mode (no
   * `getLogicalRangeRect`) keeps the composer-anchored menu — graceful degradation.
   */
  private canAnchorMenu(): boolean {
    return this.isInlineDisplay() && !!this.input.getLogicalRangeRect;
  }

  /**
   * Measure the `@` trigger glyph and cache its horizontal offset from the
   * composer's left edge (a delta, so it survives scroll — the popover adds it to
   * the live anchor rect each reposition). Called once per trigger session and
   * again only when the trigger index changes (new session) — never per keystroke,
   * so plain query typing does no layout work. Caches `null` (composer-anchored
   * fallback) when the composer can't anchor, there is no live trigger, the
   * direction is RTL, or the rect is unmeasurable. The `@` is one glyph at
   * `triggerIndex`; a non-collapsed range around it measures reliably (a collapsed
   * boundary range measures empty).
   */
  private updateTriggerAnchor(): void {
    const match = this.triggerMatch;
    const measure = this.input.getLogicalRangeRect;
    this.measuredTriggerIndex = match?.triggerIndex ?? null;
    this.triggerAnchorOffset = null;
    if (!match || !measure) return;
    // RTL: horizontal trigger anchoring is left-to-right math; fall back to the
    // composer-anchored behavior rather than mispositioning. One early return.
    const el = this.input.element;
    if (
      typeof getComputedStyle === "function" &&
      getComputedStyle(el).direction === "rtl"
    ) {
      return;
    }
    const rect = measure(match.triggerIndex, match.triggerIndex + 1);
    if (!rect) return;
    this.triggerAnchorOffset =
      rect.left - this.opts.anchor.getBoundingClientRect().left;
  }

  close(refocus = true): void {
    if (!this.isOpenState) return;
    this.isOpenState = false;
    this.disconnectComposerResize();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.searchAbort?.abort();
    // Invalidate any in-flight async search so late results can't render,
    // announce, or emit into a closed menu.
    this.searchToken++;
    this.popover?.close();
    this.input.element.setAttribute("aria-expanded", "false");
    this.input.element.removeAttribute("aria-activedescendant");
    if (this.pickerMode) {
      // Picker teardown: hide the search field and (unless dismissed by an
      // outside click) hand focus back to the composer so the user keeps typing.
      this.pickerMode = false;
      this.menu.hideSearch?.();
      if (refocus) this.input.focus();
    }
  }

  private setQuery(query: string): void {
    this.query = query;
    // A new query resets the highlight to the first result (standard
    // autocomplete). Async results for the SAME query keep it via `activeKey`.
    this.activeIndex = 0;
    this.activeKey = null;
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

  /** Stable identity for a flat entry (for tracking the highlight across reorders). */
  private keyOf(entry: {
    source: AgentWidgetContextMentionSource;
    item: AgentWidgetContextMentionItem;
  }): string {
    return JSON.stringify([entry.source.id, entry.item.id]);
  }

  private rebuildFlat(): void {
    this.flat = [];
    for (const group of this.groups) {
      if (group.status === "ready") {
        for (const item of group.items) this.flat.push({ source: group.source, item });
      }
    }
    // Keep the highlight on the same item when async results reorder the list;
    // fall back to the clamped index (or 0) when that item is no longer present.
    if (this.activeKey) {
      const idx = this.flat.findIndex((e) => this.keyOf(e) === this.activeKey);
      this.activeIndex =
        idx >= 0 ? idx : Math.min(this.activeIndex, Math.max(0, this.flat.length - 1));
    } else if (this.activeIndex >= this.flat.length) {
      this.activeIndex = Math.max(0, this.flat.length - 1);
    }
  }

  private viewModel() {
    return {
      query: this.query,
      groups: this.groups,
      activeIndex: this.activeIndex,
    };
  }

  private render(): void {
    this.rebuildFlat();
    this.menu.render(this.viewModel());
    this.syncActiveDescendant();
    this.popover?.reposition();
    // Don't announce "No matches" while results are still loading in.
    const anyLoading = this.groups.some((g) => g.status === "loading");
    if (this.flat.length === 0 && anyLoading) return;
    if (this.flat.length !== this.lastAnnouncedCount) {
      this.lastAnnouncedCount = this.flat.length;
      this.opts.announce(
        this.flat.length === 0
          ? "No matches"
          : this.flat.length === 1
            ? "1 result"
            : `${this.flat.length} results`
      );
      this.opts.emit?.("searched", { query: this.query, results: this.flat.length });
    }
  }

  private setActiveIndex(index: number, scroll = true): void {
    if (index < 0 || index >= this.flat.length) return;
    this.activeIndex = index;
    this.activeKey = this.keyOf(this.flat[index]);
    this.menu.setActiveIndex(index, scroll);
    this.syncActiveDescendant();
  }

  /**
   * Mirror the active option id onto the composer textarea so screen readers can
   * track the highlight on the typed-trigger path (focus stays in the textarea
   * there). In picker mode the search field owns focus + `aria-activedescendant`,
   * so the textarea's is cleared.
   */
  private syncActiveDescendant(): void {
    const live =
      this.isOpenState &&
      !this.pickerMode &&
      this.activeIndex >= 0 &&
      this.activeIndex < this.flat.length;
    if (live) {
      this.input.element.setAttribute(
        "aria-activedescendant",
        `${this.listboxId}-opt-${this.activeIndex}`
      );
    } else {
      this.input.element.removeAttribute("aria-activedescendant");
    }
  }

  /** Re-run a failed source's search for the current query (menu Retry button). */
  private retrySource(sourceId: string): void {
    const source = this.activeChannel.sources.find((s) => s.id === sourceId);
    if (!source || !this.searchAbort) return;
    this.setGroupStatus(sourceId, "loading");
    this.render();
    this.invokeSource(source, this.searchToken);
    // Reflect a synchronous result immediately (async results render on arrival).
    this.render();
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
      case "Home": {
        if (this.flat.length === 0) return true;
        event.preventDefault();
        this.setActiveIndex(0);
        return true;
      }
      case "End": {
        if (this.flat.length === 0) return true;
        event.preventDefault();
        this.setActiveIndex(this.flat.length - 1);
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
   * token (via the same {@link splitCommandQuery}), so the item stays selectable
   * while the user types args.
   */
  private deriveArgs(query: string): string {
    return splitCommandQuery(query).args;
  }

  /**
   * Inline-completion commands: every `command:"server"` item (its chip had no
   * way to add an argument) plus any `"prompt"`/`"action"` item that declares an
   * arg placeholder. Selecting these fills `/name ` into the composer for inline
   * arg entry instead of dispatching now; execution happens at submit.
   */
  private isInlineCommand(item: AgentWidgetContextMentionItem): boolean {
    return item.command === "server" || item.commandArgsPlaceholder != null;
  }

  private commit(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): void {
    const kind = item.command;

    // Inline completion (Slack-style): fill `/name ` and let the user type the
    // argument. No chip, no dispatch now — `dispatchInlineCommand` runs it at
    // submit with the typed args.
    if (this.isInlineCommand(item)) {
      this.completeCommandInline(source, item);
      return;
    }

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
      this.input.focus();
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

    // Ordinary `@` mentions. Inline display: insert an atomic token in the prose
    // and track its resolve by composer id. Chip display: go through the manager
    // (chip row + resolve). Server commands never reach here — they inline-complete
    // above.
    if (this.isInlineDisplay()) {
      this.commitInlineMention(source, item);
      return;
    }

    const ok = this.opts.onSelect(source, item, "");
    if (ok) {
      this.stripQuery();
      this.opts.emit?.("selected", {
        sourceId: source.id,
        itemId: item.id,
        label: item.label,
      });
    }
    this.close();
    this.input.focus();
  }

  /** True when `@` mentions render as inline tokens (contenteditable composer). */
  private isInlineDisplay(): boolean {
    return (
      this.opts.mentionConfig.display === "inline" &&
      !!this.opts.onInsertMention &&
      !!this.input.insertMentionAtTrigger
    );
  }

  /**
   * Inline-display commit: insert an atomic mention token (replacing the typed
   * `@query` range, or at the caret for the picker path) and track its resolve
   * keyed by the returned composer id. The limit is gated BEFORE insertion so a
   * rejected pick never leaves a stray token.
   */
  private commitInlineMention(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): void {
    // Limit gate BEFORE insertion (fires the manager's rejection hooks) so a
    // rejected pick never leaves a stray token.
    if (this.opts.admitMention && !this.opts.admitMention(source, item)) {
      this.close();
      this.input.focus();
      return;
    }
    const ref = refFromItem(source, item);
    const id = this.triggerMatch
      ? this.input.insertMentionAtTrigger!(ref, this.triggerMatch)
      : (this.input.insertMentionAtSelection?.(ref) ?? null);
    if (id) {
      this.opts.onInsertMention!(id, source, item, "");
      this.opts.emit?.("selected", {
        sourceId: source.id,
        itemId: item.id,
        label: item.label,
      });
    } else {
      // Insertion refused: the adapter's staleness guard saw the composer text
      // change between parse and commit (an IME/edit race). Fire the same
      // rejection path chip-mode failures use so hosts/tests can react rather than
      // the typed `@query` being silently stranded.
      this.opts.mentionConfig.onMentionRejected?.(item, "stale");
      this.opts.emit?.("rejected", {
        sourceId: source.id,
        itemId: item.id,
        reason: "stale",
      });
    }
    // The `@query` range became the token (typed path); nothing left to strip.
    this.triggerMatch = null;
    this.close();
    this.input.focus();
  }

  /**
   * Slack-style inline completion: replace the typed trigger query with
   * `<trigger><name> ` so the user types the argument inline. No chip is created
   * and nothing is dispatched — `dispatchInlineCommand` runs the command at
   * submit with the typed args. The trailing space + `isInlineArgTail` keep the
   * menu from reopening while the argument is typed.
   */
  private completeCommandInline(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem
  ): void {
    const insert = `${this.activeChannel.trigger}${item.label} `;
    const caret = this.input.getSelection().start;
    // Typed path: replace the `<trigger><query>` span. Picker path (button open,
    // no trigger char present): insert at the caret. Line-start commands only
    // dispatch when they lead a line, so a mid-line picker insert degrades to
    // literal text — acceptable for the rarely-used slash button. Both endpoints
    // are LOGICAL offsets, so the edit must run in logical space (see below).
    const start = this.triggerMatch ? this.triggerMatch.triggerIndex : caret;
    if (this.input.replaceLogicalRange) {
      // Inline: splice at the document level so tokens elsewhere in the line
      // survive (a display-string slice would misalign against `@Label` and
      // re-rendering as one text block would destroy every token).
      this.input.replaceLogicalRange(start, caret, insert);
    } else {
      // Textarea: DISPLAY === LOGICAL, so the string slice is exact.
      const value = this.input.getValue();
      this.input.setValueWithCaret(
        value.slice(0, start) + insert + value.slice(caret),
        start + insert.length
      );
    }
    this.triggerMatch = null;
    this.close();
    this.opts.emit?.("command", {
      sourceId: source.id,
      itemId: item.id,
      kind: item.command ?? "prompt",
      phase: "armed",
    });
    // Re-parse: the trailing space + `isInlineArgTail` keeps the menu closed.
    this.input.dispatchInput();
    this.input.focus();
  }

  /**
   * True when a command channel's query is a complete inline-command name
   * followed by argument text (`"lookup "`, `"lookup 1042"`). Selecting is done;
   * the menu closes so the list doesn't reappear while the argument is typed.
   */
  private isInlineArgTail(
    channel: NormalizedMentionChannel,
    query: string
  ): boolean {
    const { name } = splitCommandQuery(query);
    if (!name || query.length <= name.length) return false;
    return channel.sources.some((s) => {
      const item = s.matchCommand?.(name);
      return !!item && this.isInlineCommand(item);
    });
  }

  /**
   * Find a leading inline command in composer TEXT, for submit-time dispatch.
   * For each command channel, if the relevant line begins with the trigger, its
   * first token is looked up via the source's `matchCommand`; only inline
   * commands match. Returns the source, item, and the argument text after the
   * name. Handles menu-selected and hand-typed commands uniformly.
   */
  private matchInlineCommand(text: string): {
    source: AgentWidgetContextMentionSource;
    item: AgentWidgetContextMentionItem;
    args: string;
  } | null {
    for (const channel of this.channels) {
      if (!channel.trigger) continue;
      // line-start / input-start commands lead their line — parse the first line.
      const line = channel.position === "anywhere" ? text : text.split("\n")[0];
      if (!line.startsWith(channel.trigger)) continue;
      const { name, args } = splitCommandQuery(line.slice(channel.trigger.length));
      if (!name) continue;
      for (const source of channel.sources) {
        const item = source.matchCommand?.(name);
        if (item && this.isInlineCommand(item)) return { source, item, args };
      }
    }
    return null;
  }

  /**
   * Dispatch a leading inline command in `text` at submit. `action` runs in the
   * browser (nothing sent); `prompt` resolves to the text to send instead;
   * `server` returns a mentions bundle (refs empty) whose `finalize` attaches the
   * resolved `context`. Returns null when `text` isn't an inline command.
   */
  async dispatchInlineCommand(text: string): Promise<InlineCommandResult | null> {
    const match = this.matchInlineCommand(text);
    if (!match) return null;
    const { source, item, args } = match;
    const kind = item.command ?? "prompt";
    this.opts.emit?.("command", {
      sourceId: source.id,
      itemId: item.id,
      kind,
      args,
    });

    if (kind === "action") {
      this.runAction(item, args);
      return { kind: "action" };
    }

    if (kind === "prompt") {
      let payload;
      try {
        payload = await source.resolve(item, this.resolveContext(args, text));
      } catch (error) {
        if (typeof console !== "undefined") {
          console.warn("[Persona] inline prompt command resolve failed", error);
        }
        return null; // send the typed text as-is
      }
      return { kind: "prompt", sendText: payload.insertText ?? payload.llmAppend ?? text };
    }

    // server: resolve at submit; refs empty (no chip), context namespaced.
    const finalize = async (): Promise<MentionSubmitBundle> => {
      const payload = await source.resolve(item, this.resolveContext(args, text));
      const context: Record<string, Record<string, unknown>> = {};
      if (payload.context) context[source.id] = { [item.id]: payload.context };
      return {
        llmEntries: [],
        contentParts: payload.contentParts ?? [],
        context,
      };
    };
    return { kind: "server", mentions: { refs: [], finalize } };
  }

  private resolveContext(args: string, composerText: string) {
    return {
      messages: this.opts.getMessages(),
      config: this.opts.getConfig(),
      composerText,
      args,
      signal: new AbortController().signal,
    };
  }

  /** Run a `command:"action"` handler, guarding against throws. */
  private runAction(item: AgentWidgetContextMentionItem, args: string): void {
    if (!item.action) return;
    try {
      void Promise.resolve(
        item.action({
          args,
          config: this.opts.getConfig(),
          messages: this.opts.getMessages(),
          composer: this.input,
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

  /**
   * Snapshot the trigger span for an insert-at-caret prompt macro: the LOGICAL
   * range `[triggerIndex, caret)` to rewrite, plus the display `value` at select
   * time for the textarea fallback (where DISPLAY === LOGICAL).
   */
  private captureStripTarget(): {
    value: string;
    start: number;
    end: number;
  } | null {
    if (!this.triggerMatch) return null;
    return {
      value: this.input.getValue(),
      start: this.triggerMatch.triggerIndex,
      end: this.input.getSelection().start,
    };
  }

  /** Resolve a `command:"prompt"` macro and write its text into the composer. */
  private async runPromptMacro(
    source: AgentWidgetContextMentionSource,
    item: AgentWidgetContextMentionItem,
    args: string,
    target: { value: string; start: number; end: number } | null
  ): Promise<void> {
    const composer = this.input;
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
      if (composer.replaceLogicalRange) {
        // Inline: splice the `/command` span in logical space, preserving tokens
        // elsewhere in the prose. `setValue` would flatten the whole document.
        composer.replaceLogicalRange(target.start, target.end, text);
        composer.dispatchInput();
      } else {
        // Textarea: DISPLAY === LOGICAL, so splice the display snapshot.
        composer.setValue(
          target.value.slice(0, target.start) + text + target.value.slice(target.end)
        );
      }
    } else {
      composer.setValue(text);
    }
    if (item.submitOnSelect) composer.submit();
  }

  private stripQuery(): void {
    if (!this.triggerMatch) return;
    const caret = this.input.getSelection().start;
    if (this.input.replaceLogicalRange) {
      // Inline: remove the `@query` span in logical space, preserving every token
      // outside `[triggerIndex, caret)`. A display-string strip would misalign and
      // a full re-render would destroy the tokens.
      this.input.replaceLogicalRange(this.triggerMatch.triggerIndex, caret, "");
    } else {
      // Textarea: DISPLAY === LOGICAL, so the string strip is exact.
      const out = stripMentionQuery(this.input.getValue(), this.triggerMatch, caret);
      this.input.setValueWithCaret(out.value, out.caret);
    }
    // Auto-resize listener reacts to input; our re-parse yields null → stays closed.
    this.input.dispatchInput();
    this.triggerMatch = null;
  }

  destroy(): void {
    this.disconnectComposerResize();
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.searchAbort?.abort();
    this.popover?.destroy();
    this.menu.destroy();
    const el = this.input.element;
    el.removeAttribute("aria-haspopup");
    el.removeAttribute("aria-controls");
    el.removeAttribute("aria-expanded");
    el.removeAttribute("aria-activedescendant");
  }
}
