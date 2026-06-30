import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionRef,
} from "../types";

export type MentionChipStatus = "resolving" | "ready" | "error";

export interface MentionChipParts {
  el: HTMLElement;
  setStatus: (status: MentionChipStatus) => void;
}

/**
 * A single compact pill chip (icon + label + ×, ~26px) for the composer context
 * row. Mirrors the attachment chip's remove affordance but is a text pill, not a
 * 48×48 thumbnail. Honors `config.renderMentionChip` when provided.
 */
export function createMentionChip(opts: {
  ref: AgentWidgetContextMentionRef;
  config: AgentWidgetContextMentionConfig;
  onRemove: () => void;
}): MentionChipParts {
  const { ref, config, onRemove } = opts;

  if (config.renderMentionChip) {
    // Mid-level override: the host owns the markup. Status is reflected by
    // re-invoking the renderer on change.
    let status: MentionChipStatus = "resolving";
    let el = config.renderMentionChip({ ref, status, remove: onRemove });
    const setStatus = (next: MentionChipStatus) => {
      if (next === status) return;
      status = next;
      const replacement = config.renderMentionChip!({
        ref,
        status,
        remove: onRemove,
      });
      el.replaceWith(replacement);
      el = replacement;
    };
    return { el, setStatus };
  }

  const iconName = ref.iconName ?? config.chipIconName ?? "at-sign";

  const chip = createNode("div", {
    className: "persona-mention-chip",
    attrs: { "data-persona-mention-chip": "", "data-status": "resolving" },
  });

  const iconHost = createElement("span", "persona-mention-chip-icon");
  const icon = renderLucideIcon(iconName, 13, "currentColor", 2);
  if (icon) iconHost.appendChild(icon);

  // The spinner shown while the mention resolves; swapped for the icon on ready.
  const spinner = createElement("span", "persona-mention-chip-spinner");

  const label = createNode("span", {
    className: "persona-mention-chip-label",
    text: ref.label,
  });

  const removeBtn = createNode("button", {
    className: "persona-mention-chip-remove",
    attrs: {
      type: "button",
      "aria-label": `Remove ${ref.label} context`,
    },
  }) as HTMLButtonElement;
  const x = renderLucideIcon("x", 11, "currentColor", 2.5);
  if (x) removeBtn.appendChild(x);
  else removeBtn.textContent = "×";
  removeBtn.addEventListener("click", (e) => {
    e.preventDefault();
    e.stopPropagation();
    onRemove();
  });

  chip.appendChild(spinner);
  chip.appendChild(label);
  chip.appendChild(removeBtn);

  const setStatus = (status: MentionChipStatus) => {
    chip.setAttribute("data-status", status);
    if (status === "resolving") {
      if (spinner.parentNode !== chip) chip.insertBefore(spinner, label);
      if (iconHost.parentNode === chip) iconHost.remove();
    } else {
      if (spinner.parentNode === chip) spinner.remove();
      if (iconHost.parentNode !== chip) chip.insertBefore(iconHost, label);
    }
  };

  return { el: chip, setStatus };
}
