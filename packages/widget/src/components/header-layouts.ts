import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import {
  AgentWidgetConfig,
  AgentWidgetHeaderLayoutConfig,
  AgentWidgetHeaderTrailingAction
} from "../types";
import { buildHeader, HeaderElements, attachHeaderToContainer as _attachHeaderToContainer } from "./header-builder";

export interface HeaderLayoutContext {
  config: AgentWidgetConfig;
  showClose?: boolean;
  onClose?: () => void;
  onClearChat?: () => void;
  /** Passed from `buildHeaderWithLayout` for minimal/default chrome extensions */
  layoutHeaderConfig?: AgentWidgetHeaderLayoutConfig;
  onHeaderAction?: (actionId: string) => void;
}

export type HeaderLayoutRenderer = (context: HeaderLayoutContext) => HeaderElements;

/**
 * Build default header layout
 * Full header with icon, title, subtitle, clear chat, and close button
 */
export const buildDefaultHeader: HeaderLayoutRenderer = (context) => {
  const elements = buildHeader({
    config: context.config,
    showClose: context.showClose,
    onClose: context.onClose,
    onClearChat: context.onClearChat
  });

  // Make the title/subtitle area clickable when onTitleClick is provided
  const onTitleClick = context.layoutHeaderConfig?.onTitleClick;
  if (onTitleClick) {
    const headerCopy = elements.headerTitle.parentElement;
    if (headerCopy) {
      headerCopy.style.cursor = "pointer";
      headerCopy.setAttribute("role", "button");
      headerCopy.setAttribute("tabindex", "0");
      headerCopy.addEventListener("click", () => onTitleClick());
      headerCopy.addEventListener("keydown", (e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onTitleClick();
        }
      });
    }
  }

  return elements;
};

/**
 * Build minimal header layout
 * Simplified layout with just title and close button
 */
function appendTrailingHeaderActions(
  container: HTMLElement,
  actions: AgentWidgetHeaderTrailingAction[] | undefined,
  onAction?: (id: string) => void
): void {
  if (!actions?.length) return;
  for (const a of actions) {
    const btn = createElement(
      "button",
      "persona-inline-flex persona-items-center persona-justify-center persona-rounded-md persona-border-none persona-bg-transparent persona-p-0 persona-text-persona-muted hover:persona-opacity-80"
    ) as HTMLButtonElement;
    btn.type = "button";
    btn.setAttribute("aria-label", a.ariaLabel ?? a.label ?? a.id);
    if (a.icon) {
      const ic = renderLucideIcon(a.icon, 14, "currentColor", 2);
      if (ic) btn.appendChild(ic);
    } else if (a.label) {
      btn.textContent = a.label;
    }
    btn.addEventListener("click", () => onAction?.(a.id));
    container.appendChild(btn);
  }
}

export const buildMinimalHeader: HeaderLayoutRenderer = (context) => {
  const { config, showClose = true, onClose, layoutHeaderConfig, onHeaderAction } = context;
  const launcher = config?.launcher ?? {};

  const header = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-between persona-bg-persona-surface persona-px-6 persona-py-4 persona-border-b-persona-divider"
  );
  header.setAttribute("data-persona-theme-zone", "header");

  const titleRow = createElement(
    "div",
    "persona-flex persona-min-w-0 persona-flex-1 persona-items-center persona-gap-1"
  );

  // Title only (no icon, no subtitle)
  const title = createElement("span", "persona-text-base persona-font-semibold persona-truncate");
  title.textContent = launcher.title ?? "Chat Assistant";

  titleRow.appendChild(title);
  appendTrailingHeaderActions(
    titleRow,
    layoutHeaderConfig?.trailingActions,
    layoutHeaderConfig?.onAction ?? onHeaderAction
  );

  // Make title row clickable when onTitleClick is provided
  if (layoutHeaderConfig?.onTitleClick) {
    titleRow.style.cursor = "pointer";
    titleRow.setAttribute("role", "button");
    titleRow.setAttribute("tabindex", "0");
    const handleTitleClick = layoutHeaderConfig.onTitleClick;
    titleRow.addEventListener("click", (e) => {
      // Skip if the click was on a trailing action button
      if ((e.target as HTMLElement).closest("button")) return;
      handleTitleClick();
    });
    titleRow.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        handleTitleClick();
      }
    });
  }

  header.appendChild(titleRow);

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

  // title was moved into titleRow; keep headerTitle ref pointing at title for updateController

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
 * Header layout registry
 * Maps layout names to their renderer functions
 */
export const headerLayouts: Record<string, HeaderLayoutRenderer> = {
  default: buildDefaultHeader,
  minimal: buildMinimalHeader
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
      onClearChat: context?.onClearChat,
      trailingActions: layoutConfig.trailingActions,
      onAction: layoutConfig.onAction
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
    onClearChat: context?.onClearChat,
    layoutHeaderConfig: layoutConfig,
    onHeaderAction: layoutConfig?.onAction
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

