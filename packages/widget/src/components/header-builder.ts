import { createElement, createElementInDocument } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import {
  AgentWidgetClearChatConfig,
  AgentWidgetConfig,
  AgentWidgetLauncherConfig
} from "../types";

export interface HeaderElements {
  header: HTMLElement;
  iconHolder: HTMLElement;
  headerTitle: HTMLElement;
  headerSubtitle: HTMLElement;
  closeButton: HTMLButtonElement;
  closeButtonWrapper: HTMLElement;
  clearChatButton: HTMLButtonElement | null;
  clearChatButtonWrapper: HTMLElement | null;
}

export interface HeaderBuildContext {
  config?: AgentWidgetConfig;
  showClose?: boolean;
  onClose?: () => void;
  onClearChat?: () => void;
}

const HEADER_ACTION_DEFAULT_TEXT_CLASS = "persona-text-persona-muted";
const HEADER_ACTION_HOVER_TEXT_CLASS = "hover:persona-text-persona-primary";
const HEADER_ACTION_HOVER_BG_CLASS = "hover:persona-bg-gray-100";
const HEADER_ACTION_BORDERLESS_CLASS = "persona-border-none";
const HEADER_ACTION_ROUNDED_CLASS = "persona-rounded-full";

const normalizeHeaderActionValue = (value?: string | null): string => {
  const trimmed = value?.trim();
  return trimmed ? trimmed : "";
};

export const renderCloseButtonIcon = (
  closeButton: HTMLButtonElement,
  launcher: Partial<AgentWidgetLauncherConfig> = {}
): void => {
  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  const closeButtonIconText = launcher.closeButtonIconText ?? "×";

  closeButton.innerHTML = "";
  const closeIconSvg = renderLucideIcon(closeButtonIconName, "20px", "currentColor", 2);
  if (closeIconSvg) {
    closeButton.appendChild(closeIconSvg);
  } else {
    closeButton.textContent = closeButtonIconText;
  }
};

export const renderClearChatButtonIcon = (
  clearChatButton: HTMLButtonElement,
  clearChatConfig: Partial<AgentWidgetClearChatConfig> = {}
): void => {
  const clearChatIconName = clearChatConfig.iconName ?? "refresh-cw";

  clearChatButton.innerHTML = "";
  const iconSvg = renderLucideIcon(clearChatIconName, "20px", "currentColor", 2);
  if (iconSvg) {
    clearChatButton.appendChild(iconSvg);
  }
};

export const applyHeaderActionColor = (
  button: HTMLButtonElement,
  color?: string | null
): void => {
  const resolvedColor = normalizeHeaderActionValue(color);
  if (resolvedColor) {
    button.style.color = resolvedColor;
    button.classList.remove(HEADER_ACTION_DEFAULT_TEXT_CLASS);
    button.classList.remove(HEADER_ACTION_HOVER_TEXT_CLASS);
    return;
  }

  button.style.color = "";
  button.classList.add(HEADER_ACTION_DEFAULT_TEXT_CLASS);
  button.classList.add(HEADER_ACTION_HOVER_TEXT_CLASS);
};

export const applyHeaderActionBackground = (
  button: HTMLButtonElement,
  backgroundColor?: string | null
): void => {
  const resolvedBackground = normalizeHeaderActionValue(backgroundColor);
  if (resolvedBackground) {
    button.style.backgroundColor = resolvedBackground;
    button.classList.remove(HEADER_ACTION_HOVER_BG_CLASS);
    return;
  }

  button.style.backgroundColor = "";
  button.classList.add(HEADER_ACTION_HOVER_BG_CLASS);
};

export const applyCloseButtonStyles = (
  closeButton: HTMLButtonElement,
  launcher: Partial<AgentWidgetLauncherConfig> = {}
): void => {
  applyHeaderActionColor(closeButton, launcher.closeButtonColor);
  applyHeaderActionBackground(closeButton, launcher.closeButtonBackgroundColor);

  if (launcher.closeButtonBorderWidth || launcher.closeButtonBorderColor) {
    const borderWidth = launcher.closeButtonBorderWidth || "0px";
    const borderColor = launcher.closeButtonBorderColor || "transparent";
    closeButton.style.border = `${borderWidth} solid ${borderColor}`;
    closeButton.classList.remove(HEADER_ACTION_BORDERLESS_CLASS);
  } else {
    closeButton.style.border = "";
    closeButton.classList.add(HEADER_ACTION_BORDERLESS_CLASS);
  }

  if (launcher.closeButtonBorderRadius) {
    closeButton.style.borderRadius = launcher.closeButtonBorderRadius;
    closeButton.classList.remove(HEADER_ACTION_ROUNDED_CLASS);
  } else {
    closeButton.style.borderRadius = "";
    closeButton.classList.add(HEADER_ACTION_ROUNDED_CLASS);
  }

  if (launcher.closeButtonPaddingX) {
    closeButton.style.paddingLeft = launcher.closeButtonPaddingX;
    closeButton.style.paddingRight = launcher.closeButtonPaddingX;
  } else {
    closeButton.style.paddingLeft = "";
    closeButton.style.paddingRight = "";
  }

  if (launcher.closeButtonPaddingY) {
    closeButton.style.paddingTop = launcher.closeButtonPaddingY;
    closeButton.style.paddingBottom = launcher.closeButtonPaddingY;
  } else {
    closeButton.style.paddingTop = "";
    closeButton.style.paddingBottom = "";
  }
};

export const applyClearChatButtonStyles = (
  clearChatButton: HTMLButtonElement,
  clearChatConfig: Partial<AgentWidgetClearChatConfig> = {}
): void => {
  applyHeaderActionColor(clearChatButton, clearChatConfig.iconColor);
  applyHeaderActionBackground(clearChatButton, clearChatConfig.backgroundColor);

  if (clearChatConfig.borderWidth || clearChatConfig.borderColor) {
    const borderWidth = clearChatConfig.borderWidth || "0px";
    const borderColor = clearChatConfig.borderColor || "transparent";
    clearChatButton.style.border = `${borderWidth} solid ${borderColor}`;
    clearChatButton.classList.remove(HEADER_ACTION_BORDERLESS_CLASS);
  } else {
    clearChatButton.style.border = "";
    clearChatButton.classList.add(HEADER_ACTION_BORDERLESS_CLASS);
  }

  if (clearChatConfig.borderRadius) {
    clearChatButton.style.borderRadius = clearChatConfig.borderRadius;
    clearChatButton.classList.remove(HEADER_ACTION_ROUNDED_CLASS);
  } else {
    clearChatButton.style.borderRadius = "";
    clearChatButton.classList.add(HEADER_ACTION_ROUNDED_CLASS);
  }

  if (clearChatConfig.paddingX) {
    clearChatButton.style.paddingLeft = clearChatConfig.paddingX;
    clearChatButton.style.paddingRight = clearChatConfig.paddingX;
  } else {
    clearChatButton.style.paddingLeft = "";
    clearChatButton.style.paddingRight = "";
  }

  if (clearChatConfig.paddingY) {
    clearChatButton.style.paddingTop = clearChatConfig.paddingY;
    clearChatButton.style.paddingBottom = clearChatConfig.paddingY;
  } else {
    clearChatButton.style.paddingTop = "";
    clearChatButton.style.paddingBottom = "";
  }
};

/**
 * Build the header section of the panel.
 * Extracted for reuse and plugin override support.
 */
export const buildHeader = (context: HeaderBuildContext): HeaderElements => {
  const { config, showClose = true } = context;

  const header = createElement(
    "div",
    "persona-widget-header persona-flex persona-items-center persona-gap-3 persona-px-6 persona-py-5"
  );
  header.setAttribute("data-persona-theme-zone", "header");
  header.style.backgroundColor = 'var(--persona-header-bg, var(--persona-surface, #ffffff))';
  header.style.borderBottomWidth = '1px';
  header.style.borderBottomStyle = 'solid';
  header.style.borderBottomColor = 'var(--persona-header-border, var(--persona-divider, #f1f5f9))';

  const launcher = config?.launcher ?? {};
  const headerIconSize = launcher.headerIconSize ?? "48px";
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
  const headerIconHidden = launcher.headerIconHidden ?? false;
  const headerIconName = launcher.headerIconName;

  const iconHolder = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-center persona-rounded-xl persona-bg-persona-primary persona-text-white persona-text-xl"
  );
  iconHolder.style.height = headerIconSize;
  iconHolder.style.width = headerIconSize;

  // Render icon based on priority: Lucide icon > iconUrl > agentIconText
  if (!headerIconHidden) {
    if (headerIconName) {
      // Use Lucide icon
      const iconSize = parseFloat(headerIconSize) || 24;
      const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.6, "var(--persona-text-inverse, #ffffff)", 1);
      if (iconSvg) {
        iconHolder.replaceChildren(iconSvg);
      } else {
        // Fallback to agentIconText if Lucide icon fails
        iconHolder.textContent = config?.launcher?.agentIconText ?? "💬";
      }
    } else if (config?.launcher?.iconUrl) {
      // Use image URL
      const img = createElement("img") as HTMLImageElement;
      img.src = config.launcher.iconUrl;
      img.alt = "";
      img.className = "persona-rounded-xl persona-object-cover";
      img.style.height = headerIconSize;
      img.style.width = headerIconSize;
      iconHolder.replaceChildren(img);
    } else {
      // Use text/emoji
      iconHolder.textContent = config?.launcher?.agentIconText ?? "💬";
    }
  }

  const headerCopy = createElement("div", "persona-flex persona-flex-col");
  const title = createElement("span", "persona-text-base persona-font-semibold");
  title.textContent = config?.launcher?.title ?? "Chat Assistant";
  const subtitle = createElement("span", "persona-text-xs persona-text-persona-muted");
  subtitle.textContent =
    config?.launcher?.subtitle ?? "Here to help you get answers fast";

  headerCopy.append(title, subtitle);

  // Only append iconHolder if not hidden
  if (!headerIconHidden) {
    header.append(iconHolder, headerCopy);
  } else {
    header.append(headerCopy);
  }

  // Create clear chat button if enabled
  const clearChatConfig = launcher.clearChat ?? {};
  const clearChatEnabled = clearChatConfig.enabled ?? true;
  const clearChatPlacement = clearChatConfig.placement ?? "inline";
  let clearChatButton: HTMLButtonElement | null = null;
  let clearChatButtonWrapper: HTMLElement | null = null;

  if (clearChatEnabled) {
    const clearChatSize = clearChatConfig.size ?? "32px";
    const clearChatTooltipText = clearChatConfig.tooltipText ?? "Clear chat";
    const clearChatShowTooltip = clearChatConfig.showTooltip ?? true;

    // Create button wrapper for tooltip - positioned based on placement
    // Note: Don't use persona-clear-chat-button-wrapper class for top-right mode as its
    // display: inline-flex causes alignment issues with the close button
    clearChatButtonWrapper = createElement(
      "div",
      clearChatPlacement === "top-right"
        ? "persona-absolute persona-top-4 persona-z-50"
        : "persona-relative persona-ml-auto persona-clear-chat-button-wrapper"
    );

    // Position to the left of the close button (which is at right: 1rem/16px)
    // Close button is ~32px wide, plus small gap = 48px from right
    if (clearChatPlacement === "top-right") {
      clearChatButtonWrapper.style.right = "48px";
    }

    clearChatButton = createElement(
      "button",
      "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-text-persona-primary hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
    ) as HTMLButtonElement;

    clearChatButton.style.height = clearChatSize;
    clearChatButton.style.width = clearChatSize;
    clearChatButton.type = "button";
    clearChatButton.setAttribute("aria-label", clearChatTooltipText);

    // Add icon
    renderClearChatButtonIcon(clearChatButton, clearChatConfig);
    applyClearChatButtonStyles(clearChatButton, clearChatConfig);

    clearChatButtonWrapper.appendChild(clearChatButton);

    // Add tooltip with portaling to document.body to escape overflow clipping
    if (
      clearChatShowTooltip &&
      clearChatTooltipText &&
      clearChatButton &&
      clearChatButtonWrapper
    ) {
      let portaledTooltip: HTMLElement | null = null;

      const showTooltip = () => {
        if (portaledTooltip || !clearChatButton) return; // Already showing or button doesn't exist

        const tooltipDocument = clearChatButton.ownerDocument;
        const tooltipContainer = tooltipDocument.body;
        if (!tooltipContainer) return;

        // Create tooltip element
        portaledTooltip = createElementInDocument(
          tooltipDocument,
          "div",
          "persona-clear-chat-tooltip"
        );
        portaledTooltip.textContent = clearChatTooltipText;

        // Add arrow
        const arrow = createElementInDocument(tooltipDocument, "div");
        arrow.className = "persona-clear-chat-tooltip-arrow";
        portaledTooltip.appendChild(arrow);

        // Get button position
        const buttonRect = clearChatButton.getBoundingClientRect();

        // Position tooltip above button
        portaledTooltip.style.position = "fixed";
        portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
        portaledTooltip.style.top = `${buttonRect.top - 8}px`;
        portaledTooltip.style.transform = "translate(-50%, -100%)";

        // Append to body
        tooltipContainer.appendChild(portaledTooltip);
      };

      const hideTooltip = () => {
        if (portaledTooltip && portaledTooltip.parentNode) {
          portaledTooltip.parentNode.removeChild(portaledTooltip);
          portaledTooltip = null;
        }
      };

      // Add event listeners
      clearChatButtonWrapper.addEventListener("mouseenter", showTooltip);
      clearChatButtonWrapper.addEventListener("mouseleave", hideTooltip);
      clearChatButton.addEventListener("focus", showTooltip);
      clearChatButton.addEventListener("blur", hideTooltip);

      // Store cleanup function on the button for later use
      (clearChatButtonWrapper as any)._cleanupTooltip = () => {
        hideTooltip();
        if (clearChatButtonWrapper) {
          clearChatButtonWrapper.removeEventListener("mouseenter", showTooltip);
          clearChatButtonWrapper.removeEventListener("mouseleave", hideTooltip);
        }
        if (clearChatButton) {
          clearChatButton.removeEventListener("focus", showTooltip);
          clearChatButton.removeEventListener("blur", hideTooltip);
        }
      };
    }

    // Only append to header if inline placement
    if (clearChatPlacement === "inline") {
      header.appendChild(clearChatButtonWrapper);
    }
  }

  // Create close button wrapper for tooltip positioning
  // Only needs ml-auto if clear chat is disabled or top-right positioned
  const closeButtonWrapper = createElement(
    "div",
    closeButtonPlacement === "top-right"
      ? "persona-absolute persona-top-4 persona-right-4 persona-z-50"
      : clearChatEnabled && clearChatPlacement === "inline"
        ? ""
        : "persona-ml-auto"
  );

  // Create close button with base classes
  const closeButton = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-text-persona-primary hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  closeButton.style.height = closeButtonSize;
  closeButton.style.width = closeButtonSize;
  closeButton.type = "button";

  // Get tooltip config
  const closeButtonTooltipText = launcher.closeButtonTooltipText ?? "Close chat";
  const closeButtonShowTooltip = launcher.closeButtonShowTooltip ?? true;

  closeButton.setAttribute("aria-label", closeButtonTooltipText);
  closeButton.style.display = showClose ? "" : "none";

  renderCloseButtonIcon(closeButton, launcher);
  applyCloseButtonStyles(closeButton, launcher);

  closeButtonWrapper.appendChild(closeButton);

  // Add tooltip with portaling to document.body to escape overflow clipping
  if (closeButtonShowTooltip && closeButtonTooltipText) {
    let portaledTooltip: HTMLElement | null = null;

    const showTooltip = () => {
      if (portaledTooltip) return; // Already showing

      const tooltipDocument = closeButton.ownerDocument;
      const tooltipContainer = tooltipDocument.body;
      if (!tooltipContainer) return;

      // Create tooltip element
      portaledTooltip = createElementInDocument(
        tooltipDocument,
        "div",
        "persona-clear-chat-tooltip"
      );
      portaledTooltip.textContent = closeButtonTooltipText;

      // Add arrow
      const arrow = createElementInDocument(tooltipDocument, "div");
      arrow.className = "persona-clear-chat-tooltip-arrow";
      portaledTooltip.appendChild(arrow);

      // Get button position
      const buttonRect = closeButton.getBoundingClientRect();

      // Position tooltip above button
      portaledTooltip.style.position = "fixed";
      portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
      portaledTooltip.style.top = `${buttonRect.top - 8}px`;
      portaledTooltip.style.transform = "translate(-50%, -100%)";

      // Append to body
      tooltipContainer.appendChild(portaledTooltip);
    };

    const hideTooltip = () => {
      if (portaledTooltip && portaledTooltip.parentNode) {
        portaledTooltip.parentNode.removeChild(portaledTooltip);
        portaledTooltip = null;
      }
    };

    // Add event listeners
    closeButtonWrapper.addEventListener("mouseenter", showTooltip);
    closeButtonWrapper.addEventListener("mouseleave", hideTooltip);
    closeButton.addEventListener("focus", showTooltip);
    closeButton.addEventListener("blur", hideTooltip);

    // Store cleanup function on the wrapper for later use
    (closeButtonWrapper as any)._cleanupTooltip = () => {
      hideTooltip();
      closeButtonWrapper.removeEventListener("mouseenter", showTooltip);
      closeButtonWrapper.removeEventListener("mouseleave", hideTooltip);
      closeButton.removeEventListener("focus", showTooltip);
      closeButton.removeEventListener("blur", hideTooltip);
    };
  }

  // Inline placement: append close button to header
  if (closeButtonPlacement !== "top-right") {
    header.appendChild(closeButtonWrapper);
  }

  return {
    header,
    iconHolder,
    headerTitle: title,
    headerSubtitle: subtitle,
    closeButton,
    closeButtonWrapper,
    clearChatButton,
    clearChatButtonWrapper
  };
};

/**
 * Attach header elements to the container, handling placement modes.
 */
export const attachHeaderToContainer = (
  container: HTMLElement,
  headerElements: HeaderElements,
  config?: AgentWidgetConfig
): void => {
  const launcher = config?.launcher ?? {};
  const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
  const clearChatPlacement = launcher.clearChat?.placement ?? "inline";

  // Add header to container
  container.appendChild(headerElements.header);

  // Position close button wrapper if top-right placement
  if (closeButtonPlacement === "top-right") {
    container.style.position = "relative";
    container.appendChild(headerElements.closeButtonWrapper);
  }

  // Position clear chat button wrapper if top-right placement
  if (
    headerElements.clearChatButtonWrapper &&
    clearChatPlacement === "top-right"
  ) {
    container.style.position = "relative";
    container.appendChild(headerElements.clearChatButtonWrapper);
  }
};

