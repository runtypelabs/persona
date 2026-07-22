import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type { AgentWidgetContextMentionConfig } from "../types";

export interface MentionButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

/**
 * The visible composer affordance ("add context") — the discoverable entry
 * point that opens the mention menu. Lives in the CORE bundle (not the lazy
 * chunk) so the button paints immediately when `contextMentions.enabled`, before
 * the heavy menu runtime loads on first interaction.
 *
 * Styled to match `createAttachmentControls`' icon button for visual parity.
 */
export function createMentionButton(opts: {
  config: AgentWidgetContextMentionConfig;
  buttonSize?: string;
  onOpen: () => void;
}): MentionButtonParts {
  const { config, onOpen } = opts;
  const size = opts.buttonSize ?? "40px";
  const sizeNum = parseFloat(size) || 40;
  const iconSize = Math.round(sizeNum * 0.6);
  // Default to a "+" signifier, not an "@" glyph: no major consumer chat app
  // (ChatGPT, Claude, Gemini, Perplexity) puts a literal "@" button in the
  // composer — "@" is a typed power-user accelerator, while "+"/"add context"
  // is the recognized consumer affordance. Override via `buttonIconName`
  // (e.g. "at-sign") on a power-user surface.
  const iconName = config.buttonIconName ?? "plus";
  const tooltipText = config.buttonTooltipText ?? "Add context";

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    className:
      "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-mention-button",
    attrs: {
      type: "button",
      "data-persona-composer-mention-button": "",
      "aria-label": tooltipText,
      "aria-haspopup": "listbox",
      // Reflects the picker's open state: the orchestrator flips aria-expanded
      // and adds aria-controls (the menu's listbox id) via `onPickerOpenChange`
      // when this button opens/closes the picker. Starts collapsed.
      "aria-expanded": "false",
    },
    style: {
      // Appearance (bg / fg / border / radius / hover) is themed from the CSS
      // rule for `.persona-mention-button` via the `--persona-button-ghost-*`
      // tokens (components.button.ghost). Only config-driven sizing is inline.
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      fontSize: "18px",
      lineHeight: "1",
    },
  }) as HTMLButtonElement;

  const icon = renderLucideIcon(iconName, iconSize, "currentColor", 1.5);
  if (icon) button.appendChild(icon);
  else button.textContent = "+";

  button.addEventListener("click", (e) => {
    e.preventDefault();
    // Stop the click from bubbling to the composer form's "click anywhere →
    // focus textarea" handler, which would otherwise steal focus from the
    // picker's search field the moment it opens.
    e.stopPropagation();
    onOpen();
  });

  wrapper.appendChild(button);

  const tooltip = createElement("div", "persona-send-button-tooltip");
  tooltip.textContent = tooltipText;
  wrapper.appendChild(tooltip);

  return { button, wrapper };
}
