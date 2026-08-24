import { createElement } from "../utils/dom";
import { ChevronDown, ChevronUp } from "lucide";
import { renderIconNode } from "../utils/icon-node";

// Shared chrome for the two expandable transcript bubbles (tool + reasoning).
// ui.ts drives both by delegation with DOM queries ('button[data-expand-header]',
// '.persona-border-t', '.persona-ml-auto', '[data-persona-collapsed-preview=...]')
// and idiomorph matches on ids/attrs, so the emitted DOM must stay stable.

const BUBBLE_BASE_CLASSES = [
  "persona-w-full",
  "persona-rounded-2xl",
  "persona-bg-persona-surface",
  "persona-border",
  "persona-border-persona-message-border",
  "persona-text-persona-primary",
  "persona-shadow-sm",
  "persona-overflow-hidden",
  "persona-px-0",
  "persona-py-0"
];

export const EXPANDABLE_HEADER_CLASS =
  "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-pointer persona-border-none";

export const NON_EXPANDABLE_HEADER_CLASS =
  "persona-flex persona-w-full persona-items-center persona-justify-between persona-gap-3 persona-bg-transparent persona-px-4 persona-py-3 persona-text-left persona-cursor-default persona-border-none";

export const appendRenderedValue = (
  container: HTMLElement,
  value: HTMLElement | string | null | undefined
): boolean => {
  if (value == null) return false;
  if (typeof value === "string") {
    container.textContent = value;
    return true;
  }
  container.appendChild(value);
  return true;
};

export const createExpandableBubbleShell = (
  variantClass: string,
  messageId: string
): HTMLElement => {
  const bubble = createElement(
    "div",
    ["persona-message-bubble", variantClass, ...BUBBLE_BASE_CLASSES].join(" ")
  );
  // Set id for idiomorph matching
  bubble.id = `bubble-${messageId}`;
  bubble.setAttribute("data-message-id", messageId);
  return bubble;
};

export const createExpandableHeader = (params: {
  expandable: boolean;
  expanded: boolean;
  bubbleType: string;
}): HTMLButtonElement => {
  const header = createElement(
    "button",
    params.expandable ? EXPANDABLE_HEADER_CLASS : NON_EXPANDABLE_HEADER_CLASS
  ) as HTMLButtonElement;
  header.type = "button";
  if (params.expandable) {
    header.setAttribute("aria-expanded", params.expanded ? "true" : "false");
    header.setAttribute("data-expand-header", "true");
  }
  header.setAttribute("data-bubble-type", params.bubbleType);
  return header;
};

export const renderToggleChevron = (
  toggleIcon: HTMLElement,
  expanded: boolean,
  iconColor: string
): void => {
  toggleIcon.innerHTML = "";
  const chevronIcon = renderIconNode(expanded ? ChevronUp : ChevronDown, 16, iconColor, 2);
  if (chevronIcon) {
    toggleIcon.appendChild(chevronIcon);
  } else {
    toggleIcon.textContent = expanded ? "Hide" : "Show";
  }
};

// Builds the chevron affordance and appends header children. Returns the toggle
// icon container (null when not expandable, where only the content is appended).
export const appendHeaderToggle = (
  header: HTMLElement,
  headerContent: HTMLElement,
  params: { expandable: boolean; expanded: boolean; iconColor: string; metaGap: boolean }
): HTMLElement | null => {
  if (!params.expandable) {
    header.append(headerContent);
    return null;
  }
  const toggleIcon = createElement("div", "persona-flex persona-items-center");
  renderToggleChevron(toggleIcon, params.expanded, params.iconColor);

  const headerMeta = createElement(
    "div",
    params.metaGap
      ? "persona-flex persona-items-center persona-gap-2 persona-ml-auto"
      : "persona-flex persona-items-center persona-ml-auto"
  );
  headerMeta.append(toggleIcon);
  header.append(headerContent, headerMeta);
  return toggleIcon;
};

// Builds the collapsed-preview element and applies the active-preview /
// active-min-height rules. `renderPreview` is the kind-specific hook closure;
// it is only invoked when the preview guard passes (matching prior behavior).
export const createCollapsedPreviewSection = (params: {
  bubble: HTMLElement;
  previewKind: string;
  expanded: boolean;
  isActive: boolean;
  previewText: string;
  activePreview: boolean | undefined;
  activeMinHeight: string | undefined;
  renderPreview?: () => HTMLElement | string | null | undefined;
}): HTMLElement => {
  const collapsedPreview = createElement(
    "div",
    "persona-px-4 persona-py-3 persona-text-xs persona-leading-snug persona-text-persona-muted"
  );
  collapsedPreview.setAttribute("data-persona-collapsed-preview", params.previewKind);
  collapsedPreview.style.display = "none";
  collapsedPreview.style.whiteSpace = "pre-wrap";

  if (!params.expanded && params.isActive && params.activePreview && params.previewText) {
    const renderedPreview = params.renderPreview?.();
    if (!appendRenderedValue(collapsedPreview, renderedPreview)) {
      collapsedPreview.textContent = params.previewText;
    }
    collapsedPreview.style.display = "";
  }

  if (!params.expanded && params.isActive && params.activeMinHeight) {
    params.bubble.style.minHeight = params.activeMinHeight;
  }

  return collapsedPreview;
};

export const applyExpansionDisplay = (params: {
  expanded: boolean;
  header: HTMLElement;
  toggleIcon: HTMLElement | null;
  content: HTMLElement;
  collapsedPreview: HTMLElement;
  iconColor: string;
}): void => {
  params.header.setAttribute("aria-expanded", params.expanded ? "true" : "false");
  if (params.toggleIcon) {
    renderToggleChevron(params.toggleIcon, params.expanded, params.iconColor);
  }
  params.content.style.display = params.expanded ? "" : "none";
  params.collapsedPreview.style.display = params.expanded
    ? "none"
    : ((params.collapsedPreview.textContent || params.collapsedPreview.childNodes.length) ? "" : "none");
};

// Shared body of updateToolBubbleUI / updateReasoningBubbleUI: re-applies the
// expansion state onto an already-rendered bubble found via delegation queries.
export const updateExpandableBubbleUI = (
  messageId: string,
  bubble: HTMLElement,
  options: { stateSet: Set<string>; previewKind: string; iconColor: string }
): void => {
  const expanded = options.stateSet.has(messageId);
  const header = bubble.querySelector('button[data-expand-header="true"]') as HTMLElement;
  const content = bubble.querySelector('.persona-border-t') as HTMLElement;
  const preview = bubble.querySelector(
    `[data-persona-collapsed-preview="${options.previewKind}"]`
  ) as HTMLElement | null;

  if (!header || !content) return;

  header.setAttribute("aria-expanded", expanded ? "true" : "false");

  // Find toggle icon container - it's the direct child div of headerMeta (which has persona-ml-auto)
  const headerMeta = header.querySelector('.persona-ml-auto') as HTMLElement;
  const toggleIcon = headerMeta?.querySelector(':scope > .persona-flex.persona-items-center') as HTMLElement;
  if (toggleIcon) {
    renderToggleChevron(toggleIcon, expanded, options.iconColor);
  }

  content.style.display = expanded ? "" : "none";
  if (preview) {
    preview.style.display = expanded
      ? "none"
      : ((preview.textContent || preview.childNodes.length) ? "" : "none");
  }
};
