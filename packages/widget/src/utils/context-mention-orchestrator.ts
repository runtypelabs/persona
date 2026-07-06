/**
 * Core-bundle orchestrator for context mentions.
 *
 * Tiny by design: it renders the affordance button + chip row immediately (so
 * the feature is discoverable before any heavy code loads), then lazy-loads and
 * mounts the mention runtime on first `@`/click via `context-mentions-loader`.
 * Everything heavy (controller, manager, menu, chip) lives in the lazy chunk and
 * is reached only through the dynamic import — never statically. Sites that
 * leave `contextMentions` off still pay a small eager cost (this orchestrator +
 * the affordance button + the exported source helpers, ~3 kB gz — the same on
 * ESM and the CDN); the ~15 kB runtime stays out of the core bundle until first
 * use. See `docs/context-mentions-plan.md` (Bundle strategy).
 */

import { createNode } from "./dom";
import { parseAnyTrigger, isMenuOpeningInput } from "./mention-trigger";
import { normalizeMentionChannels, type NormalizedMentionChannel } from "./mention-channels";
import { createMentionButton } from "../components/context-mention-button";
import { loadContextMentions } from "../context-mentions-loader";
import { loadContextMentionsInline } from "../context-mentions-inline-loader";
import { createMentionTokenElement } from "./mention-token";
import type { ComposerInputCapability } from "./composer-input";
import type {
  ContextMentionEngine,
  InlineCommandResult,
} from "../context-mentions-entry";
import type { MentionSubmitBundle } from "./context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionRef,
  AgentWidgetMessage,
} from "../types";

export interface ContextMentionOrchestrator {
  /**
   * Affordance button wrappers to place in the composer — one per channel that
   * opts into `showButton` (empty when all channels hide their button). The `@`
   * channel defaults to shown; extra `/`-style channels default to hidden.
   */
  affordanceButtons: HTMLElement[];
  /** Chip row to place above the textarea. */
  contextRow: HTMLElement;
  /** Call on composer `input`; pass the event's `inputType` for paste gating. */
  handleInput: (inputType?: string) => void;
  /** Call FIRST in the composer keydown handler; returns true when consumed. */
  handleKeydown: (event: KeyboardEvent) => boolean;
  isMenuOpen: () => boolean;
  hasMentions: () => boolean;
  collectForSubmit: () =>
    | { refs: AgentWidgetContextMentionRef[]; finalize: () => Promise<MentionSubmitBundle> }
    | null;
  /**
   * Dispatch a leading inline slash command in the composer `text` at submit
   * (Slack-style). Loads the runtime if a command-channel trigger leads the text
   * and it isn't loaded yet; returns null when there's no inline command.
   */
  takeInlineCommand: (text: string) => Promise<InlineCommandResult | null>;
  clear: () => void;
  /** Warm the chunk (e.g. on composer focus) so the first `@` is instant. */
  prefetch: () => void;
  /**
   * Register a callback fired when the composer element is swapped for the inline
   * contenteditable surface (`display: "inline"`), so the host can move its
   * composer listeners onto the new element. Fires immediately if the swap has
   * already happened; never fires in chip mode.
   */
  onComposerSwap: (
    cb: (next: HTMLElement, prev: HTMLElement) => void
  ) => void;
  destroy: () => void;
}

export function createContextMentionOrchestrator(opts: {
  config: AgentWidgetConfig;
  textarea: HTMLTextAreaElement;
  /** Popover anchor — the composer form/pill. */
  anchor: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  announce: (message: string) => void;
  popoverContainer?: HTMLElement | ShadowRoot;
}): ContextMentionOrchestrator | null {
  const mentionConfig = opts.config.contextMentions;
  if (!mentionConfig?.enabled) return null;

  // Normalize the primary `@` channel + any extra `triggers` channels, then drop
  // channels with no sources. A config may ship ONLY extra channels (a `/`-only
  // widget), leaving the default `@` channel empty — that channel must not paint
  // a button or match its trigger.
  const channels: NormalizedMentionChannel[] = normalizeMentionChannels(
    mentionConfig
  ).filter((c) => c.sources.length > 0);
  if (channels.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[Persona] contextMentions.enabled is true but no sources were provided; mentions are disabled."
      );
    }
    return null;
  }

  // Command channels expose `matchCommand` on their sources. A cheap eager check
  // so a plain-text send never loads the runtime just to look for a command.
  const commandChannels = channels.filter((c) =>
    c.sources.some((s) => typeof s.matchCommand === "function")
  );
  const looksLikeCommand = (text: string): boolean =>
    commandChannels.some((c) => {
      const line = c.position === "anywhere" ? text : text.split("\n")[0];
      return !!c.trigger && line.startsWith(c.trigger);
    });

  // Analytics: `persona:mention:*` DOM events on window (opened / searched /
  // selected / rejected / resolve-error). Best-effort, guarded for SSR.
  const emit = (event: string, detail: unknown) => {
    if (typeof window === "undefined") return;
    try {
      window.dispatchEvent(
        new CustomEvent(`persona:mention:${event}`, { detail })
      );
    } catch {
      /* CustomEvent unavailable — ignore */
    }
  };

  const contextRow = createNode("div", {
    className: "persona-mention-context-row",
    attrs: { "data-persona-mention-context-row": "" },
  });

  let engine: ContextMentionEngine | null = null;
  let mountPromise: Promise<ContextMentionEngine | null> | null = null;

  // Inline display (`display: "inline"`): the composer is upgraded from the live
  // textarea to a contenteditable surface on mount (via the lazy inline chunk).
  // `composerEl` tracks whichever element is current so the eager pre-engine
  // handlers read the right one; `inlineInput` is the contenteditable capability
  // handed to the controller when the menu engine mounts.
  let composerEl: HTMLElement = opts.textarea;
  let inlineInput: ComposerInputCapability | null = null;
  let inlineDestroy: (() => void) | null = null;
  let swapListener:
    | ((next: HTMLElement, prev: HTMLElement) => void)
    | null = null;
  let swapped: { next: HTMLElement; prev: HTMLElement } | null = null;

  const ensureEngine = (): Promise<ContextMentionEngine | null> => {
    if (engine) return Promise.resolve(engine);
    if (mountPromise) return mountPromise;
    mountPromise = loadContextMentions()
      .then((mod) => {
        engine = mod.mountContextMentions({
          mentionConfig,
          textarea: opts.textarea,
          // Inline mode hands the pre-built contenteditable capability; chip mode
          // leaves this undefined and the entry builds a textarea adapter.
          composerInput: inlineInput ?? undefined,
          anchor: opts.anchor,
          contextRow,
          getMessages: opts.getMessages,
          getConfig: () => opts.config,
          announce: opts.announce,
          popoverContainer: opts.popoverContainer,
          emit,
        });
        return engine;
      })
      .catch((err) => {
        if (typeof console !== "undefined") {
          console.warn("[Persona] Failed to load context mentions runtime", err);
        }
        return null;
      });
    return mountPromise;
  };

  // Load the inline chunk and swap the textarea for the contenteditable surface.
  // The textarea stays live during the fetch; anything typed before the swap is
  // plain text (tokens require the menu chunk), so migration is lossless. A failed
  // fetch simply leaves the textarea in place — inline degrades to chip behavior.
  const setupInlineComposer = (): void => {
    loadContextMentionsInline()
      .then((mod) => {
        const handle = mod.mountInlineComposer({
          textarea: opts.textarea,
          // Built in core (owns the icon renderer + any host token override), so
          // the inline chunk never bundles the icon set.
          renderToken: (ref) =>
            createMentionTokenElement(ref, {
              render: mentionConfig.renderMentionToken,
            }),
          onMentionRemoved: (id) => engine?.untrackMention(id),
        });
        inlineInput = handle.input;
        inlineDestroy = handle.destroy;
        const prev = composerEl;
        prev.replaceWith(handle.element);
        composerEl = handle.element;
        swapped = { next: handle.element, prev };
        swapListener?.(handle.element, prev);
        // If the menu engine already mounted (user opened the menu before the
        // inline chunk resolved), it is bound to a textarea adapter around the
        // now-detached textarea — a dead menu for the session. Rebind it to the
        // live contenteditable: only the menu layer re-mounts, so a mention the
        // user COMMITTED pre-swap (chip + in-flight resolve) survives and still
        // finalizes at submit — it stays a valid chip, since inline tokens can't
        // be retro-inserted into text already typed. Rebind closes any open menu,
        // which is acceptable; a dead menu (or a discarded mention) is not. When
        // the mount is still in flight it may capture the pre-swap textarea
        // adapter, so rebind once it lands (no-op if it picked up `inlineInput`).
        if (engine) {
          engine.rebindComposer(handle.input);
        } else if (mountPromise) {
          void mountPromise.then((e) => e?.rebindComposer(handle.input));
        }
      })
      .catch((err) => {
        if (typeof console !== "undefined") {
          console.warn("[Persona] Failed to load inline mention composer", err);
        }
      });
  };
  if (mentionConfig.display === "inline") setupInlineComposer();

  // One affordance button per channel that opts into `showButton`. Each opens
  // ITS channel's picker (no char inserted) via the channel's trigger.
  const buttonPartsList: ReturnType<typeof createMentionButton>[] = [];
  for (const channel of channels) {
    if (!channel.showButton) continue;
    const parts = createMentionButton({
      config: {
        ...mentionConfig,
        buttonIconName: channel.buttonIconName,
        buttonTooltipText: channel.buttonTooltipText,
      },
      buttonSize: opts.config.sendButton?.size,
      onOpen: () => {
        void ensureEngine().then((e) => e?.openMenu(channel.trigger));
      },
    });
    buttonPartsList.push(parts);
  }

  return {
    affordanceButtons: buttonPartsList.map((p) => p.wrapper),
    contextRow,

    handleInput: (inputType) => {
      if (engine) {
        engine.handleInput();
        return;
      }
      if (!isMenuOpeningInput(inputType)) return;
      // `composerEl` is the textarea (chip) or the swapped contenteditable
      // (inline); both expose `.value`/`.selectionStart` (the inline element via
      // textarea-compatible shims), so the eager trigger check is uniform.
      const el = composerEl as HTMLTextAreaElement;
      const caret = el.selectionStart ?? 0;
      if (parseAnyTrigger(el.value, caret, channels)) {
        void ensureEngine().then((e) => e?.handleInput());
      }
    },

    handleKeydown: (event) => {
      if (engine?.isMenuOpen()) return engine.handleKeydown(event);
      // Backspace-removes-last-chip is a chip-mode affordance; inline tokens are
      // deleted in the contenteditable itself (which untracks via the adapter).
      // Gate on the RUNTIME mode (`swapped` = the contenteditable actually mounted),
      // not the config: when the inline chunk fails to load the widget degrades to
      // chips while config still says "inline", and this affordance must survive.
      if (
        event.key === "Backspace" &&
        engine?.hasMentions() &&
        !swapped
      ) {
        const ta = composerEl as HTMLTextAreaElement;
        const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
        if (ta.value.length === 0 || atStart) {
          if (engine.removeLastChip()) {
            event.preventDefault();
            return true;
          }
        }
      }
      return false;
    },

    isMenuOpen: () => engine?.isMenuOpen() ?? false,
    hasMentions: () => engine?.hasMentions() ?? false,
    collectForSubmit: () => engine?.collectForSubmit() ?? null,
    takeInlineCommand: async (text) => {
      if (!looksLikeCommand(text)) return null;
      const e = engine ?? (await ensureEngine());
      return e?.dispatchInlineCommand(text) ?? null;
    },
    clear: () => engine?.clear(),
    prefetch: () => {
      void loadContextMentions().catch(() => {});
    },
    onComposerSwap: (cb) => {
      swapListener = cb;
      // If the swap already happened before the host registered, replay it now.
      if (swapped) cb(swapped.next, swapped.prev);
    },
    destroy: () => {
      engine?.destroy();
      inlineDestroy?.();
      for (const parts of buttonPartsList) parts.wrapper.remove();
      contextRow.remove();
    },
  };
}
