/**
 * Core-bundle orchestrator for context mentions.
 *
 * Tiny by design: it renders the affordance button + chip row immediately (so
 * the feature is discoverable before any heavy code loads), then lazy-loads and
 * mounts the mention runtime on first `@`/click via `context-mentions-loader`.
 * Everything heavy (controller, manager, menu, chip) lives in the lazy chunk and
 * is reached only through the dynamic import — never statically — so sites that
 * leave `contextMentions` off pay no bundle cost. See
 * `docs/context-mentions-plan.md` (Bundle strategy).
 */

import { createNode } from "./dom";
import { parseAnyTrigger, isMenuOpeningInput, type MentionTriggerPosition } from "./mention-trigger";
import { createMentionButton } from "../components/context-mention-button";
import { loadContextMentions } from "../context-mentions-loader";
import type { ContextMentionEngine } from "../context-mentions-entry";
import type { MentionSubmitBundle } from "./context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionComposerCapability,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionRef,
  AgentWidgetContextMentionSource,
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
  clear: () => void;
  /** Warm the chunk (e.g. on composer focus) so the first `@` is instant. */
  prefetch: () => void;
  destroy: () => void;
}

/** A trigger channel normalized for the core orchestrator (pre-check + button). */
type OrchestratorChannel = {
  trigger: string;
  position: MentionTriggerPosition;
  allowSpaces: boolean;
  sources: AgentWidgetContextMentionSource[];
  showButton: boolean;
  buttonIconName?: string;
  buttonTooltipText?: string;
};

/** Primary `@` channel (from legacy fields) + extra `triggers` channels. */
function normalizeChannels(
  cfg: AgentWidgetContextMentionConfig
): OrchestratorChannel[] {
  const primary: OrchestratorChannel = {
    trigger: cfg.trigger ?? "@",
    position: cfg.triggerPosition ?? "anywhere",
    allowSpaces: false,
    sources: Array.isArray(cfg.sources) ? cfg.sources : [],
    showButton: cfg.showButton !== false,
    buttonIconName: cfg.buttonIconName,
    buttonTooltipText: cfg.buttonTooltipText,
  };
  const extra: OrchestratorChannel[] = (cfg.triggers ?? []).map((ch) => ({
    trigger: ch.trigger,
    position: ch.triggerPosition ?? "anywhere",
    allowSpaces: ch.allowSpaces ?? false,
    sources: Array.isArray(ch.sources) ? ch.sources : [],
    // Extra channels (e.g. `/`) default to NO button — typed-trigger only —
    // to keep the composer's action cluster uncluttered.
    showButton: ch.showButton === true,
    buttonIconName: ch.buttonIconName,
    buttonTooltipText: ch.buttonTooltipText,
  }));
  return [primary, ...extra];
}

export function createContextMentionOrchestrator(opts: {
  config: AgentWidgetConfig;
  textarea: HTMLTextAreaElement;
  /** Popover anchor — the composer form/pill. */
  anchor: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  /** Composer capability for slash-command dispatch (prompt insert / action / submit). */
  composer?: AgentWidgetContextMentionComposerCapability;
  announce: (message: string) => void;
  popoverContainer?: HTMLElement | ShadowRoot;
}): ContextMentionOrchestrator | null {
  const mentionConfig = opts.config.contextMentions;
  if (!mentionConfig?.enabled) return null;

  // Normalize the primary `@` channel + any extra `triggers` channels, then drop
  // channels with no sources. A config may ship ONLY extra channels (a `/`-only
  // widget), leaving the default `@` channel empty — that channel must not paint
  // a button or match its trigger.
  const channels: OrchestratorChannel[] = normalizeChannels(mentionConfig).filter(
    (c) => c.sources.length > 0
  );
  if (channels.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[Persona] contextMentions.enabled is true but no sources were provided; mentions are disabled."
      );
    }
    return null;
  }

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

  const ensureEngine = (): Promise<ContextMentionEngine | null> => {
    if (engine) return Promise.resolve(engine);
    if (mountPromise) return mountPromise;
    mountPromise = loadContextMentions()
      .then((mod) => {
        engine = mod.mountContextMentions({
          mentionConfig,
          textarea: opts.textarea,
          anchor: opts.anchor,
          contextRow,
          getMessages: opts.getMessages,
          getConfig: () => opts.config,
          composer: opts.composer,
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
      const caret = opts.textarea.selectionStart ?? 0;
      if (parseAnyTrigger(opts.textarea.value, caret, channels)) {
        void ensureEngine().then((e) => e?.handleInput());
      }
    },

    handleKeydown: (event) => {
      if (engine?.isMenuOpen()) return engine.handleKeydown(event);
      if (event.key === "Backspace" && engine?.hasMentions()) {
        const ta = opts.textarea;
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
    clear: () => engine?.clear(),
    prefetch: () => {
      void loadContextMentions().catch(() => {});
    },
    destroy: () => {
      engine?.destroy();
      for (const parts of buttonPartsList) parts.wrapper.remove();
      contextRow.remove();
    },
  };
}
