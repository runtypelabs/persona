import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import { AgentWidgetSession } from "../session";
import {
  AgentWidgetConfig,
  AgentWidgetMessage,
  AgentWidgetResolvedSuggestion,
  AgentWidgetSuggestion,
  AgentWidgetSuggestionChipsConfig,
  AgentWidgetSuggestionBehavior,
  AgentWidgetSuggestionSource,
  AgentWidgetSuggestionSurface,
  AgentWidgetSuggestionVariant,
} from "../types";
import type { AgentWidgetPlugin } from "../plugins/types";

export type NormalizedSuggestion = Omit<
  AgentWidgetResolvedSuggestion,
  "behavior"
> & {
  behavior?: AgentWidgetSuggestionBehavior;
};

/** DOM attribute values stay kebab-case; TS surface values stay camelCase. */
export const suggestionSurfaceAttr = (
  surface: AgentWidgetSuggestionSurface
): string => (surface === "followUp" ? "follow-up" : surface);

export interface SuggestionButtons {
  buttons: HTMLButtonElement[];
  elements: HTMLElement[];
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
  surface?: AgentWidgetSuggestionSurface;
  /** Presentation density. */
  variant?: AgentWidgetSuggestionVariant;
  /** Default click behavior, overridable per item. */
  behavior?: AgentWidgetSuggestionBehavior;
  /** Chip overflow behavior. */
  overflow?: "scroll" | "wrap";
  /** Renderer cap. */
  maxItems?: number;
  /**
   * Who produced these items. Defaults to `config`; `agent` and `host` mark
   * the follow-up surface, which keeps the legacy `persona:suggestReplies:*`
   * events and skips the starters' before-first-user-message gate.
   */
  source?: AgentWidgetSuggestionSource;
  /** Live widget config exposed to plugin hooks. */
  config?: AgentWidgetConfig;
  /** Priority-sorted plugins active for this widget instance. */
  plugins?: readonly AgentWidgetPlugin[];
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
    behavior: item.behavior,
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

// Module-level, keyed on the widget config: one widget owns several suggestion
// managers, so a per-instance flag hints once per surface instead of once.
const hintedOverflowVariant = new WeakSet<AgentWidgetConfig>();

const prefersReducedMotion = (): boolean =>
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Staggered fade-up for a newly shown set. WAAPI, not CSS transitions: morph
 * re-renders strip post-render CSS state, and a running animation survives.
 */
const animateEntrance = (elements: readonly HTMLElement[]): void => {
  if (prefersReducedMotion()) return;
  elements.forEach((element, index) => {
    if (typeof element.animate !== "function") return;
    element.animate(
      [
        { opacity: "0", transform: "translateY(4px)" },
        { opacity: "1", transform: "none" },
      ],
      {
        duration: 250,
        delay: index * 60,
        easing: "ease-out",
        fill: "backwards",
      }
    );
  });
};

export const createSuggestions = (container: HTMLElement): SuggestionButtons => {
  const suggestionButtons: HTMLButtonElement[] = [];
  const suggestionElements: HTMLElement[] = [];
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
    suggestionElements.length = 0;

    const source: AgentWidgetSuggestionSource = opts?.source ?? "config";
    const surface =
      opts?.surface ?? (source === "config" ? "starter" : "followUp");
    // Follow-ups render mid-conversation and keep the legacy event names.
    const isFollowUp = surface === "followUp";
    const variant = opts?.variant ?? "chip";
    const behavior = opts?.behavior ?? "send";
    const overflow = opts?.overflow ?? "wrap";
    const widgetConfig = opts?.config ?? ({} as AgentWidgetConfig);
    const plugins = opts?.plugins ?? [];
    const maxItems =
      typeof opts?.maxItems === "number"
        ? Math.max(0, Math.floor(opts.maxItems))
        : undefined;

    // `data-overflow` is styled under the chip variant only; hint once so the
    // no-op is discoverable without reading the CSS.
    const surfaceKey = isFollowUp ? "followUps" : "starters";
    if (
      !hintedOverflowVariant.has(widgetConfig) &&
      widgetConfig.debug === true &&
      variant !== "chip" &&
      widgetConfig.suggestions?.[surfaceKey]?.overflow !== undefined
    ) {
      hintedOverflowVariant.add(widgetConfig);
      console.info(
        `[persona] suggestions.${surfaceKey}.overflow applies to the "chip" variant only; the "${variant}" variant manages its own stacking.`
      );
    }

    // Normalize before transform: hooks see resolved items and may return the
    // loose shape, so re-resolution only fills a missing per-item behavior.
    const resolveAll = (
      list: AgentWidgetSuggestion[]
    ): AgentWidgetResolvedSuggestion[] =>
      list
        .map(normalizeSuggestion)
        .filter((item): item is NormalizedSuggestion => item !== null)
        .map((item) => ({ ...item, behavior: item.behavior ?? behavior }));

    let resolved = resolveAll(items ?? []);
    plugins.forEach((plugin) => {
      if (!plugin.transformSuggestions) return;
      resolved = resolveAll(
        plugin.transformSuggestions({
          suggestions: resolved.map((item) => ({ ...item })),
          surface,
          source,
          config: widgetConfig,
        })
      );
    });

    // The cap applies once, after the full transform chain.
    const normalized =
      maxItems === undefined ? resolved : resolved.slice(0, maxItems);

    if (!normalized.length) {
      container.hidden = true;
      lastShownKey = null;
      clearOverflowAffordance();
      return;
    }

    if (!isFollowUp) {
      const messagesToCheck = messages ?? session.getMessages();
      if (messagesToCheck.some((message) => message.role === "user")) {
        container.hidden = true;
        lastShownKey = null;
        return;
      }
    }

    container.hidden = false;
    container.classList.add("persona-suggestions");
    container.dataset.personaSuggestionSurface = suggestionSurfaceAttr(surface);
    container.dataset.variant = variant;
    container.dataset.overflow = overflow;

    const fragment = document.createDocumentFragment();
    const streaming = session.isStreaming();

    normalized.forEach((item, index) => {
      const itemBehavior = item.behavior;
      const select = () => {
        if (session.isStreaming()) return;
        const detail = {
          suggestion: { ...item },
          surface,
          source,
          behavior: itemBehavior,
        };
        const shouldContinue = container.dispatchEvent(
          new CustomEvent("persona:suggestion:selected", {
            detail,
            bubbles: true,
            composed: true,
            cancelable: true,
          })
        );
        if (isFollowUp) {
          container.dispatchEvent(
            new CustomEvent("persona:suggestReplies:selected", {
              detail: { suggestion: item.prompt },
              bubbles: true,
              composed: true,
            })
          );
        }
        if (!shouldContinue) return;

        for (const plugin of plugins) {
          if (
            plugin.onSuggestionSelect?.({
              suggestion: { ...item },
              surface,
              source,
              variant,
              config: widgetConfig,
            }) === false
          ) {
            return;
          }
        }

        if (itemBehavior === "fill") {
          textarea.value = item.prompt;
          textarea.dispatchEvent(
            new Event("input", { bubbles: true, composed: true })
          );
          textarea.focus();
          return;
        }

        textarea.value = "";
        session.sendMessage(item.prompt);
      };

      const defaultRenderer = (): HTMLElement => {
        const button = createElement(
          "button",
          `persona-suggestion persona-suggestion--${variant}`
        ) as HTMLButtonElement;
        button.type = "button";
        button.disabled = streaming;
        button.dataset.suggestionId = item.id;
        button.dataset.emphasis = item.emphasis;
        button.dataset.behavior = itemBehavior;

        // Legacy `suggestionChipsConfig` compat is chip-only: its inline
        // styles would otherwise override the card/list padding tokens.
        if (variant === "chip") {
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

        button.addEventListener("click", select);
        return button;
      };

      let element: HTMLElement | null = null;
      for (const plugin of plugins) {
        if (!plugin.renderSuggestion) continue;
        element = plugin.renderSuggestion({
          suggestion: { ...item },
          index,
          surface,
          source,
          variant,
          streaming,
          config: widgetConfig,
          defaultRenderer,
          select,
        });
        if (element) break;
      }
      element ??= defaultRenderer();
      element.dataset.suggestionId ||= item.id;
      element.dataset.behavior ||= itemBehavior;
      element.dataset.emphasis ||= item.emphasis;
      if (!(element instanceof HTMLButtonElement)) {
        element.setAttribute("aria-disabled", streaming ? "true" : "false");
      }

      fragment.appendChild(element);
      suggestionElements.push(element);
      const buttons = [
        ...(element instanceof HTMLButtonElement ? [element] : []),
        ...Array.from(element.querySelectorAll<HTMLButtonElement>("button")),
      ];
      buttons.forEach((button) => {
        if (!suggestionButtons.includes(button)) {
          button.disabled = streaming;
          suggestionButtons.push(button);
        }
      });
    });
    container.appendChild(fragment);
    syncOverflowAffordance();
    scheduleOverflowAffordance();

    const shownKey = JSON.stringify({
      normalized,
      surface,
      variant,
      source,
    });
    if (shownKey !== lastShownKey) {
      lastShownKey = shownKey;
      // Guarded by the same key as the shown event: render() re-runs on every
      // UI update with identical items and must not re-animate.
      animateEntrance(suggestionElements);
      container.dispatchEvent(
        new CustomEvent("persona:suggestion:shown", {
          detail: {
            suggestions: normalized.map((item) => ({ ...item })),
            surface,
            source,
            variant,
          },
          bubbles: true,
          composed: true,
        })
      );
      if (isFollowUp) {
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
    elements: suggestionElements,
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
