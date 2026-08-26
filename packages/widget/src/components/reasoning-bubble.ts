import { createElement } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetConfig, AgentWidgetMessage } from "../types";
import { describeReasonStatus, computeReasoningElapsed, parseFormattedTemplate } from "../utils/formatting";
import { appendCharSpans } from "../utils/tool-loading-animation";
import {
  appendHeaderToggle,
  applyExpansionDisplay,
  createCollapsedPreviewSection,
  createExpandableBubbleShell,
  createExpandableHeader,
  updateExpandableBubbleUI,
} from "./expandable-bubble";

// Expansion state per widget instance
export const reasoningExpansionState = new Set<string>();

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
export const updateReasoningBubbleUI = (messageId: string, bubble: HTMLElement): void => {
  updateExpandableBubbleUI(messageId, bubble, {
    stateSet: reasoningExpansionState,
    previewKind: "reasoning",
    iconColor: "currentColor",
  });
};

export const createReasoningBubble = (message: AgentWidgetMessage, config?: AgentWidgetConfig): HTMLElement => {
  const reasoning = message.reasoning;
  const bubble = createExpandableBubbleShell("persona-reasoning-bubble", message.id);

  if (!reasoning) {
    return bubble;
  }

  const reasoningDisplayConfig = config?.features?.reasoningDisplay ?? {};
  const expandable = reasoningDisplayConfig.expandable !== false;
  const expanded = expandable && reasoningExpansionState.has(message.id);
  const isActive = reasoning.status !== "complete";
  const previewText = getReasoningPreviewText(message, reasoningDisplayConfig.previewMaxLines ?? 3);
  const header = createExpandableHeader({ expandable, expanded, bubbleType: "reasoning" });

  const headerContent = createElement("div", "persona-flex persona-flex-col persona-text-left");
  const title = createElement("span", "persona-text-xs persona-text-persona-primary");
  const defaultSummary = "Thinking...";
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
  headerContent.appendChild(status);

  // Template and animation support
  const loadingAnimation = reasoningDisplayConfig.loadingAnimation ?? "none";
  const activeTemplate = reasoningConfig.activeTextTemplate;
  const completeTemplate = reasoningConfig.completeTextTemplate;
  const currentTemplate = isActive ? activeTemplate : completeTemplate;
  const skipCustomElement = customSummary instanceof HTMLElement;

  /**
   * Renders a template into the title element, handling:
   * - Inline formatting markers: **bold**, *italic*, ~dim~
   * - {duration} as a live-updating elapsed span (active) or static text (complete)
   * - Character-by-character animation wrapping when `animated` is true
   */
  const renderFormattedTitle = (template: string, animated: boolean) => {
    title.textContent = "";
    const segments = parseFormattedTemplate(template, "");
    let charIndex = 0;

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
        if (animated) {
          charIndex = appendCharSpans(parent, text, charIndex);
        } else {
          parent.appendChild(document.createTextNode(text));
        }
      }
    }
  };

  // Apply template + animation, or fall back to legacy title/status approach
  if (!skipCustomElement && currentTemplate) {
    // Template mode: unified title replaces separate title/status spans
    status.style.display = "none";
    title.style.display = "";

    if (isActive && loadingAnimation !== "none") {
      const animDuration = reasoningConfig.loadingAnimationDuration ?? 2000;
      title.setAttribute("data-preserve-animation", "true");

      if (loadingAnimation === "pulse") {
        title.classList.add("persona-tool-loading-pulse");
        title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);
        renderFormattedTitle(currentTemplate, false);
      } else {
        title.classList.add(`persona-tool-loading-${loadingAnimation}`);
        title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);

        if (loadingAnimation === "shimmer-color") {
          if (reasoningConfig.loadingAnimationColor) {
            title.style.setProperty("--persona-tool-anim-color", reasoningConfig.loadingAnimationColor);
          }
          if (reasoningConfig.loadingAnimationSecondaryColor) {
            title.style.setProperty("--persona-tool-anim-secondary-color", reasoningConfig.loadingAnimationSecondaryColor);
          }
        }

        renderFormattedTitle(currentTemplate, true);
      }
    } else {
      renderFormattedTitle(currentTemplate, false);
    }
  } else if (!skipCustomElement && isActive && loadingAnimation !== "none") {
    // Animation without template: animate the default "Thinking..." text
    title.style.display = "";
    const animDuration = reasoningConfig.loadingAnimationDuration ?? 2000;
    title.setAttribute("data-preserve-animation", "true");

    if (loadingAnimation === "pulse") {
      title.classList.add("persona-tool-loading-pulse");
      title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);
    } else {
      title.classList.add(`persona-tool-loading-${loadingAnimation}`);
      title.style.setProperty("--persona-tool-anim-duration", `${animDuration}ms`);

      if (loadingAnimation === "shimmer-color") {
        if (reasoningConfig.loadingAnimationColor) {
          title.style.setProperty("--persona-tool-anim-color", reasoningConfig.loadingAnimationColor);
        }
        if (reasoningConfig.loadingAnimationSecondaryColor) {
          title.style.setProperty("--persona-tool-anim-secondary-color", reasoningConfig.loadingAnimationSecondaryColor);
        }
      }

      const text = title.textContent || defaultSummary;
      title.textContent = "";
      appendCharSpans(title, text, 0);
    }

    // Legacy: hide title on complete, show status
    if (reasoning.status === "complete") {
      title.style.display = "none";
    }
  } else if (!skipCustomElement) {
    // Legacy path: no template, no animation
    if (reasoning.status === "complete") {
      title.style.display = "none";
    } else {
      title.style.display = "";
    }
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
    return bubble;
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
  return bubble;
};
