import { createElement, createNode } from "../utils/dom";
import { renderLucideIcon } from "../utils/icons";
import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

export type MentionGroupStatus = "loading" | "ready" | "empty" | "error";

export interface MentionMenuGroup {
  source: AgentWidgetContextMentionSource;
  items: AgentWidgetContextMentionItem[];
  status: MentionGroupStatus;
  /** True when `items` was capped at `maxItemsPerGroup`. */
  truncated: boolean;
}

export interface MentionMenuViewModel {
  query: string;
  groups: MentionMenuGroup[];
  /** Flat keyboard-traversal order across all groups (only selectable rows). */
  flat: { source: AgentWidgetContextMentionSource; item: AgentWidgetContextMentionItem }[];
  activeIndex: number;
}

export interface MentionMenuParts {
  el: HTMLElement;
  render: (vm: MentionMenuViewModel) => void;
  setActiveIndex: (index: number) => void;
  destroy: () => void;
}

/**
 * The autocomplete menu DOM (grouped results with loading / empty / error
 * states). Pure view: the controller owns search, debounce, and `activeIndex`
 * and feeds a view-model in; the menu renders it and reports clicks/hovers back.
 * Positioned by the controller via `createPopover` (`top-start`,
 * `matchAnchorWidth`).
 */
export function createMentionMenu(opts: {
  config: AgentWidgetContextMentionConfig;
  listboxId: string;
  onSelectIndex: (index: number) => void;
  onHoverIndex: (index: number) => void;
}): MentionMenuParts {
  const { config, listboxId } = opts;

  const el = createNode("div", {
    className: "persona-mention-menu",
    attrs: {
      role: "listbox",
      id: listboxId,
      "data-persona-mention-menu": "",
      "aria-label": "Context mentions",
    },
  });

  let optionEls: HTMLElement[] = [];

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const setActiveIndex = (index: number) => {
    optionEls.forEach((opt, i) => {
      if (i === index) {
        opt.setAttribute("data-active", "true");
        opt.scrollIntoView?.({ block: "nearest" });
      } else {
        opt.removeAttribute("data-active");
      }
    });
    const active = optionEls[index];
    if (active) el.setAttribute("aria-activedescendant", active.id);
    else el.removeAttribute("aria-activedescendant");
  };

  const render = (vm: MentionMenuViewModel) => {
    el.replaceChildren();
    optionEls = [];
    let flatCursor = 0;

    if (vm.groups.length === 0) {
      el.appendChild(
        createNode("div", { className: "persona-mention-empty", text: "No matches" })
      );
      el.removeAttribute("aria-activedescendant");
      return;
    }

    for (const group of vm.groups) {
      const section = createElement("div", "persona-mention-group");
      section.appendChild(
        createNode("div", {
          className: "persona-mention-group-header",
          text: group.source.label,
        })
      );

      if (group.status === "loading") {
        section.appendChild(
          createNode("div", {
            className: "persona-mention-status persona-mention-loading",
            text: "Loading…",
          })
        );
      } else if (group.status === "error") {
        section.appendChild(
          createNode("div", {
            className: "persona-mention-status persona-mention-error",
            text: `Couldn't load ${group.source.label}`,
          })
        );
      } else if (group.status === "empty" || group.items.length === 0) {
        section.appendChild(
          createNode("div", {
            className: "persona-mention-status persona-mention-empty",
            text: "No matches",
          })
        );
      } else {
        for (const item of group.items) {
          const index = flatCursor++;
          const row = createNode("div", {
            className: "persona-mention-option",
            attrs: { role: "option", id: optionId(index), "aria-selected": "false" },
          });

          if (config.renderMentionItem) {
            // Narrow override: host owns the inner visuals; we keep the
            // `role="option"` wrapper, a11y attrs, and click/hover wiring below.
            row.appendChild(
              config.renderMentionItem({
                item,
                source: group.source,
                query: vm.query,
                active: index === vm.activeIndex,
                index,
              })
            );
          } else {
            const iconName = item.iconName ?? config.chipIconName ?? "at-sign";
            const iconHost = createElement("span", "persona-mention-option-icon");
            const icon = renderLucideIcon(iconName, 15, "currentColor", 2);
            if (icon) iconHost.appendChild(icon);
            row.appendChild(iconHost);

            const textCol = createElement("span", "persona-mention-option-text");
            textCol.appendChild(
              createNode("span", {
                className: "persona-mention-option-label",
                text: item.label,
              })
            );
            if (item.description) {
              textCol.appendChild(
                createNode("span", {
                  className: "persona-mention-option-desc",
                  text: item.description,
                })
              );
            }
            row.appendChild(textCol);
          }

          const capturedIndex = index;
          row.addEventListener("mousedown", (e) => {
            // mousedown (not click) so the textarea doesn't blur-then-close first.
            e.preventDefault();
            opts.onSelectIndex(capturedIndex);
          });
          row.addEventListener("mouseenter", () => opts.onHoverIndex(capturedIndex));

          optionEls.push(row);
          section.appendChild(row);
        }
        if (group.truncated) {
          section.appendChild(
            createNode("div", {
              className: "persona-mention-hint",
              text: "Keep typing to narrow…",
            })
          );
        }
      }

      el.appendChild(section);
    }

    setActiveIndex(vm.activeIndex);
  };

  const destroy = () => {
    el.replaceChildren();
    optionEls = [];
    el.remove();
  };

  return { el, render, setActiveIndex, destroy };
}
