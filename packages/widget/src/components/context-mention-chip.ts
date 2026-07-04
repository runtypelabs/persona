import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionPayload,
  AgentWidgetContextMentionRef,
} from "../types";

export type MentionChipStatus = "resolving" | "ready" | "error";

export interface MentionChipParts {
  el: HTMLElement;
  /** Update lifecycle state; `payload` is forwarded to `renderMentionChip` once resolved. */
  setStatus: (
    status: MentionChipStatus,
    payload?: AgentWidgetContextMentionPayload
  ) => void;
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
    // Mid-level override: the host owns the markup. Status (and the resolved
    // payload, once available) is reflected by re-invoking the renderer.
    let status: MentionChipStatus = "resolving";
    let payload: AgentWidgetContextMentionPayload | undefined;
    let el = config.renderMentionChip({ ref, status, payload, remove: onRemove });
    const setStatus = (
      next: MentionChipStatus,
      nextPayload?: AgentWidgetContextMentionPayload
    ) => {
      if (next === status && nextPayload === payload) return;
      status = next;
      payload = nextPayload;
      const replacement = config.renderMentionChip!({
        ref,
        status,
        payload,
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
    attrs: {
      "data-persona-mention-chip": "",
      "data-status": "resolving",
      // Full label on hover, since the pill truncates long labels with ellipsis.
      title: ref.label,
    },
  });

  const iconHost = createElement("span", "persona-mention-chip-icon");
  const setIcon = (name: string) => {
    iconHost.replaceChildren();
    const svg = renderLucideIcon(name, 13, "currentColor", 2);
    if (svg) iconHost.appendChild(svg);
  };
  setIcon(iconName);

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
      chip.setAttribute("title", ref.label);
    } else {
      if (spinner.parentNode === chip) spinner.remove();
      if (iconHost.parentNode !== chip) chip.insertBefore(iconHost, label);
      if (status === "error") {
        // Error is not color-only: swap to an alert icon and explain in the
        // hover title (and the aria-label reflects it via the title too).
        setIcon("triangle-alert");
        chip.setAttribute("title", `Couldn't add ${ref.label} to context`);
      } else {
        setIcon(iconName);
        chip.setAttribute("title", ref.label);
      }
    }
  };

  return { el: chip, setStatus };
}
