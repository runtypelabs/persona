import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";

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
    "tvw-widget-header tvw-flex tvw-items-center tvw-gap-3 tvw-bg-cw-surface tvw-px-6 tvw-py-5 tvw-border-b-cw-divider"
  );

  const launcher = config?.launcher ?? {};
  const headerIconSize = launcher.headerIconSize ?? "48px";
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
  const headerIconHidden = launcher.headerIconHidden ?? false;
  const headerIconName = launcher.headerIconName;

  const iconHolder = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-justify-center tvw-rounded-xl tvw-bg-cw-primary tvw-text-white tvw-text-xl"
  );
  iconHolder.style.height = headerIconSize;
  iconHolder.style.width = headerIconSize;

  // Render icon based on priority: Lucide icon > iconUrl > agentIconText
  if (!headerIconHidden) {
    if (headerIconName) {
      // Use Lucide icon
      const iconSize = parseFloat(headerIconSize) || 24;
      const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.6, "#ffffff", 2);
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
      img.className = "tvw-rounded-xl tvw-object-cover";
      img.style.height = headerIconSize;
      img.style.width = headerIconSize;
      iconHolder.replaceChildren(img);
    } else {
      // Use text/emoji
      iconHolder.textContent = config?.launcher?.agentIconText ?? "💬";
    }
  }

  const headerCopy = createElement("div", "tvw-flex tvw-flex-col");
  const title = createElement("span", "tvw-text-base tvw-font-semibold");
  title.textContent = config?.launcher?.title ?? "Chat Assistant";
  const subtitle = createElement("span", "tvw-text-xs tvw-text-cw-muted");
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
    // Note: Don't use tvw-clear-chat-button-wrapper class for top-right mode as its
    // display: inline-flex causes alignment issues with the close button
    clearChatButtonWrapper = createElement(
      "div",
      clearChatPlacement === "top-right"
        ? "tvw-absolute tvw-top-4 tvw-z-50"
        : "tvw-relative tvw-ml-auto tvw-clear-chat-button-wrapper"
    );

    // Position to the left of the close button (which is at right: 1rem/16px)
    // Close button is ~32px wide, plus small gap = 48px from right
    if (clearChatPlacement === "top-right") {
      clearChatButtonWrapper.style.right = "48px";
    }

    clearChatButton = createElement(
      "button",
      "tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded-full tvw-text-cw-muted hover:tvw-bg-gray-100 tvw-cursor-pointer tvw-border-none"
    ) as HTMLButtonElement;

    clearChatButton.style.height = clearChatSize;
    clearChatButton.style.width = clearChatSize;
    clearChatButton.type = "button";
    clearChatButton.setAttribute("aria-label", clearChatTooltipText);

    // Add icon
    const iconSvg = renderLucideIcon(
      clearChatIconName,
      "20px",
      clearChatIconColor || "",
      2
    );
    if (iconSvg) {
      clearChatButton.appendChild(iconSvg);
    }

    // Apply styling from config
    if (clearChatIconColor) {
      clearChatButton.style.color = clearChatIconColor;
      clearChatButton.classList.remove("tvw-text-cw-muted");
    }

    if (clearChatBgColor) {
      clearChatButton.style.backgroundColor = clearChatBgColor;
      clearChatButton.classList.remove("hover:tvw-bg-gray-100");
    }

    if (clearChatBorderWidth || clearChatBorderColor) {
      const borderWidth = clearChatBorderWidth || "0px";
      const borderColor = clearChatBorderColor || "transparent";
      clearChatButton.style.border = `${borderWidth} solid ${borderColor}`;
      clearChatButton.classList.remove("tvw-border-none");
    }

    if (clearChatBorderRadius) {
      clearChatButton.style.borderRadius = clearChatBorderRadius;
      clearChatButton.classList.remove("tvw-rounded-full");
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

        // Create tooltip element
        portaledTooltip = createElement("div", "tvw-clear-chat-tooltip");
        portaledTooltip.textContent = clearChatTooltipText;

        // Add arrow
        const arrow = createElement("div");
        arrow.className = "tvw-clear-chat-tooltip-arrow";
        portaledTooltip.appendChild(arrow);

        // Get button position
        const buttonRect = clearChatButton.getBoundingClientRect();

        // Position tooltip above button
        portaledTooltip.style.position = "fixed";
        portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
        portaledTooltip.style.top = `${buttonRect.top - 8}px`;
        portaledTooltip.style.transform = "translate(-50%, -100%)";

        // Append to body
        document.body.appendChild(portaledTooltip);
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
      ? "tvw-absolute tvw-top-4 tvw-right-4 tvw-z-50"
      : clearChatEnabled && clearChatPlacement === "inline"
        ? ""
        : "tvw-ml-auto"
  );

  // Create close button with base classes
  const closeButton = createElement(
    "button",
    "tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded-full tvw-text-cw-muted hover:tvw-bg-gray-100 tvw-cursor-pointer tvw-border-none"
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

  // Try to render Lucide icon, fallback to text if not provided or fails
  const closeIconSvg = renderLucideIcon(
    closeButtonIconName,
    "20px",
    launcher.closeButtonColor || "",
    2
  );
  if (closeIconSvg) {
    closeButton.appendChild(closeIconSvg);
  } else {
    closeButton.textContent = closeButtonIconText;
  }

  // Apply close button styling from config
  if (launcher.closeButtonColor) {
    closeButton.style.color = launcher.closeButtonColor;
    closeButton.classList.remove("tvw-text-cw-muted");
  } else {
    closeButton.style.color = "";
    closeButton.classList.add("tvw-text-cw-muted");
  }

  if (launcher.closeButtonBackgroundColor) {
    closeButton.style.backgroundColor = launcher.closeButtonBackgroundColor;
    closeButton.classList.remove("hover:tvw-bg-gray-100");
  } else {
    closeButton.style.backgroundColor = "";
    closeButton.classList.add("hover:tvw-bg-gray-100");
  }

  // Apply border if width and/or color are provided
  if (launcher.closeButtonBorderWidth || launcher.closeButtonBorderColor) {
    const borderWidth = launcher.closeButtonBorderWidth || "0px";
    const borderColor = launcher.closeButtonBorderColor || "transparent";
    closeButton.style.border = `${borderWidth} solid ${borderColor}`;
    closeButton.classList.remove("tvw-border-none");
  } else {
    closeButton.style.border = "";
    closeButton.classList.add("tvw-border-none");
  }

  if (launcher.closeButtonBorderRadius) {
    closeButton.style.borderRadius = launcher.closeButtonBorderRadius;
    closeButton.classList.remove("tvw-rounded-full");
  } else {
    closeButton.style.borderRadius = "";
    closeButton.classList.add("tvw-rounded-full");
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

      // Create tooltip element
      portaledTooltip = createElement("div", "tvw-clear-chat-tooltip");
      portaledTooltip.textContent = closeButtonTooltipText;

      // Add arrow
      const arrow = createElement("div");
      arrow.className = "tvw-clear-chat-tooltip-arrow";
      portaledTooltip.appendChild(arrow);

      // Get button position
      const buttonRect = closeButton.getBoundingClientRect();

      // Position tooltip above button
      portaledTooltip.style.position = "fixed";
      portaledTooltip.style.left = `${buttonRect.left + buttonRect.width / 2}px`;
      portaledTooltip.style.top = `${buttonRect.top - 8}px`;
      portaledTooltip.style.transform = "translate(-50%, -100%)";

      // Append to body
      document.body.appendChild(portaledTooltip);
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


