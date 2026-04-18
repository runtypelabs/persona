import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
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
  HeaderElements,
  attachHeaderToContainer as _attachHeaderToContainer,
} from "./header-builder";

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

    if (a.menuItems?.length) {
      // Wrap in a relative container for dropdown positioning
      const wrapper = createElement("div", "persona-relative");
      wrapper.appendChild(btn);
      const dropdown = createDropdownMenu({
        items: a.menuItems,
        onSelect: (itemId) => onAction?.(itemId),
        anchor: wrapper,
        position: 'bottom-left',
      });
      wrapper.appendChild(dropdown.element);
      btn.addEventListener("click", (e) => {
        e.stopPropagation();
        dropdown.toggle();
      });
      container.appendChild(wrapper);
    } else {
      btn.addEventListener("click", () => onAction?.(a.id));
      container.appendChild(btn);
    }
  }
}

export const buildMinimalHeader: HeaderLayoutRenderer = (context) => {
  const { config, showClose = true, onClose, layoutHeaderConfig, onHeaderAction } = context;
  const launcher = config?.launcher ?? {};

  const header = createElement(
    "div",
    "persona-flex persona-items-center persona-justify-between persona-px-6 persona-py-4"
  );
  header.setAttribute("data-persona-theme-zone", "header");
  header.style.backgroundColor = 'var(--persona-header-bg, var(--persona-surface, #ffffff))';
  header.style.borderBottomColor = 'var(--persona-header-border, var(--persona-divider, #f1f5f9))';
  header.style.boxShadow = 'var(--persona-header-shadow, none)';
  header.style.borderBottom =
    'var(--persona-header-border-bottom, 1px solid var(--persona-header-border, var(--persona-divider, #f1f5f9)))';

  // Build the title area — either a combo button (titleMenu) or standard title row
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
    headerTitle.textContent = launcher.title ?? "Chat Assistant";

    titleRow.appendChild(headerTitle);
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

  // Close button
  const closeButtonSize = launcher.closeButtonSize ?? "32px";
  const closeButtonWrapper = createElement("div", "");

  const closeButton = createElement(
    "button",
    "persona-inline-flex persona-items-center persona-justify-center persona-rounded-full hover:persona-bg-gray-100 persona-cursor-pointer persona-border-none"
  ) as HTMLButtonElement;
  closeButton.style.height = closeButtonSize;
  closeButton.style.width = closeButtonSize;
  closeButton.type = "button";
  closeButton.setAttribute("aria-label", "Close chat");
  closeButton.style.display = showClose ? "" : "none";
  closeButton.style.color =
    launcher.closeButtonColor || HEADER_THEME_CSS.actionIconColor;

  const closeButtonIconName = launcher.closeButtonIconName ?? "x";
  // Larger intrinsic size compensates for the X glyph's sparse viewBox
  // (paths only occupy the middle 50%). Matches header-builder.ts.
  const closeIconSvg = renderLucideIcon(closeButtonIconName, "28px", "currentColor", 1);
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
    headerTitle,
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

