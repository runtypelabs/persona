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
import { ContextMentionController } from "./utils/context-mention-controller";
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
  /** Popover anchor — the composer form/pill (menu opens upward, full width). */
  anchor: HTMLElement;
  /** Chip row created by the core orchestrator. */
  contextRow: HTMLElement;
  getMessages: () => AgentWidgetMessage[];
  getConfig: () => AgentWidgetConfig;
  announce: (message: string) => void;
  popoverContainer?: HTMLElement | ShadowRoot;
  onChange?: () => void;
  /** Emit a `persona:mention:<event>` analytics DOM event. */
  emit?: (event: string, detail: unknown) => void;
}

export interface ContextMentionEngine {
  /** Open the menu from the affordance button (inserts the trigger char). */
  openMenu(): void;
  isMenuOpen(): boolean;
  /** Re-parse the textarea on input and open/update/close the menu. */
  handleInput(): void;
  /** Returns true when the key was consumed. */
  handleKeydown(event: KeyboardEvent): boolean;
  hasMentions(): boolean;
  removeLastChip(): boolean;
  collectForSubmit():
    | { refs: AgentWidgetContextMentionRef[]; finalize: () => Promise<MentionSubmitBundle> }
    | null;
  clear(): void;
  destroy(): void;
}

export function mountContextMentions(
  ctx: ContextMentionMountContext
): ContextMentionEngine {
  const manager = new ContextMentionManager({
    mentionConfig: ctx.mentionConfig,
    contextRow: ctx.contextRow,
    getMessages: ctx.getMessages,
    getConfig: ctx.getConfig,
    getComposerText: () => ctx.textarea.value,
    announce: ctx.announce,
    onChange: ctx.onChange,
    emit: ctx.emit,
  });

  const controller = new ContextMentionController({
    mentionConfig: ctx.mentionConfig,
    textarea: ctx.textarea,
    anchor: ctx.anchor,
    getMessages: ctx.getMessages,
    getConfig: ctx.getConfig,
    onSelect: (source, item) => manager.add(source, item),
    announce: ctx.announce,
    popoverContainer: ctx.popoverContainer,
    emit: ctx.emit,
  });

  return {
    openMenu: () => controller.openFromButton(),
    isMenuOpen: () => controller.isOpen(),
    handleInput: () => controller.onInput(),
    handleKeydown: (event) => controller.handleKeydown(event),
    hasMentions: () => manager.hasMentions(),
    removeLastChip: () => manager.removeLast(),
    collectForSubmit: () =>
      manager.hasMentions() ? manager.collectForSubmit() : null,
    clear: () => manager.clear(),
    destroy: () => {
      controller.destroy();
      manager.clear();
    },
  };
}

export type { MentionSubmitBundle };
