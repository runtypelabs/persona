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
  activeIndex: number;
}

export interface MentionMenuParts {
  el: HTMLElement;
  render: (vm: MentionMenuViewModel) => void;
  /** Move the highlight. `scroll` is false for pointer hover (don't yank the
   *  list under a stationary cursor); true for keyboard navigation. */
  setActiveIndex: (index: number, scroll?: boolean) => void;
  destroy: () => void;
  /**
   * Reveal + focus the picker search field (button-open mode) with an initial
   * query. Present only on the built-in menu; the host-render path owns its own
   * filtering UI, so it leaves this undefined.
   */
  showSearch?: (initial: string, placeholder?: string) => void;
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
  /** Retry a failed source (its group error row shows a Retry button). */
  onRetry?: (sourceId: string) => void;
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
  // Per-option repaint closures: set for `renderMentionItem` rows (so the host's
  // `ctx.active` follows the highlight); null for built-in rows (CSS handles it).
  let optionRepaint: Array<((active: boolean) => void) | null> = [];
  let currentActive = -1;

  const optionId = (i: number) => `${listboxId}-opt-${i}`;

  const applyActive = (i: number, active: boolean) => {
    const opt = optionEls[i];
    if (!opt) return;
    if (active) opt.setAttribute("data-active", "true");
    else opt.removeAttribute("data-active");
    opt.setAttribute("aria-selected", active ? "true" : "false");
    optionRepaint[i]?.(active);
  };

  const setActiveIndex = (index: number, scroll = true) => {
    if (currentActive >= 0 && currentActive !== index) applyActive(currentActive, false);
    currentActive = index;
    const active = optionEls[index];
    if (active) {
      applyActive(index, true);
      if (scroll) active.scrollIntoView?.({ block: "nearest" });
      listEl.setAttribute("aria-activedescendant", active.id);
      searchInput.setAttribute("aria-activedescendant", active.id);
    } else {
      listEl.removeAttribute("aria-activedescendant");
      searchInput.removeAttribute("aria-activedescendant");
    }
  };

  const groupSection = (label: string): HTMLElement => {
    const section = createElement("div", "persona-mention-group");
    section.appendChild(
      createNode("div", { className: "persona-mention-group-header", text: label })
    );
    return section;
  };

  const buildOption = (
    item: AgentWidgetContextMentionItem,
    source: AgentWidgetContextMentionSource,
    query: string,
    index: number
  ): HTMLElement => {
    const row = createNode("div", {
      className: "persona-mention-option",
      attrs: { role: "option", id: optionId(index), "aria-selected": "false" },
    });

    if (config.renderMentionItem) {
      // Narrow override: host owns the inner visuals; we keep the
      // `role="option"` wrapper, a11y attrs, and click/hover wiring. Repaint on
      // highlight changes so the host's `active` flag never goes stale.
      const paint = (active: boolean) => {
        row.replaceChildren(
          config.renderMentionItem!({ item, source, query, active, index })
        );
      };
      paint(false); // initial inactive paint; setActiveIndex repaints the active row
      optionRepaint.push(paint);
    } else {
      const iconName = item.iconName ?? config.chipIconName ?? "at-sign";
      const iconHost = createElement("span", "persona-mention-option-icon");
      const icon = renderLucideIcon(iconName, 15, "currentColor", 2);
      if (icon) iconHost.appendChild(icon);
      row.appendChild(iconHost);

      const textCol = createElement("span", "persona-mention-option-text");
      const labelLine = createElement("span", "persona-mention-option-labelline");
      labelLine.appendChild(
        createNode("span", { className: "persona-mention-option-label", text: item.label })
      );
      // Slash commands that take an argument show a ghost hint (`lookup ‹order
      // id›`) so it's clear you type a value after selecting, inline.
      if (item.commandArgsPlaceholder) {
        labelLine.appendChild(
          createNode("span", {
            className: "persona-mention-option-arghint",
            text: `‹${item.commandArgsPlaceholder}›`,
          })
        );
      }
      textCol.appendChild(labelLine);
      if (item.description) {
        textCol.appendChild(
          createNode("span", { className: "persona-mention-option-desc", text: item.description })
        );
      }
      row.appendChild(textCol);
      optionRepaint.push(null);
    }

    row.addEventListener("mousedown", (e) => {
      if ((e as MouseEvent).button !== 0) return; // ignore right/middle click
      // mousedown (not click) so the textarea doesn't blur-then-close first.
      e.preventDefault();
      opts.onSelectIndex(index);
    });
    // Hover highlights but must NOT scroll — that would yank rows under a
    // stationary cursor while the keyboard is driving the list.
    row.addEventListener("mouseenter", () => opts.onHoverIndex(index));

    optionEls.push(row);
    return row;
  };

  const errorRow = (source: AgentWidgetContextMentionSource): HTMLElement => {
    const row = createNode("div", {
      className: "persona-mention-status persona-mention-error",
    });
    row.appendChild(
      createNode("span", {
        className: "persona-mention-error-text",
        text: `Couldn't load ${source.label}`,
      })
    );
    if (opts.onRetry) {
      const retry = createNode("button", {
        className: "persona-mention-retry",
        attrs: { type: "button" },
        text: "Retry",
      });
      retry.addEventListener("mousedown", (e) => e.preventDefault());
      retry.addEventListener("click", (e) => {
        e.preventDefault();
        opts.onRetry!(source.id);
      });
      row.appendChild(retry);
    }
    return row;
  };

  const render = (vm: MentionMenuViewModel) => {
    listEl.replaceChildren();
    optionEls = [];
    optionRepaint = [];
    currentActive = -1;
    let flatCursor = 0;
    let readyCount = 0;
    let loadingCount = 0;
    let errorCount = 0;

    for (const group of vm.groups) {
      if (group.status === "loading") {
        loadingCount++;
        const section = groupSection(group.source.label);
        section.appendChild(
          createNode("div", {
            className: "persona-mention-status persona-mention-loading",
            text: "Loading…",
          })
        );
        listEl.appendChild(section);
      } else if (group.status === "error") {
        errorCount++;
        const section = groupSection(group.source.label);
        section.appendChild(errorRow(group.source));
        listEl.appendChild(section);
      } else if (group.status === "ready" && group.items.length > 0) {
        const section = groupSection(group.source.label);
        for (const item of group.items) {
          section.appendChild(buildOption(item, group.source, vm.query, flatCursor++));
          readyCount++;
        }
        if (group.truncated) {
          section.appendChild(
            createNode("div", {
              className: "persona-mention-hint",
              text: "Keep typing to narrow…",
            })
          );
        }
        listEl.appendChild(section);
      }
      // Empty groups render nothing; a single empty state is shown below.
    }

    // One compact empty state only when nothing is loading, erroring, or ready —
    // never a per-group "No matches" dump.
    if (readyCount === 0 && loadingCount === 0 && errorCount === 0) {
      listEl.appendChild(
        createNode("div", { className: "persona-mention-empty", text: "No matches" })
      );
    }

    if (optionEls.length > 0) {
      setActiveIndex(Math.min(Math.max(0, vm.activeIndex), optionEls.length - 1));
    } else {
      listEl.removeAttribute("aria-activedescendant");
      searchInput.removeAttribute("aria-activedescendant");
    }
  };

  const showSearch = (initial: string, placeholder?: string) => {
    searchInput.value = initial;
    // Per-channel placeholder (e.g. "Search commands…" for `/`); falls back to
    // the config default set at construction time.
    if (placeholder) searchInput.placeholder = placeholder;
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
