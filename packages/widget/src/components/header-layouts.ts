import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig, AgentWidgetHeaderLayoutConfig } from "../types";
import { buildHeader, HeaderElements, attachHeaderToContainer as _attachHeaderToContainer } from "./header-builder";

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
    "persona-flex persona-items-center persona-justify-between persona-bg-persona-surface persona-px-6 persona-py-4 persona-border-b-persona-divider"
  );

  // Title only (no icon, no subtitle)
  const title = createElement("span", "persona-text-base persona-font-semibold");
  title.textContent = launcher.title ?? "Chat Assistant";

  header.appendChild(title);

  // Close button
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonWrapper = createElement("div", "");

  const closeButton = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
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
  const { config, showClose = true, onClose, onClearChat: _onClearChat } = context;
  const launcher = config?.launcher ?? {};

  const header = createElement(
    "div",
    "persona-flex persona-flex-col persona-bg-persona-surface persona-px-6 persona-py-5 persona-border-b-persona-divider"
  );

  // Top row: icon + text + buttons
  const topRow = createElement(
    "div",
    "persona-flex persona-items-center persona-gap-3"
  );

  // Icon
  const headerIconSize = launcher.headerIconSize ?? "56px";
  const iconHolder = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-center persona-rounded-xl persona-bg-persona-primary persona-text-white persona-text-2xl"
  );
  iconHolder.style.height = headerIconSize;
  iconHolder.style.width = headerIconSize;

  const headerIconName = launcher.headerIconName;
  if (headerIconName) {
    const iconSize = parseFloat(headerIconSize) || 24;
    const iconSvg = renderLucideIcon(headerIconName, iconSize * 0.5, "var(--persona-text-inverse, #ffffff)", 2);
    if (iconSvg) {
      iconHolder.replaceChildren(iconSvg);
    } else {
      iconHolder.textContent = launcher.agentIconText ?? "💬";
    }
  } else if (launcher.iconUrl) {
    const img = createElement("img") as HTMLImageElement;
    img.src = launcher.iconUrl;
    img.alt = "";
    img.className = "persona-rounded-xl persona-object-cover";
    img.style.height = headerIconSize;
    img.style.width = headerIconSize;
    iconHolder.replaceChildren(img);
  } else {
    iconHolder.textContent = launcher.agentIconText ?? "💬";
  }

  // Title and subtitle
  const headerCopy = createElement("div", "persona-flex persona-flex-col persona-flex-1");
  const title = createElement("span", "persona-text-lg persona-font-semibold");
  title.textContent = launcher.title ?? "Chat Assistant";
  const subtitle = createElement("span", "persona-text-sm persona-text-persona-muted");
  subtitle.textContent = launcher.subtitle ?? "Here to help you get answers fast";
  headerCopy.append(title, subtitle);

  topRow.append(iconHolder, headerCopy);

  // Close button
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonWrapper = createElement("div", "");

  const closeButton = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full persona-text-persona-muted hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
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
    "persona-mt-3 persona-pt-3 persona-border-t persona-border-gray-100 persona-text-xs persona-text-persona-muted"
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

