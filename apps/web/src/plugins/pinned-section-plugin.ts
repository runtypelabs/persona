import type { AgentWidgetPlugin } from "@runtypelabs/persona";
import { injectStyles } from "@runtypelabs/persona/plugin-kit";

/**
 * Blueprint: a plugin-contributed rail section. Persona owns the slot, the
 * placement bucket and the collapsed signal; every byte of the section's DOM
 * and CSS is host-side, which is where a heavier section would code-split its
 * own dynamic import (render a skeleton first, hydrate when it resolves).
 *
 * Sections are rail-only, so this renders nothing in the panel presentation.
 */

const CLASS = "persona-pins";

const PINNED = [
  { id: "welcome", label: "Getting started", hint: "3 steps" },
  { id: "billing", label: "Billing questions", hint: "updated today" },
];

export function createPinnedSectionPlugin(
  onSelect: (label: string) => void,
): AgentWidgetPlugin {
  return {
    id: "demo-pinned-section",
    railSections: [
      {
        id: "pinned",
        title: "Pinned",
        placement: "above-conversations",
        render: ({ collapsed }) => {
          // Nothing here reads in a 52px column, so the section steps aside.
          if (collapsed) return null;
          const list = document.createElement("div");
          list.className = CLASS;
          injectStyles(list, "persona-pinned-section-plugin", PINNED_CSS);
          for (const pin of PINNED) {
            const row = document.createElement("button");
            row.type = "button";
            row.className = `${CLASS}__row`;
            const label = document.createElement("span");
            label.className = `${CLASS}__label`;
            label.textContent = pin.label;
            const hint = document.createElement("span");
            hint.className = `${CLASS}__hint`;
            hint.textContent = pin.hint;
            row.append(label, hint);
            row.addEventListener("click", () => onSelect(pin.label));
            list.appendChild(row);
          }
          return list;
        },
      },
    ],
  };
}

const PINNED_CSS = `
.persona-pins {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.persona-pins button.persona-pins__row {
  display: flex;
  align-items: baseline;
  gap: 8px;
  width: calc(100% - 12px);
  min-height: 36px;
  margin: 0 6px;
  padding: 6px 10px;
  border: 0;
  border-left: 2px solid var(--persona-primary, #2563eb);
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.persona-pins button.persona-pins__row:hover {
  background: var(--persona-surface, #ffffff);
}
.persona-pins button.persona-pins__row:focus-visible {
  outline: 2px solid var(--persona-primary, #2563eb);
  outline-offset: 2px;
}
.persona-pins__label {
  flex: 1 1 auto;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.persona-pins__hint {
  flex: none;
  font-size: 11px;
  color: var(--persona-text-muted, #6b7280);
}
`;
