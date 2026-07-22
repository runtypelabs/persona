/**
 * Context-mentions runtime entry — the HEAVY module that assembles the menu
 * controller + chip manager. It is NEVER statically imported on the core path:
 * the IIFE/CDN build marks it external (`tsup.global.config.ts`) and loads the
 * standalone `context-mentions.js` chunk from a sibling URL only when
 * `contextMentions.enabled` and the user first interacts. The core orchestrator
 * (`utils/context-mention-orchestrator.ts`) reaches it through
 * `context-mentions-loader.ts`. See `docs/context-mentions-plan.md`.
 */

import { ContextMentionManager } from "./utils/context-mention-manager";
import {
  ContextMentionController,
  type InlineCommandResult,
} from "./utils/context-mention-controller";
import {
  createTextareaComposerInput,
  type ComposerInputCapability,
} from "./utils/composer-input";
import { createLiveRegion } from "./utils/live-region";
import type { MentionSubmitBundle } from "./utils/context-mention-manager";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionRef,
  AgentWidgetMessage,
} from "./types";

export interface ContextMentionMountContext {
  mentionConfig: AgentWidgetContextMentionConfig;
  textarea: HTMLTextAreaElement;
  /**
   * Pre-built composer input surface. Provided by the inline chunk in
   * `display: "inline"` mode (a contenteditable adapter that replaced the
   * textarea); omitted in chip mode, where a textarea adapter is built here.
   */
  composerInput?: ComposerInputCapability;
  /** Popover anchor — the composer form/pill (menu opens upward, full width). */
  anchor: HTMLElement;
  /** Chip row created by the core orchestrator. */
  contextRow: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  getConfig: () => AgentWidgetConfig;
  /**
   * Widget container that hosts the mention live regions (created here, on
   * engine mount, so the helper stays out of the core bundle). Announcements
   * can't fire before the engine exists, so lazy creation loses nothing.
   */
  liveRegionHost: HTMLElement | ShadowRoot;
  popoverContainer?: HTMLElement | ShadowRoot;
  /**
   * Reflect the affordance-button picker's open state onto the button
   * (`aria-expanded`/`aria-controls`). See the controller option of the same name.
   */
  onPickerOpenChange?: (open: boolean, trigger: string, listboxId: string) => void;
  /** Emit a `persona:mention:<event>` analytics DOM event. */
  emit?: (event: string, detail: unknown) => void;
}

export interface ContextMentionEngine {
  /**
   * Open the menu from an affordance button as a picker (no char inserted).
   * Pass the channel's `trigger` to open a specific channel (e.g. `"/"`).
   */
  openMenu(trigger?: string): void;
  isMenuOpen(): boolean;
  /** Re-parse the textarea on input and open/update/close the menu. */
  handleInput(): void;
  /** Returns true when the key was consumed. */
  handleKeydown(event: KeyboardEvent): boolean;
  hasMentions(): boolean;
  removeLastChip(): boolean;
  /**
   * Dispatch a leading inline slash command in the composer `text` at submit
   * (Slack-style). Returns null when `text` isn't an inline command. See
   * {@link InlineCommandResult}.
   */
  dispatchInlineCommand(text: string): Promise<InlineCommandResult | null>;
  collectForSubmit():
    | { refs: AgentWidgetContextMentionRef[]; finalize: () => Promise<MentionSubmitBundle> }
    | null;
  /**
   * INLINE display only. Stop tracking a mention whose token the user deleted from
   * the composer (aborts its in-flight resolve). Wired to the contenteditable
   * adapter's removal detection by the orchestrator.
   */
  untrackMention(id: string): void;
  /**
   * Rebind the engine to a new composer input surface (the inline swap landing
   * while the engine is already live). Only the menu layer (controller) re-mounts
   * on the new element — the manager, with any committed chips and their
   * in-flight resolves, survives, so a mention picked pre-swap still finalizes
   * into the submit payload. Any open menu closes. No-op when already bound.
   */
  rebindComposer(input: ComposerInputCapability): void;
  clear(): void;
  destroy(): void;
}

export function mountContextMentions(
  ctx: ContextMentionMountContext
): ContextMentionEngine {
  // Inline mode supplies a pre-built contenteditable capability; chip mode builds
  // a textarea-backed one here. Mutable: `rebindComposer` swaps it when the inline
  // composer replaces the textarea while the engine is already live — closures
  // below read it at call time so they always drive the current surface.
  let composerInput =
    ctx.composerInput ?? createTextareaComposerInput(ctx.textarea);

  // Polite region for result-count + add/remove announcements; assertive region
  // for resolve failures. Hosted via the shared helper so they land in the light
  // DOM when the widget renders inside a Shadow DOM (see live-region.ts).
  const liveRegion = createLiveRegion("polite", ctx.liveRegionHost);
  const errorRegion = createLiveRegion("assertive", ctx.liveRegionHost);
  const announce = (message: string): void => liveRegion.announce(message);
  const announceError = (message: string): void => errorRegion.announce(message);

  const manager = new ContextMentionManager({
    mentionConfig: ctx.mentionConfig,
    contextRow: ctx.contextRow,
    getMessages: ctx.getMessages,
    getConfig: ctx.getConfig,
    getComposerText: () => composerInput.getValue(),
    announce,
    announceError,
    emit: ctx.emit,
  });

  const buildController = (): ContextMentionController =>
    new ContextMentionController({
      mentionConfig: ctx.mentionConfig,
      composerInput,
      anchor: ctx.anchor,
      getMessages: ctx.getMessages,
      getConfig: ctx.getConfig,
      onSelect: (source, item, args) => manager.add(source, item, args),
      // Inline commit: the controller inserts the token, then tracks its resolve
      // keyed by the composer id. `reportStatus` reflects the resolve outcome onto
      // the live token element (error styling — inline tokens carry no chip).
      onInsertMention: (id, source, item, args) =>
        manager.track(id, source, item, args, (status) =>
          composerInput.setMentionStatus?.(id, status)
        ),
      admitMention: (source, item) => manager.admit(source, item),
      announce,
      popoverContainer: ctx.popoverContainer,
      onPickerOpenChange: ctx.onPickerOpenChange,
      emit: ctx.emit,
    });

  let controller = buildController();

  return {
    openMenu: (trigger) => controller.openFromButton(trigger),
    isMenuOpen: () => controller.isOpen(),
    handleInput: () => controller.onInput(),
    handleKeydown: (event) => controller.handleKeydown(event),
    hasMentions: () => manager.hasMentions(),
    removeLastChip: () => manager.removeLast(),
    dispatchInlineCommand: (text) => controller.dispatchInlineCommand(text),
    collectForSubmit: () =>
      manager.hasMentions() ? manager.collectForSubmit() : null,
    untrackMention: (id) => manager.remove(id),
    rebindComposer: (input) => {
      if (input === composerInput) return;
      // Re-mount ONLY the menu layer on the new surface. The manager — committed
      // chips and their in-flight resolves — must survive: a mention picked
      // pre-swap stays a valid chip post-swap (tokens can't be retro-inserted
      // into text the user already typed) and still finalizes at submit.
      controller.destroy();
      composerInput = input;
      controller = buildController();
    },
    clear: () => manager.clear(),
    destroy: () => {
      controller.destroy();
      manager.clear();
      liveRegion.destroy();
      errorRegion.destroy();
    },
  };
}

export type { MentionSubmitBundle };
export type { InlineCommandResult };
