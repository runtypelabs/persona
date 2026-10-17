import { applyActivityRow, activityDisplay, activityVariant, activityDuration } from "./activity-row";
import { createElement } from "../utils/dom";
import { renderLucideIcon } from "./activity-deps";
import { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { DEFAULT_REASONING_DISPLAY } from "../utils/activity-display-defaults";
import { describeReasonStatus, computeReasoningElapsed, parseFormattedTemplate } from "../utils/formatting";
import { applyLoadingLabel } from "../utils/loading-label-deps";
import {
  appendHeaderToggle,
  applyExpansionDisplay,
  createCollapsedPreviewSection,
  createExpandableBubbleShell,
  createExpandableHeader,
  updateExpandableBubbleUI,
} from "./expandable-bubble";

const getReasoningPreviewText = (message: AgentWidgetMessage, maxLines: number): string => {
  const text = message.reasoning?.chunks.join("").trim() ?? "";
  if (!text) return "";
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, maxLines)
    .join("\n");
};

// Helper function to update reasoning bubble UI after expansion state changes
export const updateReasoningBubbleUI = (
  messageId: string,
  bubble: HTMLElement,
  expansionState: Set<string>
): void => {
  updateExpandableBubbleUI(messageId, bubble, {
    stateSet: expansionState,
    previewKind: "reasoning",
    iconColor: "currentColor",
  });
};

export const createReasoningBubble = (
  message: AgentWidgetMessage,
  config?: AgentWidgetConfig,
  expansionState = new Set<string>()
): HTMLElement => {
  config = activityDisplay(config, "reasoning");
  const reasoning = message.reasoning;
  const bubble = createExpandableBubbleShell("persona-reasoning-bubble", message.id);

  if (!reasoning) {
    return applyActivityRow(bubble, message, config, "reasoning");
  }

  const reasoningDisplayConfig = config?.features?.reasoningDisplay ?? {};
  const expandable = reasoningDisplayConfig.expandable ?? DEFAULT_REASONING_DISPLAY.expandable;
  const expanded = expandable && expansionState.has(message.id);
  const isActive = reasoning.status !== "complete";
  const previewText = getReasoningPreviewText(
    message,
    reasoningDisplayConfig.previewMaxLines ?? DEFAULT_REASONING_DISPLAY.previewMaxLines
  );
  const header = createExpandableHeader({ expandable, expanded, bubbleType: "reasoning" });

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  const row = activityVariant(config, "reasoning") === "row";
  const defaultSummary = row && !isActive ? `Thought for ${activityDuration(reasoning.durationMs ?? (reasoning.completedAt !== undefined && reasoning.startedAt !== undefined ? reasoning.completedAt - reasoning.startedAt : undefined))}` : "Thinking...";
  const reasoningConfig = config?.reasoning ?? {};

  // Elapsed helpers: defined early so they're available to renderCollapsedSummary
  const startedAt = String(reasoning.startedAt ?? Date.now());

  const createElapsedSpan = (): HTMLElement => {
    const span = createElement("span", "");
    span.setAttribute("data-tool-elapsed", startedAt);
    span.textContent = computeReasoningElapsed(reasoning);
    return span;
  };

  const customSummary = reasoningConfig.renderCollapsedSummary?.({
    message,
    reasoning,
    defaultSummary,
    previewText,
    isActive,
    config: config ?? {},
    elapsed: computeReasoningElapsed(reasoning),
    createElapsedElement: createElapsedSpan,
  });
  if (typeof customSummary === "string" && customSummary.trim()) {
    title.textContent = customSummary;
    headerContent.appendChild(title);
  } else if (customSummary instanceof HTMLElement) {
    headerContent.appendChild(customSummary);
  } else {
    title.textContent = defaultSummary;
    headerContent.appendChild(title);
  }

  // Status span: used in the legacy (no-template) path
  const status = createElement("span", "persona-text-xs persona-text-persona-primary");
  status.textContent = describeReasonStatus(reasoning);
  if (!row) headerContent.appendChild(status);

  // Template and animation support
  const activeTemplate = reasoningConfig.activeTextTemplate;
  const completeTemplate = reasoningConfig.completeTextTemplate;
  const currentTemplate = isActive ? activeTemplate : completeTemplate;
  const skipCustomElement = customSummary instanceof HTMLElement;

  /**
   * Renders a template into the title element, handling:
   * - Inline formatting markers: **bold**, *italic*, ~dim~
   * - {duration} as a live-updating elapsed span (active) or static text (complete)
   */
  const renderFormattedTitle = (template: string) => {
    title.textContent = "";
    const segments = parseFormattedTemplate(template, "");

    for (const seg of segments) {
      const parent = seg.styles.length > 0
        ? (() => {
            const w = createElement("span", seg.styles.map(s => `persona-tool-text-${s}`).join(" "));
            title.appendChild(w);
            return w;
          })()
        : title;

      if (seg.isDuration && isActive) {
        parent.appendChild(createElapsedSpan());
      } else {
        const text = seg.isDuration ? computeReasoningElapsed(reasoning) : seg.text;
        parent.appendChild(document.createTextNode(text));
      }
    }
  };

  if (!skipCustomElement) {
    if (currentTemplate) {
      status.style.display = "none";
      renderFormattedTitle(currentTemplate);
    }
    title.style.display = !currentTemplate && !isActive && !row ? "none" : "";
    if (isActive) applyLoadingLabel(title, config, "reasoning");
  }

  // `reasoningDisplay.iconName`: a leading glyph in the header row. Appended
  // before the header content, which `appendHeaderToggle` adds next.
  if (reasoningDisplayConfig.iconName && !skipCustomElement) {
    const iconHost = createElement("span", "persona-reasoning-header-icon");
    const glyph = renderLucideIcon(
      reasoningDisplayConfig.iconName,
      16,
      "currentColor",
      2
    );
    if (glyph) {
      iconHost.appendChild(glyph);
      header.appendChild(iconHost);
    }
  }

  const iconColor = "currentColor";
  const toggleIcon = appendHeaderToggle(header, headerContent, {
    expandable,
    expanded,
    iconColor,
    metaGap: false,
  });

  const collapsedPreview = createCollapsedPreviewSection({
    bubble,
    previewKind: "reasoning",
    expanded,
    isActive,
    previewText,
    activePreview: reasoningDisplayConfig.activePreview,
    activeMinHeight: reasoningDisplayConfig.activeMinHeight,
    renderPreview: () =>
      config?.reasoning?.renderCollapsedPreview?.({
        message,
        reasoning,
        defaultPreview: previewText,
        isActive,
        config: config ?? {},
      }),
  });

  if (!expandable) {
    bubble.append(header, collapsedPreview);
    return applyActivityRow(bubble, message, config, "reasoning");
  }

  const content = createElement(
    "div",
    "persona-border-t persona-border-gray-200 persona-bg-gray-50 persona-px-4 persona-py-3"
  );
  content.style.display = expanded ? "" : "none";

  const text = reasoning.chunks.join("");
  const body = createElement(
    "div",
    "persona-whitespace-pre-wrap persona-text-xs persona-leading-snug persona-text-persona-muted"
  );
  body.textContent =
    text ||
    (reasoning.status === "complete"
      ? "No additional context was shared."
      : "Waiting for details…");
  content.appendChild(body);

  applyExpansionDisplay({ expanded, header, toggleIcon, content, collapsedPreview, iconColor });

  bubble.append(header, collapsedPreview, content);
  return applyActivityRow(bubble, message, config, "reasoning");
};
