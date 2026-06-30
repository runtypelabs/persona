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
  const iconName = config.buttonIconName ?? "at-sign";
  const tooltipText = config.buttonTooltipText ?? "Add context";

  const wrapper = createElement("div", "persona-send-button-wrapper");
  const button = createNode("button", {
    className:
      "persona-rounded-button persona-flex persona-items-center persona-justify-center disabled:persona-opacity-50 persona-cursor-pointer persona-mention-button",
    attrs: {
      type: "button",
      "data-persona-composer-mention-button": "",
      "aria-label": tooltipText,
      // The composer textarea carries the live aria-expanded/aria-controls
      // state (set by the controller); the button only advertises the popup.
      "aria-haspopup": "listbox",
    },
    style: {
      width: size,
      height: size,
      minWidth: size,
      minHeight: size,
      fontSize: "18px",
      lineHeight: "1",
      backgroundColor: "transparent",
      color: "var(--persona-primary, #111827)",
      border: "none",
      borderRadius: "6px",
      transition: "background-color 0.15s ease",
    },
  }) as HTMLButtonElement;

  button.addEventListener("mouseenter", () => {
    button.style.backgroundColor =
      "var(--persona-palette-colors-black-alpha-50, rgba(0, 0, 0, 0.05))";
  });
  button.addEventListener("mouseleave", () => {
    button.style.backgroundColor = "transparent";
  });

  const icon = renderLucideIcon(iconName, iconSize, "currentColor", 1.5);
  if (icon) button.appendChild(icon);
  else button.textContent = "@";

  button.addEventListener("click", (e) => {
    e.preventDefault();
    onOpen();
  });

  wrapper.appendChild(button);

  const tooltip = createElement("div", "persona-send-button-tooltip");
  tooltip.textContent = tooltipText;
  wrapper.appendChild(tooltip);

  return { button, wrapper };
}
