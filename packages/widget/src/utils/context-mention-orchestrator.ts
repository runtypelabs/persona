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
import { parseMentionTrigger, isMenuOpeningInput } from "./mention-trigger";
import { createMentionButton } from "../components/context-mention-button";
import { loadContextMentions } from "../context-mentions-loader";
import type { ContextMentionEngine } from "../context-mentions-entry";
import type { MentionSubmitBundle } from "./context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionRef,
  AgentWidgetMessage,
} from "../types";

export interface ContextMentionOrchestrator {
  /** Affordance button wrapper to place in the composer (null when `showButton:false`). */
  affordanceButton: HTMLElement | null;
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
  if (!Array.isArray(mentionConfig.sources) || mentionConfig.sources.length === 0) {
    if (typeof console !== "undefined") {
      console.warn(
        "[Persona] contextMentions.enabled is true but no sources were provided; mentions are disabled."
      );
    }
    return null;
  }

  const triggerChar = mentionConfig.trigger ?? "@";

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

  let buttonParts: ReturnType<typeof createMentionButton> | null = null;
  if (mentionConfig.showButton !== false) {
    buttonParts = createMentionButton({
      config: mentionConfig,
      buttonSize: opts.config.sendButton?.size,
      onOpen: () => {
        void ensureEngine().then((e) => e?.openMenu());
      },
    });
  }

  return {
    affordanceButton: buttonParts?.wrapper ?? null,
    contextRow,

    handleInput: (inputType) => {
      if (engine) {
        engine.handleInput();
        return;
      }
      if (!isMenuOpeningInput(inputType)) return;
      const caret = opts.textarea.selectionStart ?? 0;
      if (parseMentionTrigger(opts.textarea.value, caret, triggerChar)) {
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
      buttonParts?.wrapper.remove();
      contextRow.remove();
    },
  };
}
