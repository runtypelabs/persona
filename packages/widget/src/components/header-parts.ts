import { createElement, createElementInDocument } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";
import { PORTALED_OVERLAY_Z_INDEX } from "../utils/constants";
import { HEADER_THEME_CSS } from "./header-builder";

export interface CloseButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

export interface ClearChatButtonParts {
  button: HTMLButtonElement;
  wrapper: HTMLElement;
}

export interface CreateCloseButtonOptions {
  showClose?: boolean;
  /**
   * Override the wrapper className. The full header passes its own
   * placement-aware class string; composer-bar mode passes a class that
   * positions the wrapper absolutely in the top-right of the panel chrome.
   */
  wrapperClassName?: string;
  /**
   * Explicit button-size override that wins over `launcher.closeButtonSize`.
   * Use when the call site has its own opinion about the size that should
   * take precedence over the global launcher config — e.g. composer-bar's
   * minimal close icon, where size is part of the mode's UX, not something
   * that should inherit from the floating launcher's button size.
   */
  buttonSize?: string;
  /**
   * Override the rendered icon size (default: "28px"). Pair with
   * `buttonSize` when scaling the whole control down — otherwise the
   * 28px icon will overflow a smaller button.
   */
  iconSize?: string;
}

export interface CreateClearChatButtonOptions {
  /**
   * Override the wrapper className. Header builder passes its own
   * placement-aware class string; composer-bar mode passes a class that
   * positions the wrapper absolutely (next to the close button).
   */
  wrapperClassName?: string;
  /**
   * Explicit button-size override that wins over `launcher.clearChat.size`.
   * Composer-bar mode uses this so the clear icon visually matches the
   * shrunken close button (16px) and doesn't render at the floating
   * launcher's 32px default.
   */
  buttonSize?: string;
  /** Override the rendered icon size (default: "20px"). */
  iconSize?: string;
}

const DEFAULT_WRAPPER_CLASS =
  "persona-relative persona-ml-auto persona-inline-flex persona-items-center persona-justify-center";

/**
 * Build the close (×) button + tooltip used in the panel header. Lifted
 * verbatim from header-builder.ts so composer-bar mode can render just a
 * close button (no full header strip) without duplicating the tooltip
 * + config-driven styling logic.
 */
export const createCloseButton = (
  config: AgentWidgetConfig | undefined,
  options: CreateCloseButtonOptions = {},
): CloseButtonParts => {
  const {
    showClose = true,
    wrapperClassName = DEFAULT_WRAPPER_CLASS,
    buttonSize,
    iconSize = "28px",
  } = options;
  const launcher = config?.launcher ?? {};
  // Call-site `buttonSize` (if provided) wins over launcher config. The
  // launcher's `closeButtonSize` is set in DEFAULT_WIDGET_CONFIG so it's
  // never undefined, which means the call-site override is the only way
  // to opt a specific render path (like composer-bar's minimal close) into
  // a different size.
  const closeButtonSize = buttonSize ?? launcher.closeButtonSize ?? "32px";

  const wrapper = createElement("div", wrapperClassName);

  const button = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  button.style.height = closeButtonSize;
  button.style.width = closeButtonSize;
  button.type = "button";

  const closeButtonTooltipText = launcher.closeButtonTooltipText ?? "Close chat";
  const closeButtonShowTooltip = launcher.closeButtonShowTooltip ?? true;

  button.setAttribute("aria-label", closeButtonTooltipText);
  button.style.display = showClose ? "" : "none";

  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  const closeButtonIconText = launcher.closeButtonIconText ?? "×";
  button.style.color =
    launcher.closeButtonColor || HEADER_THEME_CSS.actionIconColor;

  // The X glyph's paths occupy only the middle 50% of its 24x24 viewBox
  // (from 6,6 to 18,18), while other header icons (e.g. refresh-cw) span
  // ~75% of the viewBox. Rendering X at a larger intrinsic size brings
  // its visible extent into parity with sibling icons in the header.
  // display:block eliminates inline-baseline spacing that can push the
  // icon a fractional pixel off-center inside the button.
  const closeIconSvg = renderLucideIcon(closeButtonIconName, iconSize, "currentColor", 1);
  if (closeIconSvg) {
    closeIconSvg.style.display = "block";
    button.appendChild(closeIconSvg);
  } else {
    button.textContent = closeButtonIconText;
  }

  if (launcher.closeButtonBackgroundColor) {
    button.style.backgroundColor = launcher.closeButtonBackgroundColor;
    button.classList.remove("hover:persona-bg-gray-100");
  } else {
    button.style.backgroundColor = "";
    button.classList.add("hover:persona-bg-gray-100");
  }

  if (launcher.closeButtonBorderWidth || launcher.closeButtonBorderColor) {
    const borderWidth = launcher.closeButtonBorderWidth || "0px";
    const borderColor = launcher.closeButtonBorderColor || "transparent";
    button.style.border = `${borderWidth} solid ${borderColor}`;
    button.classList.remove("persona-border-none");
  } else {
    button.style.border = "";
    button.classList.add("persona-border-none");
  }

  if (launcher.closeButtonBorderRadius) {
    button.style.borderRadius = launcher.closeButtonBorderRadius;
    button.classList.remove("persona-rounded-full");
  } else {
    button.style.borderRadius = "";
    button.classList.add("persona-rounded-full");
  }

  if (launcher.closeButtonPaddingX) {
    button.style.paddingLeft = launcher.closeButtonPaddingX;
    button.style.paddingRight = launcher.closeButtonPaddingX;
  } else {
    button.style.paddingLeft = "";
    button.style.paddingRight = "";
  }
  if (launcher.closeButtonPaddingY) {
    button.style.paddingTop = launcher.closeButtonPaddingY;
    button.style.paddingBottom = launcher.closeButtonPaddingY;
  } else {
    button.style.paddingTop = "";
    button.style.paddingBottom = "";
  }

  wrapper.appendChild(button);

  if (closeButtonShowTooltip && closeButtonTooltipText) {
    let portaledTooltip: HTMLElement | null = null;

    const showTooltip = () => {
      if (portaledTooltip) return;

      const tooltipDocument = button.ownerDocument;
      const tooltipContainer = tooltipDocument.body;
      if (!tooltipContainer) return;

      portaledTooltip = createElementInDocument(
        tooltipDocument,
        "div",
        "persona-clear-chat-tooltip"
      );
      portaledTooltip.textContent = closeButtonTooltipText;

      const arrow = createElementInDocument(tooltipDocument, "div");
      arrow.className = "persona-clear-chat-tooltip-arrow";
      portaledTooltip.appendChild(arrow);

      const buttonRect = button.getBoundingClientRect();

      portaledTooltip.style.position = "fixed";
      portaledTooltip.style.zIndex = String(PORTALED_OVERLAY_Z_INDEX);
      portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
      portaledTooltip.style.top = `${buttonRect.top - 8}px`;
      portaledTooltip.style.transform = "translate(-50%, -100%)";

      tooltipContainer.appendChild(portaledTooltip);
    };

    const hideTooltip = () => {
      if (portaledTooltip && portaledTooltip.parentNode) {
        portaledTooltip.parentNode.removeChild(portaledTooltip);
        portaledTooltip = null;
      }
    };

    wrapper.addEventListener("mouseenter", showTooltip);
    wrapper.addEventListener("mouseleave", hideTooltip);
    button.addEventListener("focus", showTooltip);
    button.addEventListener("blur", hideTooltip);

    (wrapper as any)._cleanupTooltip = () => {
      hideTooltip();
      wrapper.removeEventListener("mouseenter", showTooltip);
      wrapper.removeEventListener("mouseleave", hideTooltip);
      button.removeEventListener("focus", showTooltip);
      button.removeEventListener("blur", hideTooltip);
    };
  }

  return { button, wrapper };
};

const DEFAULT_CLEAR_CHAT_WRAPPER_CLASS =
  "persona-relative persona-ml-auto persona-clear-chat-button-wrapper";

/**
 * Build the clear-chat (refresh) button + tooltip used in the panel header.
 * Extracted from `header-builder.ts` so composer-bar mode can render a
 * "start over" button alongside its close icon without duplicating the
 * tooltip + config-driven styling logic.
 *
 * The factory only handles construction. Wiring the click to the
 * clear-history handler is owned by `setupClearChatButton()` in `ui.ts`,
 * which keys off `panelElements.clearChatButton`.
 */
export const createClearChatButton = (
  config: AgentWidgetConfig | undefined,
  options: CreateClearChatButtonOptions = {},
): ClearChatButtonParts => {
  const {
    wrapperClassName = DEFAULT_CLEAR_CHAT_WRAPPER_CLASS,
    buttonSize,
    iconSize = "20px",
  } = options;

  const launcher = config?.launcher ?? {};
  const clearChatConfig = launcher.clearChat ?? {};
  // Call-site `buttonSize` (when provided) wins over launcher.clearChat.size.
  // Same precedence rule as createCloseButton: callers like composer-bar
  // intentionally override the inherited launcher default to fit their UX.
  const clearChatSize = buttonSize ?? clearChatConfig.size ?? "32px";
  const clearChatIconName = clearChatConfig.iconName ?? "refresh-cw";
  const clearChatIconColor = clearChatConfig.iconColor ?? "";
  const clearChatBgColor = clearChatConfig.backgroundColor ?? "";
  const clearChatBorderWidth = clearChatConfig.borderWidth ?? "";
  const clearChatBorderColor = clearChatConfig.borderColor ?? "";
  const clearChatBorderRadius = clearChatConfig.borderRadius ?? "";
  const clearChatPaddingX = clearChatConfig.paddingX ?? "";
  const clearChatPaddingY = clearChatConfig.paddingY ?? "";
  const clearChatTooltipText = clearChatConfig.tooltipText ?? "Clear chat";
  const clearChatShowTooltip = clearChatConfig.showTooltip ?? true;

  const wrapper = createElement("div", wrapperClassName);

  const button = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  button.style.height = clearChatSize;
  button.style.width = clearChatSize;
  button.type = "button";
  button.setAttribute("aria-label", clearChatTooltipText);
  button.style.color = clearChatIconColor || HEADER_THEME_CSS.actionIconColor;

  const iconSvg = renderLucideIcon(clearChatIconName, iconSize, "currentColor", 1);
  if (iconSvg) {
    iconSvg.style.display = "block";
    button.appendChild(iconSvg);
  }

  if (clearChatBgColor) {
    button.style.backgroundColor = clearChatBgColor;
    button.classList.remove("hover:persona-bg-gray-100");
  }

  if (clearChatBorderWidth || clearChatBorderColor) {
    const borderWidth = clearChatBorderWidth || "0px";
    const borderColor = clearChatBorderColor || "transparent";
    button.style.border = `${borderWidth} solid ${borderColor}`;
    button.classList.remove("persona-border-none");
  }

  if (clearChatBorderRadius) {
    button.style.borderRadius = clearChatBorderRadius;
    button.classList.remove("persona-rounded-full");
  }

  if (clearChatPaddingX) {
    button.style.paddingLeft = clearChatPaddingX;
    button.style.paddingRight = clearChatPaddingX;
  }
  if (clearChatPaddingY) {
    button.style.paddingTop = clearChatPaddingY;
    button.style.paddingBottom = clearChatPaddingY;
  }

  wrapper.appendChild(button);

  if (clearChatShowTooltip && clearChatTooltipText) {
    let portaledTooltip: HTMLElement | null = null;

    const showTooltip = () => {
      if (portaledTooltip) return;

      const tooltipDocument = button.ownerDocument;
      const tooltipContainer = tooltipDocument.body;
      if (!tooltipContainer) return;

      portaledTooltip = createElementInDocument(
        tooltipDocument,
        "div",
        "persona-clear-chat-tooltip"
      );
      portaledTooltip.textContent = clearChatTooltipText;

      const arrow = createElementInDocument(tooltipDocument, "div");
      arrow.className = "persona-clear-chat-tooltip-arrow";
      portaledTooltip.appendChild(arrow);

      const buttonRect = button.getBoundingClientRect();

      portaledTooltip.style.position = "fixed";
      portaledTooltip.style.zIndex = String(PORTALED_OVERLAY_Z_INDEX);
      portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
      portaledTooltip.style.top = `${buttonRect.top - 8}px`;
      portaledTooltip.style.transform = "translate(-50%, -100%)";

      tooltipContainer.appendChild(portaledTooltip);
    };

    const hideTooltip = () => {
      if (portaledTooltip && portaledTooltip.parentNode) {
        portaledTooltip.parentNode.removeChild(portaledTooltip);
        portaledTooltip = null;
      }
    };

    wrapper.addEventListener("mouseenter", showTooltip);
    wrapper.addEventListener("mouseleave", hideTooltip);
    button.addEventListener("focus", showTooltip);
    button.addEventListener("blur", hideTooltip);

    (wrapper as any)._cleanupTooltip = () => {
      hideTooltip();
      wrapper.removeEventListener("mouseenter", showTooltip);
      wrapper.removeEventListener("mouseleave", hideTooltip);
      button.removeEventListener("focus", showTooltip);
      button.removeEventListener("blur", hideTooltip);
    };
  }

  return { button, wrapper };
};
