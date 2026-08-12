import { createElement } from "../utils/dom";
import { createDropdownMenu } from "../utils/dropdown";
import { createComboButton } from "../utils/buttons";
import {
  AgentWidgetConfig,
  AgentWidgetHeaderLayoutConfig,
  AgentWidgetHeaderTrailingAction
} from "../types";
import {
  buildHeader,
  HEADER_THEME_CSS,
  HEADER_TITLE_TYPOGRAPHY,
  HeaderElements,
  attachHeaderToContainer as _attachHeaderToContainer,
} from "./header-builder";
import {
  createClearChatButton,
  createCloseButton,
  createHeaderIconButton,
} from "./header-parts";

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
    // Same shared chrome as the close button beside them. The wrapper stays
    // relative so a dropdown can anchor to it.
    const { button: btn, wrapper } = createHeaderIconButton({
      ariaLabel: a.ariaLabel ?? a.label ?? a.id,
      iconName: a.icon,
      iconText: a.icon ? undefined : a.label,
      wrapperClassName:
        "persona-relative persona-inline-flex persona-items-center persona-justify-center",
    });

    if (a.menuItems?.length) {
      const dropdown = createDropdownMenu({
        items: a.menuItems,
        onSelect: (itemId) => onAction?.(itemId),
        anchor: wrapper,
        // The cluster sits at the trailing edge; a left-aligned menu would
        // extend past it.
        position: 'bottom-right',
      });
      wrapper.appendChild(dropdown.element);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.toggle();
      });
    } else {
      btn.addEventListener("click", () => onAction?.(a.id));
    }
    container.appendChild(wrapper);
  }
}

export const buildMinimalHeader: HeaderLayoutRenderer = (context) => {
  const { config, showClose = true, onClose, layoutHeaderConfig, onHeaderAction } = context;
  const launcher = config?.launcher ?? {};

  // max(title 24px, cluster 32px) + py-4 + border = the strip's 65px.
  const header = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-between persona-px-6 persona-py-4"
  );
  header.setAttribute("data-persona-theme-zone", "header");
  header.style.minHeight = HEADER_THEME_CSS.minHeight;
  header.style.backgroundColor = 'var(--persona-header-bg, var(--persona-surface, #ffffff))';
  header.style.borderBottomColor = 'var(--persona-header-border, var(--persona-divider, #f1f5f9))';
  header.style.boxShadow = 'var(--persona-header-shadow, none)';
  header.style.borderBottom =
    'var(--persona-header-border-bottom, 1px solid var(--persona-header-border, var(--persona-divider, #f1f5f9)))';

  // Build the title area: either a combo button (titleMenu) or standard title row
  const titleMenuConfig = layoutHeaderConfig?.titleMenu;
  let titleRow: HTMLElement;
  let headerTitle: HTMLElement;

  if (titleMenuConfig) {
    // Combo button replaces title + trailing actions + hover
    const combo = createComboButton({
      label: launcher.title ?? "Chat Assistant",
      menuItems: titleMenuConfig.menuItems,
      onSelect: titleMenuConfig.onSelect,
      hover: titleMenuConfig.hover,
      className: "",
    });
    titleRow = combo.element;
    titleRow.style.color = HEADER_THEME_CSS.titleColor;
    // The combo button's label span acts as headerTitle for update()
    headerTitle = titleRow.querySelector(".persona-combo-btn-label") ?? titleRow;
  } else {
    titleRow = createElement(
      "div",
      "persona-flex persona-min-w-0 persona-flex-1 persona-items-center persona-gap-1"
    );

    // Title only (no icon, no subtitle)
    headerTitle = createElement("span", "persona-text-base persona-font-semibold persona-truncate");
    headerTitle.style.color = HEADER_THEME_CSS.titleColor;
    Object.assign(headerTitle.style, HEADER_TITLE_TYPOGRAPHY);
    headerTitle.textContent = launcher.title ?? "Chat Assistant";

    titleRow.appendChild(headerTitle);

    // Make title row clickable when onTitleClick is provided
    if (layoutHeaderConfig?.onTitleClick) {
      titleRow.style.cursor = "pointer";
      titleRow.setAttribute("role", "button");
      titleRow.setAttribute("tabindex", "0");
      const handleTitleClick = layoutHeaderConfig.onTitleClick;
      titleRow.addEventListener("click", (e) => {
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

    // Title row hover pill effect
    const hoverCfg = layoutHeaderConfig?.titleRowHover;
    if (hoverCfg) {
      titleRow.style.borderRadius = hoverCfg.borderRadius ?? '10px';
      titleRow.style.padding = hoverCfg.padding ?? '6px 4px 6px 12px';
      titleRow.style.margin = '-6px 0 -6px -12px';
      titleRow.style.border = '1px solid transparent';
      titleRow.style.transition = 'background-color 0.15s ease, border-color 0.15s ease';
      titleRow.style.width = 'fit-content';
      titleRow.style.flex = 'none';
      titleRow.addEventListener('mouseenter', () => {
        titleRow.style.backgroundColor = hoverCfg.background ?? '';
        titleRow.style.borderColor = hoverCfg.border ?? '';
      });
      titleRow.addEventListener('mouseleave', () => {
        titleRow.style.backgroundColor = '';
        titleRow.style.borderColor = 'transparent';
      });
    }
  }

  header.appendChild(titleRow);

  // Close button: same shared factory the default layout uses. The wrapper is
  // flex so an inline-flex button can never reserve baseline slack and ride
  // high inside it.
  const trailingWrapperClass =
    "persona-relative persona-inline-flex persona-items-center persona-justify-center";
  const { button: closeButton, wrapper: closeButtonWrapper } = createCloseButton(
    config,
    { showClose, wrapperClassName: trailingWrapperClass }
  );

  if (onClose) {
    closeButton.addEventListener("click", onClose);
  }

  // Trailing edge: action buttons cluster with the close button, matching
  // its chrome. `titleMenu` still ignores `trailingActions` (documented).
  const trailingCluster = createElement(
    "div",
    "persona-flex persona-items-center persona-gap-1"
  );
  if (!titleMenuConfig) {
    appendTrailingHeaderActions(
      trailingCluster,
      layoutHeaderConfig?.trailingActions,
      layoutHeaderConfig?.onAction ?? onHeaderAction
    );
  }

  // Clear chat honors the same config surface as the default layout. Click
  // wiring is owned by setupClearChatButton() in ui.ts via the returned ref;
  // top-right placement is mounted by attachHeaderToContainer, also via ref.
  const clearChatConfig = launcher.clearChat ?? {};
  let clearChatButton: HTMLButtonElement | null = null;
  let clearChatButtonWrapper: HTMLElement | null = null;
  if (clearChatConfig.enabled ?? true) {
    const clearChatPlacement = clearChatConfig.placement ?? "inline";
    const parts = createClearChatButton(config, {
      wrapperClassName:
        clearChatPlacement === "top-right"
          ? "persona-absolute persona-top-4 persona-z-50"
          : trailingWrapperClass,
    });
    clearChatButton = parts.button;
    clearChatButtonWrapper = parts.wrapper;
    if (clearChatPlacement === "top-right") {
      clearChatButtonWrapper.style.right = "48px";
    } else {
      // Close stays outermost.
      trailingCluster.appendChild(clearChatButtonWrapper);
    }
  }

  trailingCluster.appendChild(closeButtonWrapper);
  header.appendChild(trailingCluster);

  // title was moved into titleRow; keep headerTitle ref pointing at title for updateController

  // Create placeholder elements for compatibility
  const iconHolder = createElement("div");
  iconHolder.style.display = "none";
  const headerSubtitle = createElement("span");
  headerSubtitle.style.display = "none";

  return {
    header,
    iconHolder,
    headerTitle,
    headerSubtitle,
    closeButton,
    closeButtonWrapper,
    clearChatButton,
    clearChatButtonWrapper
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

