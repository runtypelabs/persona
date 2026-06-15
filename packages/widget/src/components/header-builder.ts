import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig } from "../types";
import { createCloseButton, createClearChatButton } from "./header-parts";

/** CSS `color` values; variables are set on `[data-persona-root]` from `theme.components.header`. */
export const HEADER_THEME_CSS = {
  titleColor:
    "var(--persona-header-title-fg, var(--persona-primary, #0f0f0f))",
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

  const header = createNode("div", {
    className:
      "persona-widget-header persona-flex persona-items-center persona-gap-3 persona-px-6 persona-py-5",
    attrs: { "data-persona-theme-zone": "header" },
    style: {
      backgroundColor: "var(--persona-header-bg, var(--persona-surface, #ffffff))",
      borderBottomColor: "var(--persona-header-border, var(--persona-divider, #f1f5f9))",
      boxShadow: "var(--persona-header-shadow, none)",
      borderBottom:
        "var(--persona-header-border-bottom, 1px solid var(--persona-header-border, var(--persona-divider, #f1f5f9)))",
    },
  });

  const launcher = config?.launcher ?? {};
  const headerIconSize = launcher.headerIconSize ?? "48px";
  const closeButtonPlacement = launcher.closeButtonPlacement ?? "inline";
  const headerIconHidden = launcher.headerIconHidden ?? false;
  const headerIconName = launcher.headerIconName;

  const iconHolder = createNode("div", {
    className:
      "persona-flex persona-items-center persona-justify-center persona-rounded-xl persona-text-xl",
    style: {
      height: headerIconSize,
      width: headerIconSize,
      backgroundColor: "var(--persona-header-icon-bg, var(--persona-primary, #0f0f0f))",
      color: "var(--persona-header-icon-fg, var(--persona-text-inverse, #ffffff))",
    },
  });

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
  const title = createNode("span", {
    className: "persona-text-base persona-font-semibold",
    text: config?.launcher?.title ?? "Chat Assistant",
    style: { color: HEADER_THEME_CSS.titleColor },
  });
  const subtitle = createNode("span", {
    className: "persona-text-xs",
    text: config?.launcher?.subtitle ?? "Here to help you get answers fast",
    style: { color: HEADER_THEME_CSS.subtitleColor },
  });

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
    // Top-right placement uses an absolute wrapper offset from the close
    // button (which lives at right: 16px and is ~32px wide, leaving ~48px
    // from the panel's right edge for the clear icon).
    const wrapperClassName =
      clearChatPlacement === "top-right"
        ? "persona-absolute persona-top-4 persona-z-50"
        : "persona-relative persona-ml-auto persona-clear-chat-button-wrapper";

    const parts = createClearChatButton(config, { wrapperClassName });
    clearChatButton = parts.button;
    clearChatButtonWrapper = parts.wrapper;

    if (clearChatPlacement === "top-right") {
      clearChatButtonWrapper.style.right = "48px";
    }

    // Only append to header if inline placement
    if (clearChatPlacement === "inline") {
      header.appendChild(clearChatButtonWrapper);
    }
  }

  // Build the close (×) button via the shared factory. The wrapper class
  // mirrors the clear-chat wrapper's inline-flex centering so both header
  // action buttons vertically align identically within the header's flex
  // row. composer-bar mode uses the same factory directly with its own
  // wrapper class to render a top-right-only close button.
  const closeButtonWrapperClass =
    closeButtonPlacement === "top-right"
      ? "persona-absolute persona-top-4 persona-right-4 persona-z-50"
      : clearChatEnabled && clearChatPlacement === "inline"
        ? "persona-relative persona-inline-flex persona-items-center persona-justify-center"
        : "persona-relative persona-ml-auto persona-inline-flex persona-items-center persona-justify-center";

  const { button: closeButton, wrapper: closeButtonWrapper } = createCloseButton(
    config,
    { showClose, wrapperClassName: closeButtonWrapperClass }
  );

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

