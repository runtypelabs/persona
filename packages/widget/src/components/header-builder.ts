import { createElement, createElementInDocument } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";

/** CSS `color` values; variables are set on `[data-persona-root]` from `theme.components.header`. */
export const HEADER_THEME_CSS = {
  titleColor:
    "var(--persona-header-title-fg, var(--persona-primary, #2563eb))",
  subtitleColor:
    "var(--persona-header-subtitle-fg, var(--persona-text-muted, var(--persona-muted, #9ca3af)))",
  actionIconColor:
    "var(--persona-header-action-icon-fg, var(--persona-muted, #9ca3af))",
} as const;

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
  header.style.borderBottomColor = 'var(--persona-header-border, var(--persona-divider, #f1f5f9))';
  header.style.boxShadow = 'var(--persona-header-shadow, none)';
  header.style.borderBottom = 'var(--persona-header-border-bottom, 1px solid var(--persona-header-border, var(--persona-divider, #f1f5f9)))';

  const launcher = config?.launcher ?? {};
  const headerIconSize = launcher.headerIconSize ?? "48px";
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
  const headerIconHidden = launcher.headerIconHidden ?? false;
  const headerIconName = launcher.headerIconName;

  const iconHolder = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-center persona-rounded-xl persona-text-xl"
  );
  iconHolder.style.height = headerIconSize;
  iconHolder.style.width = headerIconSize;
  iconHolder.style.backgroundColor =
    "var(--persona-header-icon-bg, var(--persona-primary, #2563eb))";
  iconHolder.style.color =
    "var(--persona-header-icon-fg, var(--persona-text-inverse, #ffffff))";

  // Render icon based on priority: Lucide icon > iconUrl > agentIconText
  if (!headerIconHidden) {
    if (headerIconName) {
      // Use Lucide icon
      const iconSize = parseFloat(headerIconSize) || 24;
      const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.6, "currentColor", 1);
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

  const headerCopy = createElement("div", "persona-flex persona-flex-col persona-flex-1 persona-min-w-0");
  const title = createElement("span", "persona-text-base persona-font-semibold");
  title.style.color = HEADER_THEME_CSS.titleColor;
  title.textContent = config?.launcher?.title ?? "Chat Assistant";
  const subtitle = createElement("span", "persona-text-xs");
  subtitle.style.color = HEADER_THEME_CSS.subtitleColor;
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
      "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
    ) as HTMLButtonElement;

    clearChatButton.style.height = clearChatSize;
    clearChatButton.style.width = clearChatSize;
    clearChatButton.type = "button";
    clearChatButton.setAttribute("aria-label", clearChatTooltipText);
    clearChatButton.style.color =
      clearChatIconColor || HEADER_THEME_CSS.actionIconColor;

    // Add icon
    const iconSvg = renderLucideIcon(clearChatIconName, "20px", "currentColor", 1);
    if (iconSvg) {
      clearChatButton.appendChild(iconSvg);
    }

    if (clearChatBgColor) {
      clearChatButton.style.backgroundColor = clearChatBgColor;
      clearChatButton.classList.remove("hover:persona-bg-gray-100");
    }

    if (clearChatBorderWidth || clearChatBorderColor) {
      const borderWidth = clearChatBorderWidth || "0px";
      const borderColor = clearChatBorderColor || "transparent";
      clearChatButton.style.border = `${borderWidth} solid ${borderColor}`;
      clearChatButton.classList.remove("persona-border-none");
    }

    if (clearChatBorderRadius) {
      clearChatButton.style.borderRadius = clearChatBorderRadius;
      clearChatButton.classList.remove("persona-rounded-full");
    }

    // Apply padding styling
    if (clearChatPaddingX) {
      clearChatButton.style.paddingLeft = clearChatPaddingX;
      clearChatButton.style.paddingRight = clearChatPaddingX;
    } else {
      clearChatButton.style.paddingLeft = "";
      clearChatButton.style.paddingRight = "";
    }
    if (clearChatPaddingY) {
      clearChatButton.style.paddingTop = clearChatPaddingY;
      clearChatButton.style.paddingBottom = clearChatPaddingY;
    } else {
      clearChatButton.style.paddingTop = "";
      clearChatButton.style.paddingBottom = "";
    }

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
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  closeButton.style.height = closeButtonSize;
  closeButton.style.width = closeButtonSize;
  closeButton.type = "button";

  // Get tooltip config
  const closeButtonTooltipText = launcher.closeButtonTooltipText ?? "Close chat";
  const closeButtonShowTooltip = launcher.closeButtonShowTooltip ?? true;

  closeButton.setAttribute("aria-label", closeButtonTooltipText);
  closeButton.style.display = showClose ? "" : "none";

  // Add icon or fallback text
  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  const closeButtonIconText = launcher.closeButtonIconText ?? "×";
  closeButton.style.color =
    launcher.closeButtonColor || HEADER_THEME_CSS.actionIconColor;

  // Try to render Lucide icon, fallback to text if not provided or fails
  const closeIconSvg = renderLucideIcon(closeButtonIconName, "20px", "currentColor", 1);
  if (closeIconSvg) {
    closeButton.appendChild(closeIconSvg);
  } else {
    closeButton.textContent = closeButtonIconText;
  }

  if (launcher.closeButtonBackgroundColor) {
    closeButton.style.backgroundColor = launcher.closeButtonBackgroundColor;
    closeButton.classList.remove("hover:persona-bg-gray-100");
  } else {
    closeButton.style.backgroundColor = "";
    closeButton.classList.add("hover:persona-bg-gray-100");
  }

  // Apply border if width and/or color are provided
  if (launcher.closeButtonBorderWidth || launcher.closeButtonBorderColor) {
    const borderWidth = launcher.closeButtonBorderWidth || "0px";
    const borderColor = launcher.closeButtonBorderColor || "transparent";
    closeButton.style.border = `${borderWidth} solid ${borderColor}`;
    closeButton.classList.remove("persona-border-none");
  } else {
    closeButton.style.border = "";
    closeButton.classList.add("persona-border-none");
  }

  if (launcher.closeButtonBorderRadius) {
    closeButton.style.borderRadius = launcher.closeButtonBorderRadius;
    closeButton.classList.remove("persona-rounded-full");
  } else {
    closeButton.style.borderRadius = "";
    closeButton.classList.add("persona-rounded-full");
  }

  // Apply padding styling
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

