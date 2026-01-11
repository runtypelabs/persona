import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig, AgentWidgetHeaderLayoutConfig } from "../types";
import { buildHeader, HeaderElements, attachHeaderToContainer } from "./header-builder";

export interface HeaderLayoutContext {
  config: AgentWidgetConfig;
  showClose?: boolean;
  onClose?: () => void;
  onClearChat?: () => void;
}

export type HeaderLayoutRenderer = (context: HeaderLayoutContext) => HeaderElements;

/**
 * Build default header layout
 * Full header with icon, title, subtitle, clear chat, and close button
 */
export const buildDefaultHeader: HeaderLayoutRenderer = (context) => {
  return buildHeader({
    config: context.config,
    showClose: context.showClose,
    onClose: context.onClose,
    onClearChat: context.onClearChat
  });
};

/**
 * Build minimal header layout
 * Simplified layout with just title and close button
 */
export const buildMinimalHeader: HeaderLayoutRenderer = (context) => {
  const { config, showClose = true, onClose } = context;
  const launcher = config?.launcher ?? {};

  const header = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-justify-between tvw-bg-cw-surface tvw-px-6 tvw-py-4 tvw-border-b-cw-divider"
  );

  // Title only (no icon, no subtitle)
  const title = createElement("span", "tvw-text-base tvw-font-semibold");
  title.textContent = launcher.title ?? "Chat Assistant";

  header.appendChild(title);

  // Close button
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonWrapper = createElement("div", "");

  const closeButton = createElement(
    "button",
    "tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded-full tvw-text-cw-muted hover:tvw-bg-gray-100 tvw-cursor-pointer tvw-border-none"
  ) as HTMLButtonElement;
  closeButton.style.height = closeButtonSize;
  closeButton.style.width = closeButtonSize;
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close chat");
  closeButton.style.display = showClose ? "" : "none";

  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  const closeIconSvg = renderLucideIcon(
    closeButtonIconName,
    "20px",
    launcher.closeButtonColor || "",
    2
  );
  if (closeIconSvg) {
    closeButton.appendChild(closeIconSvg);
  } else {
    closeButton.textContent = "×";
  }

  if (onClose) {
    closeButton.addEventListener("click", onClose);
  }

  closeButtonWrapper.appendChild(closeButton);
  header.appendChild(closeButtonWrapper);

  // Create placeholder elements for compatibility
  const iconHolder = createElement("div");
  iconHolder.style.display = "none";
  const headerSubtitle = createElement("span");
  headerSubtitle.style.display = "none";

  return {
    header,
    iconHolder,
    headerTitle: title,
    headerSubtitle,
    closeButton,
    closeButtonWrapper,
    clearChatButton: null,
    clearChatButtonWrapper: null
  };
};

/**
 * Build expanded header layout
 * Full branding area with additional space for custom content
 */
export const buildExpandedHeader: HeaderLayoutRenderer = (context) => {
  const { config, showClose = true, onClose, onClearChat } = context;
  const launcher = config?.launcher ?? {};

  const header = createElement(
    "div",
    "tvw-flex tvw-flex-col tvw-bg-cw-surface tvw-px-6 tvw-py-5 tvw-border-b-cw-divider"
  );

  // Top row: icon + text + buttons
  const topRow = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-gap-3"
  );

  // Icon
  const headerIconSize = launcher.headerIconSize ?? "56px";
  const iconHolder = createElement(
    "div",
    "tvw-flex tvw-items-center tvw-justify-center tvw-rounded-xl tvw-bg-cw-primary tvw-text-white tvw-text-2xl"
  );
  iconHolder.style.height = headerIconSize;
  iconHolder.style.width = headerIconSize;

  const headerIconName = launcher.headerIconName;
  if (headerIconName) {
    const iconSize = parseFloat(headerIconSize) || 24;
    const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.5, "#ffffff", 2);
    if (iconSvg) {
      iconHolder.replaceChildren(iconSvg);
    } else {
      iconHolder.textContent = launcher.agentIconText ?? "💬";
    }
  } else if (launcher.iconUrl) {
    const img = createElement("img") as HTMLImageElement;
    img.src = launcher.iconUrl;
    img.alt = "";
    img.className = "tvw-rounded-xl tvw-object-cover";
    img.style.height = headerIconSize;
    img.style.width = headerIconSize;
    iconHolder.replaceChildren(img);
  } else {
    iconHolder.textContent = launcher.agentIconText ?? "💬";
  }

  // Title and subtitle
  const headerCopy = createElement("div", "tvw-flex tvw-flex-col tvw-flex-1");
  const title = createElement("span", "tvw-text-lg tvw-font-semibold");
  title.textContent = launcher.title ?? "Chat Assistant";
  const subtitle = createElement("span", "tvw-text-sm tvw-text-cw-muted");
  subtitle.textContent = launcher.subtitle ?? "Here to help you get answers fast";
  headerCopy.append(title, subtitle);

  topRow.append(iconHolder, headerCopy);

  // Close button
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonWrapper = createElement("div", "");

  const closeButton = createElement(
    "button",
    "tvw-inline-flex tvw-items-center tvw-justify-center tvw-rounded-full tvw-text-cw-muted hover:tvw-bg-gray-100 tvw-cursor-pointer tvw-border-none"
  ) as HTMLButtonElement;
  closeButton.style.height = closeButtonSize;
  closeButton.style.width = closeButtonSize;
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close chat");
  closeButton.style.display = showClose ? "" : "none";

  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  const closeIconSvg = renderLucideIcon(
    closeButtonIconName,
    "20px",
    launcher.closeButtonColor || "",
    2
  );
  if (closeIconSvg) {
    closeButton.appendChild(closeIconSvg);
  } else {
    closeButton.textContent = "×";
  }

  if (onClose) {
    closeButton.addEventListener("click", onClose);
  }

  closeButtonWrapper.appendChild(closeButton);
  topRow.appendChild(closeButtonWrapper);

  header.appendChild(topRow);

  // Bottom row: additional space for status or branding
  const bottomRow = createElement(
    "div",
    "tvw-mt-3 tvw-pt-3 tvw-border-t tvw-border-gray-100 tvw-text-xs tvw-text-cw-muted"
  );
  bottomRow.textContent = "Online and ready to help";
  header.appendChild(bottomRow);

  return {
    header,
    iconHolder,
    headerTitle: title,
    headerSubtitle: subtitle,
    closeButton,
    closeButtonWrapper,
    clearChatButton: null,
    clearChatButtonWrapper: null
  };
};

/**
 * Header layout registry
 * Maps layout names to their renderer functions
 */
export const headerLayouts: Record<string, HeaderLayoutRenderer> = {
  default: buildDefaultHeader,
  minimal: buildMinimalHeader,
  expanded: buildExpandedHeader
};

/**
 * Get header layout renderer by name
 */
export const getHeaderLayout = (layoutName: string): HeaderLayoutRenderer => {
  return headerLayouts[layoutName] ?? headerLayouts.default;
};

/**
 * Build header based on layout configuration
 * Applies layout config settings to determine which layout to use
 */
export const buildHeaderWithLayout = (
  config: AgentWidgetConfig,
  layoutConfig?: AgentWidgetHeaderLayoutConfig,
  context?: Partial<HeaderLayoutContext>
): HeaderElements => {
  // If custom render is provided, use it
  if (layoutConfig?.render) {
    const customHeader = layoutConfig.render({
      config,
      onClose: context?.onClose,
      onClearChat: context?.onClearChat
    });
    
    // Wrap in HeaderElements structure
    const iconHolder = createElement("div");
    iconHolder.style.display = "none";
    const headerTitle = createElement("span");
    const headerSubtitle = createElement("span");
    const closeButton = createElement("button") as HTMLButtonElement;
    closeButton.style.display = "none";
    const closeButtonWrapper = createElement("div");
    closeButtonWrapper.style.display = "none";
    
    return {
      header: customHeader,
      iconHolder,
      headerTitle,
      headerSubtitle,
      closeButton,
      closeButtonWrapper,
      clearChatButton: null,
      clearChatButtonWrapper: null
    };
  }

  // Get layout renderer
  const layoutName = layoutConfig?.layout ?? "default";
  const layoutRenderer = getHeaderLayout(layoutName);

  // Build header with layout
  const headerElements = layoutRenderer({
    config,
    showClose: layoutConfig?.showCloseButton ?? context?.showClose ?? true,
    onClose: context?.onClose,
    onClearChat: context?.onClearChat
  });

  // Apply visibility settings from layout config
  if (layoutConfig) {
    if (layoutConfig.showIcon === false) {
      headerElements.iconHolder.style.display = "none";
    }
    if (layoutConfig.showTitle === false) {
      headerElements.headerTitle.style.display = "none";
    }
    if (layoutConfig.showSubtitle === false) {
      headerElements.headerSubtitle.style.display = "none";
    }
    if (layoutConfig.showCloseButton === false) {
      headerElements.closeButton.style.display = "none";
    }
    if (layoutConfig.showClearChat === false && headerElements.clearChatButtonWrapper) {
      headerElements.clearChatButtonWrapper.style.display = "none";
    }
  }

  return headerElements;
};

