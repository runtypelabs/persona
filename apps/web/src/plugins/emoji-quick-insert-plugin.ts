import type { AgentWidgetPlugin } from "@runtypelabs/persona";
import { createPopover, injectStyles, type PopoverHandle } from "@runtypelabs/persona/plugin-kit";

/**
 * Coexistence example 1: a start-cluster button action that opens a small
 * emoji popover.
 *
 * Nothing here touches `renderComposer`. The plugin contributes one action
 * through `contributeComposerActions`, and the registry places it by `order`
 * next to the core built-ins. `createPopover` from the plugin kit owns
 * positioning and outside dismissal.
 */

const DEFAULT_EMOJI = ["👍", "🎉", "🙏", "🚀", "❤️", "😅", "🤔", "✅"];

const STYLE_ID = "persona-emoji-quick-insert";
const STYLES = `
.emoji-quick-insert {
  display: grid;
  grid-template-columns: repeat(4, 2rem);
  gap: 0.25rem;
  padding: 0.4rem;
  border-radius: 0.6rem;
  background: var(--persona-surface, #ffffff);
  border: 1px solid var(--persona-border, rgba(0, 0, 0, 0.12));
  box-shadow: 0 12px 32px rgba(15, 23, 42, 0.18);
}
.emoji-quick-insert__item {
  width: 2rem;
  height: 2rem;
  font-size: 1.05rem;
  line-height: 1;
  border: none;
  border-radius: 0.4rem;
  background: transparent;
  cursor: pointer;
}
.emoji-quick-insert__item:hover,
.emoji-quick-insert__item:focus-visible {
  background: var(--persona-button-ghost-hover-bg, rgba(0, 0, 0, 0.06));
}
`;

export type EmojiQuickInsertOptions = {
  emoji?: readonly string[];
  /** Registry order. Defaults to 250: after attachment (200), before mic. */
  order?: number;
};

export function createEmojiQuickInsertPlugin(
  options: EmojiQuickInsertOptions = {}
): AgentWidgetPlugin {
  const emoji = options.emoji ?? DEFAULT_EMOJI;
  let popover: PopoverHandle | null = null;

  return {
    id: "emoji-quick-insert",
    contributeComposerActions: () => [
      {
        // Renders as "emoji-quick-insert:pick": the registry namespaces plugin
        // ids so two plugins can both ship a "pick" action.
        id: "pick",
        placement: "start",
        order: options.order ?? 250,
        label: "Insert an emoji",
        tooltipText: "Insert an emoji",
        iconName: "sparkles",
        disableWhenStreaming: true,
        onSelect: (ctx, event) => {
          injectStyles(event.currentTarget as HTMLElement, STYLE_ID, STYLES);
          if (popover?.isOpen) {
            popover.close();
            return;
          }
          popover?.destroy();

          const panel = document.createElement("div");
          panel.className = "emoji-quick-insert";
          panel.setAttribute("role", "group");
          panel.setAttribute("aria-label", "Emoji");
          for (const glyph of emoji) {
            const item = document.createElement("button");
            item.type = "button";
            item.className = "emoji-quick-insert__item";
            item.textContent = glyph;
            item.setAttribute("aria-label", `Insert ${glyph}`);
            item.addEventListener("click", () => {
              ctx.setValue(ctx.getValue() + glyph);
              popover?.close();
            });
            panel.appendChild(item);
          }

          popover = createPopover({
            anchor: event.currentTarget as HTMLElement,
            content: panel,
            placement: "top-start",
          });
          popover.open();
        },
      },
    ],
  };
}
