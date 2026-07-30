import type { AgentWidgetPlugin } from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

type SelectionLogger = (message: string) => void;

/**
 * Data-only customization: works with Persona's standard chip/card/list UI.
 * A real app could rank with product context, permissions, or analytics.
 * Hooks receive normalized items, so there is no string shorthand to unwrap.
 */
export const createCuratedSuggestionsPlugin = (): AgentWidgetPlugin => ({
  id: "demo-suggestion-curation",
  transformSuggestions: ({ suggestions, surface }) =>
    suggestions.map((suggestion, index) => ({
      ...suggestion,
      label:
        index === 0 ? `Recommended · ${suggestion.label}` : suggestion.label,
      description: `${surface === "starter" ? "Context-ranked" : "Based on this answer"} · ${
        suggestion.description ??
        (surface === "starter"
          ? "Personalized from account and product context"
          : "Recommended from the latest assistant response")
      }`,
      icon:
        suggestion.icon ??
        (index === 0
          ? "sparkles"
          : surface === "starter"
            ? "globe"
            : "arrow-up-right"),
      emphasis: index === 0 ? "primary" : suggestion.emphasis,
    })),
});

const CUSTOM_SUGGESTION_CSS = `
.suggestion-showcase-grid {
  width: 100%;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.suggestion-showcase-tile {
  appearance: none;
  min-width: 0;
  border: 1px solid color-mix(in srgb, var(--persona-border, #e5e7eb) 78%, transparent);
  border-radius: 18px;
  background:
    radial-gradient(circle at 92% 12%, color-mix(in srgb, var(--persona-accent, #171717) 17%, transparent), transparent 38%),
    color-mix(in srgb, var(--persona-surface, #ffffff) 94%, var(--persona-accent, #171717));
  color: var(--persona-text, #111827);
  padding: 15px;
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 12px;
  text-align: left;
  cursor: pointer;
  box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06);
  transition: transform 160ms ease, border-color 160ms ease, box-shadow 160ms ease;
}

.suggestion-showcase-tile[data-surface="follow-up"] {
  grid-column: 1 / -1;
  grid-template-columns: 32px minmax(0, 1fr) auto;
  border-radius: 14px;
  padding: 12px 14px;
}

.suggestion-showcase-tile:hover {
  transform: translateY(-2px);
  border-color: var(--persona-accent, #171717);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.1);
}

.suggestion-showcase-tile:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--persona-accent, #171717) 32%, transparent);
  outline-offset: 2px;
}

.suggestion-showcase-tile:disabled,
.suggestion-showcase-tile[data-disabled] {
  cursor: not-allowed;
  opacity: 0.55;
  transform: none;
}

.suggestion-showcase-icon {
  width: 36px;
  height: 36px;
  border-radius: 12px;
  display: grid;
  place-items: center;
  background: var(--persona-accent, #171717);
  color: var(--persona-text-inverse, #ffffff);
  font-size: 17px;
}

.suggestion-showcase-tile[data-surface="follow-up"] .suggestion-showcase-icon {
  width: 32px;
  height: 32px;
  border-radius: 10px;
}

.suggestion-showcase-copy {
  min-width: 0;
  display: grid;
  gap: 4px;
}

.suggestion-showcase-kicker {
  color: var(--persona-accent, #171717);
  font-size: 10px;
  font-weight: 750;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.suggestion-showcase-label {
  font-size: 14px;
  font-weight: 680;
  line-height: 1.25;
}

.suggestion-showcase-description {
  color: var(--persona-text-muted, #6b7280);
  font-size: 12px;
  line-height: 1.4;
}

.suggestion-showcase-action {
  align-self: center;
  color: var(--persona-text-muted, #6b7280);
  font-size: 11px;
  white-space: nowrap;
}

@media (max-width: 520px) {
  .suggestion-showcase-grid {
    grid-template-columns: 1fr;
  }
  .suggestion-showcase-tile[data-surface="follow-up"] {
    grid-column: auto;
  }
}
`;

/**
 * Full UI customization. The plugin owns every item but calls `select()` so
 * Persona still emits events and applies the configured send/fill behavior.
 */
export const createCustomSuggestionsPlugin = (
  log: SelectionLogger,
): AgentWidgetPlugin => ({
  id: "demo-custom-suggestions",
  priority: 20,
  transformSuggestions: ({ suggestions, surface }) =>
    suggestions.map((suggestion) => ({
      ...suggestion,
      description:
        suggestion.description ??
        (surface === "starter"
          ? "A completely custom suggestion component"
          : "Custom follow-up UI using the same render hook"),
    })),
  renderSuggestion: ({
    suggestion,
    surface,
    index,
    streaming,
    select,
  }) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "suggestion-showcase-tile";
    // DOM attribute values stay kebab-case; TS surface values stay camelCase.
    button.dataset.surface = surface === "followUp" ? "follow-up" : surface;
    button.disabled = streaming;
    button.innerHTML = `
      <span class="suggestion-showcase-icon" aria-hidden="true">${index === 0 ? "✦" : index === 1 ? "↗" : "→"}</span>
      <span class="suggestion-showcase-copy">
        <span class="suggestion-showcase-kicker">${index === 0 ? "Recommended" : surface === "starter" ? "Explore" : "Next step"}</span>
        <span class="suggestion-showcase-label"></span>
        ${suggestion.description ? '<span class="suggestion-showcase-description"></span>' : ""}
      </span>
      ${surface === "followUp" ? `<span class="suggestion-showcase-action">${suggestion.behavior === "fill" ? "Draft" : "Ask"} →</span>` : ""}
    `;
    button.querySelector<HTMLElement>(".suggestion-showcase-label")!.textContent =
      suggestion.label;
    const description = button.querySelector<HTMLElement>(
      ".suggestion-showcase-description",
    );
    if (description) description.textContent = suggestion.description ?? "";
    button.addEventListener("click", select);
    injectStyles(
      button,
      "persona-suggestion-showcase-plugin",
      CUSTOM_SUGGESTION_CSS,
    );
    return button;
  },
  onSuggestionSelect: ({ suggestion, surface, source }) => {
    log(
      `${surface} · ${source} · ${suggestion.behavior}: “${suggestion.label}”`,
    );
  },
});
