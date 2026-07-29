import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetSession } from "../session";
import {
  AgentWidgetMessage,
  AgentWidgetSuggestion,
  AgentWidgetSuggestionChipsConfig,
  AgentWidgetSuggestionSelection,
  AgentWidgetSuggestionVariant,
} from "../types";

export type NormalizedSuggestion = {
  id: string;
  label: string;
  prompt: string;
  description?: string;
  icon?: string;
  selection?: AgentWidgetSuggestionSelection;
  emphasis: "default" | "primary";
};

export interface SuggestionButtons {
  buttons: HTMLButtonElement[];
  destroy: () => void;
  render: (
    items: AgentWidgetSuggestion[] | undefined,
    session: AgentWidgetSession,
    textarea: HTMLTextAreaElement,
    messages?: AgentWidgetMessage[],
    config?: AgentWidgetSuggestionChipsConfig,
    opts?: SuggestionRenderOptions
  ) => void;
}

export interface SuggestionRenderOptions {
  /** Whether these are welcome starters or agent-produced follow-ups. */
  surface?: "starter" | "follow-up";
  /** Presentation density. */
  variant?: AgentWidgetSuggestionVariant;
  /** Default click behavior, overridable per item. */
  selection?: AgentWidgetSuggestionSelection;
  /** Chip overflow behavior. */
  overflow?: "scroll" | "wrap";
  /** Renderer cap. */
  maxItems?: number;
  /**
   * Suggestions pushed by the agent's `suggest_replies` tool rather than
   * static config. Retains the legacy `persona:suggestReplies:*` events.
   */
  agentPushed?: boolean;
}

export const normalizeSuggestion = (
  item: AgentWidgetSuggestion,
  index = 0
): NormalizedSuggestion | null => {
  if (typeof item === "string") {
    const value = item.trim();
    if (!value) return null;
    return {
      id: value,
      label: value,
      prompt: value,
      emphasis: "default",
    };
  }

  const label = item.label.trim();
  if (!label) return null;
  const prompt = item.prompt?.trim() || label;
  return {
    id: item.id?.trim() || prompt || `suggestion-${index}`,
    label,
    prompt,
    description: item.description?.trim() || undefined,
    icon: item.icon,
    selection: item.selection,
    emphasis: item.emphasis ?? "default",
  };
};

const fontFamilyValue = (
  family: "sans-serif" | "serif" | "mono"
): string => {
  switch (family) {
    case "serif":
      return 'Georgia, "Times New Roman", Times, serif';
    case "mono":
      return '"Courier New", Courier, "Lucida Console", Monaco, monospace';
    default:
      return '-apple-system, BlinkMacSystemFont, "Segoe UI", "Helvetica Neue", Arial, sans-serif';
  }
};

export const createSuggestions = (container: HTMLElement): SuggestionButtons => {
  const suggestionButtons: HTMLButtonElement[] = [];
  let lastShownKey: string | null = null;
  let overflowFrame: number | null = null;

  const clearOverflowAffordance = () => {
    container.removeAttribute("data-scroll-left");
    container.removeAttribute("data-scroll-right");
  };

  const syncOverflowAffordance = () => {
    overflowFrame = null;
    if (
      container.hidden ||
      container.dataset.variant !== "chip" ||
      container.dataset.overflow !== "scroll"
    ) {
      clearOverflowAffordance();
      return;
    }

    const maxScroll = Math.max(0, container.scrollWidth - container.clientWidth);
    if (maxScroll <= 1) {
      clearOverflowAffordance();
      return;
    }

    const isRtl = getComputedStyle(container).direction === "rtl";
    const position = Math.min(
      maxScroll,
      Math.max(0, Math.abs(container.scrollLeft))
    );
    // Scroll snap and the scroller's 2px visual padding can settle a browser
    // just off either boundary. Treat that subpixel-sized drift as the edge so
    // a misleading opposite fade does not appear before the user scrolls.
    const edgeTolerance = 4;
    const atStart = position <= edgeTolerance;
    const atEnd = position >= maxScroll - edgeTolerance;
    const hasLeftOverflow = isRtl ? !atEnd : !atStart;
    const hasRightOverflow = isRtl ? !atStart : !atEnd;

    container.toggleAttribute("data-scroll-left", hasLeftOverflow);
    container.toggleAttribute("data-scroll-right", hasRightOverflow);
  };

  const scheduleOverflowAffordance = () => {
    if (overflowFrame !== null || typeof requestAnimationFrame !== "function") {
      if (typeof requestAnimationFrame !== "function") {
        syncOverflowAffordance();
      }
      return;
    }
    overflowFrame = requestAnimationFrame(syncOverflowAffordance);
  };

  container.addEventListener("scroll", scheduleOverflowAffordance, {
    passive: true,
  });
  const resizeObserver =
    typeof ResizeObserver === "function"
      ? new ResizeObserver(scheduleOverflowAffordance)
      : null;
  resizeObserver?.observe(container);

  const render = (
    items: AgentWidgetSuggestion[] | undefined,
    session: AgentWidgetSession,
    textarea: HTMLTextAreaElement,
    messages?: AgentWidgetMessage[],
    chipsConfig?: AgentWidgetSuggestionChipsConfig,
    opts?: SuggestionRenderOptions
  ) => {
    container.replaceChildren();
    suggestionButtons.length = 0;

    const agentPushed = opts?.agentPushed === true;
    const surface = opts?.surface ?? (agentPushed ? "follow-up" : "starter");
    const variant = opts?.variant ?? "chip";
    const selection = opts?.selection ?? "send";
    const overflow = opts?.overflow ?? "wrap";
    const maxItems =
      typeof opts?.maxItems === "number"
        ? Math.max(0, Math.floor(opts.maxItems))
        : undefined;

    const allNormalized = (items ?? [])
      .map(normalizeSuggestion)
      .filter((item): item is NormalizedSuggestion => item !== null);
    const normalized =
      maxItems === undefined
        ? allNormalized
        : allNormalized.slice(0, maxItems);

    if (!normalized.length) {
      container.hidden = true;
      lastShownKey = null;
      clearOverflowAffordance();
      return;
    }

    if (!agentPushed) {
      const messagesToCheck = messages ?? session.getMessages();
      if (messagesToCheck.some((message) => message.role === "user")) {
        container.hidden = true;
        lastShownKey = null;
        return;
      }
    }

    container.hidden = false;
    container.classList.add("persona-suggestions");
    container.dataset.personaSuggestionSurface = surface;
    container.dataset.variant = variant;
    container.dataset.overflow = overflow;

    const fragment = document.createDocumentFragment();
    const streaming = session.isStreaming();

    normalized.forEach((item) => {
      const itemSelection = item.selection ?? selection;
      const button = createElement(
        "button",
        `persona-suggestion persona-suggestion--${variant}`
      ) as HTMLButtonElement;
      button.type = "button";
      button.disabled = streaming;
      button.dataset.suggestionId = item.id;
      button.dataset.emphasis = item.emphasis;
      button.dataset.selection = itemSelection;

      if (chipsConfig?.fontFamily) {
        button.style.fontFamily = fontFamilyValue(chipsConfig.fontFamily);
      }
      if (chipsConfig?.fontWeight) {
        button.style.fontWeight = chipsConfig.fontWeight;
      }
      if (chipsConfig?.paddingX) {
        button.style.paddingLeft = chipsConfig.paddingX;
        button.style.paddingRight = chipsConfig.paddingX;
      }
      if (chipsConfig?.paddingY) {
        button.style.paddingTop = chipsConfig.paddingY;
        button.style.paddingBottom = chipsConfig.paddingY;
      }

      if (item.icon) {
        const icon = renderLucideIcon(
          item.icon,
          "var(--persona-suggestion-icon-size)",
          "currentColor",
          1.8
        );
        if (icon) {
          icon.classList.add("persona-suggestion__icon");
          button.appendChild(icon);
        }
      }

      const copy = createElement("span", "persona-suggestion__copy");
      copy.appendChild(
        createNode("span", {
          className: "persona-suggestion__label",
          text: item.label,
        })
      );
      if (item.description) {
        copy.appendChild(
          createNode("span", {
            className: "persona-suggestion__description",
            text: item.description,
          })
        );
      }
      button.appendChild(copy);

      if (variant !== "chip") {
        const arrow = renderLucideIcon("arrow-right", 16, "currentColor", 1.8);
        if (arrow) {
          arrow.classList.add("persona-suggestion__arrow");
          button.appendChild(arrow);
        }
      }

      button.addEventListener("click", () => {
        if (session.isStreaming()) return;
        const detail = {
          suggestion: { ...item },
          surface,
          source: agentPushed ? "agent" : "config",
          selection: itemSelection,
        };
        container.dispatchEvent(
          new CustomEvent("persona:suggestion:selected", {
            detail,
            bubbles: true,
            composed: true,
          })
        );
        if (agentPushed) {
          container.dispatchEvent(
            new CustomEvent("persona:suggestReplies:selected", {
              detail: { suggestion: item.prompt },
              bubbles: true,
              composed: true,
            })
          );
        }

        if (itemSelection === "fill") {
          textarea.value = item.prompt;
          textarea.dispatchEvent(
            new Event("input", { bubbles: true, composed: true })
          );
          textarea.focus();
          return;
        }

        textarea.value = "";
        session.sendMessage(item.prompt);
      });

      fragment.appendChild(button);
      suggestionButtons.push(button);
    });
    container.appendChild(fragment);
    syncOverflowAffordance();
    scheduleOverflowAffordance();

    const shownKey = JSON.stringify({
      normalized,
      surface,
      variant,
      agentPushed,
    });
    if (shownKey !== lastShownKey) {
      lastShownKey = shownKey;
      container.dispatchEvent(
        new CustomEvent("persona:suggestion:shown", {
          detail: {
            suggestions: normalized.map((item) => ({ ...item })),
            surface,
            source: agentPushed ? "agent" : "config",
            variant,
          },
          bubbles: true,
          composed: true,
        })
      );
      if (agentPushed) {
        container.dispatchEvent(
          new CustomEvent("persona:suggestReplies:shown", {
            detail: {
              suggestions: normalized.map((item) => item.prompt),
            },
            bubbles: true,
            composed: true,
          })
        );
      }
    }
  };

  return {
    buttons: suggestionButtons,
    destroy: () => {
      container.removeEventListener("scroll", scheduleOverflowAffordance);
      resizeObserver?.disconnect();
      if (overflowFrame !== null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(overflowFrame);
      }
      overflowFrame = null;
    },
    render,
  };
};
