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
  /**
   * Reveal + focus the picker search field (button-open mode) with an initial
   * query. Present only on the built-in menu; the host-render path owns its own
   * filtering UI, so it leaves this undefined.
   */
  showSearch?: (initial: string) => void;
  /** Hide + clear the picker search field. Built-in menu only. */
  hideSearch?: () => void;
}

/**
 * The autocomplete menu DOM (grouped results with loading / empty / error
 * states). Pure view: the controller owns search, debounce, and `activeIndex`
 * and feeds a view-model in; the menu renders it and reports clicks/hovers back.
 * Positioned by the controller via `createPopover` (`top-start`,
 * `matchAnchorWidth`).
 *
 * Structure: a root box wrapping an optional picker search field + a scrolling
 * `role="listbox"`. The search field is hidden by default and only revealed
 * (via `showSearch`) when the menu is opened from the affordance button — the
 * typed-trigger path keeps its query in the textarea and never shows it.
 */
export function createMentionMenu(opts: {
  config: AgentWidgetContextMentionConfig;
  listboxId: string;
  onSelectIndex: (index: number) => void;
  onHoverIndex: (index: number) => void;
  /** Picker search field input → new query. */
  onSearchInput?: (value: string) => void;
  /** Picker search field keydown → controller nav (arrows / enter / escape). */
  onSearchKeydown?: (event: KeyboardEvent) => void;
}): MentionMenuParts {
  const { config, listboxId } = opts;

  const el = createNode("div", {
    className: "persona-mention-menu",
    attrs: { "data-persona-mention-menu": "" },
  });

  // Picker search field (button-open mode only) — a combobox controlling the
  // listbox below it. Hidden until `showSearch()`.
  const searchWrap = createNode("div", {
    className: "persona-mention-search",
    style: { display: "none" },
  });
  const searchIconHost = createElement("span", "persona-mention-search-icon");
  const searchIcon = renderLucideIcon("search", 15, "currentColor", 2);
  if (searchIcon) searchIconHost.appendChild(searchIcon);
  const searchInput = createNode("input", {
    className: "persona-mention-search-input",
    attrs: {
      type: "text",
      role: "combobox",
      "aria-autocomplete": "list",
      "aria-expanded": "true",
      "aria-controls": listboxId,
      "aria-label": config.searchPlaceholder ?? "Search context",
      placeholder: config.searchPlaceholder ?? "Search context…",
      autocomplete: "off",
      autocapitalize: "off",
      spellcheck: "false",
    },
  }) as HTMLInputElement;
  searchWrap.append(searchIconHost, searchInput);
  searchInput.addEventListener("input", () => opts.onSearchInput?.(searchInput.value));
  searchInput.addEventListener("keydown", (e) => opts.onSearchKeydown?.(e));

  const listEl = createNode("div", {
    className: "persona-mention-list",
    attrs: {
      role: "listbox",
      id: listboxId,
      "aria-label": "Context mentions",
    },
  });

  el.append(searchWrap, listEl);

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
    if (active) {
      listEl.setAttribute("aria-activedescendant", active.id);
      searchInput.setAttribute("aria-activedescendant", active.id);
    } else {
      listEl.removeAttribute("aria-activedescendant");
      searchInput.removeAttribute("aria-activedescendant");
    }
  };

  const render = (vm: MentionMenuViewModel) => {
    listEl.replaceChildren();
    optionEls = [];
    let flatCursor = 0;

    if (vm.groups.length === 0) {
      listEl.appendChild(
        createNode("div", { className: "persona-mention-empty", text: "No matches" })
      );
      listEl.removeAttribute("aria-activedescendant");
      searchInput.removeAttribute("aria-activedescendant");
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

      listEl.appendChild(section);
    }

    setActiveIndex(vm.activeIndex);
  };

  const showSearch = (initial: string) => {
    searchInput.value = initial;
    searchWrap.style.display = "";
    searchInput.focus();
    // The field just flipped from `display:none`, and the menu often opens
    // inside a lazy-load microtask right after the button click — a single
    // synchronous focus can be dropped by the browser in that window. Re-assert
    // it next frame (harmless no-op if focus already landed).
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => {
        if (searchWrap.style.display !== "none") searchInput.focus();
      });
    }
  };

  const hideSearch = () => {
    searchWrap.style.display = "none";
    searchInput.value = "";
    searchInput.removeAttribute("aria-activedescendant");
  };

  const destroy = () => {
    listEl.replaceChildren();
    optionEls = [];
    el.remove();
  };

  return { el, render, setActiveIndex, destroy, showSearch, hideSearch };
}
