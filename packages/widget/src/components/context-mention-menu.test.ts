// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import {
  createMentionMenu,
  type MentionMenuViewModel,
} from "./context-mention-menu";
import type {
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

const source: AgentWidgetContextMentionSource = {
  id: "files",
  label: "Files",
  search: () => [],
  resolve: async () => ({}),
};

const items: AgentWidgetContextMentionItem[] = [
  { id: "a", label: "App.tsx", description: "entry" },
  { id: "b", label: "Readme" },
];

function vm(activeIndex = 0): MentionMenuViewModel {
  return {
    query: "ap",
    groups: [{ source, items, status: "ready", truncated: false }],
    activeIndex,
  };
}

function makeConfig(
  overrides: Partial<AgentWidgetContextMentionConfig> = {}
): AgentWidgetContextMentionConfig {
  return { enabled: true, sources: [source], ...overrides };
}

describe("createMentionMenu", () => {
  it("renders the built-in row (icon + label + description) by default", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render(vm());

    const rows = menu.el.querySelectorAll(".persona-mention-option");
    expect(rows).toHaveLength(2);
    expect(menu.el.querySelector(".persona-mention-option-label")?.textContent).toBe(
      "App.tsx"
    );
    expect(menu.el.querySelector(".persona-mention-option-desc")?.textContent).toBe(
      "entry"
    );
  });

  it("renders one empty state when all groups are empty (no per-group dump)", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render({
      query: "zzz",
      groups: [
        { source, items: [], status: "empty", truncated: false },
        {
          source: { ...source, id: "s2", label: "S2" },
          items: [],
          status: "empty",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });
    // Exactly one "No matches", and no empty group headers.
    expect(menu.el.querySelectorAll(".persona-mention-empty")).toHaveLength(1);
    expect(menu.el.querySelectorAll(".persona-mention-group")).toHaveLength(0);
  });

  it("uses renderMentionItem for inner content while keeping the option wrapper + wiring", () => {
    const renderMentionItem = vi.fn(
      (ctx: {
        item: AgentWidgetContextMentionItem;
        source: AgentWidgetContextMentionSource;
        query: string;
        active: boolean;
        index: number;
      }) => {
        const el = document.createElement("span");
        el.className = "my-row";
        el.dataset.id = ctx.item.id;
        el.dataset.sourceId = ctx.source.id;
        el.dataset.active = String(ctx.active);
        el.dataset.query = ctx.query;
        el.textContent = ctx.item.label;
        return el;
      }
    );
    const onSelectIndex = vi.fn();
    const onHoverIndex = vi.fn();
    const menu = createMentionMenu({
      config: makeConfig({ renderMentionItem }),
      listboxId: "lb",
      onSelectIndex,
      onHoverIndex,
    });
    menu.render(vm(1));

    const rows = menu.el.querySelectorAll<HTMLElement>(".persona-mention-option");
    expect(rows).toHaveLength(2);
    // Wrapper keeps a11y semantics.
    expect(rows[0].getAttribute("role")).toBe("option");
    // Host inner content is used; the built-in label/icon is NOT rendered.
    expect(menu.el.querySelectorAll(".my-row")).toHaveLength(2);
    expect(menu.el.querySelector(".persona-mention-option-label")).toBeNull();
    // Context carries query, source, index, and active state.
    expect(renderMentionItem).toHaveBeenCalledWith(
      expect.objectContaining({ query: "ap", index: 0, active: false })
    );
    expect(renderMentionItem).toHaveBeenCalledWith(
      expect.objectContaining({ index: 1, active: true })
    );
    expect((menu.el.querySelector(".my-row") as HTMLElement).dataset.sourceId).toBe(
      "files"
    );
    // Click/hover stay wired on the widget-owned wrapper.
    rows[0].dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    expect(onSelectIndex).toHaveBeenCalledWith(0);
    rows[1].dispatchEvent(new MouseEvent("mouseenter"));
    expect(onHoverIndex).toHaveBeenCalledWith(1);
  });

  it("keeps every listbox child to option/group/presentation and labels each group by an existing header", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    const docs: AgentWidgetContextMentionSource = { ...source, id: "docs", label: "Docs" };
    menu.render({
      query: "x",
      groups: [
        { source, items, status: "ready", truncated: true },
        { source: docs, items: [{ id: "g", label: "Guide" }], status: "ready", truncated: false },
        {
          source: { ...source, id: "net", label: "Net" },
          items: [],
          status: "loading",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });

    const listbox = menu.el.querySelector<HTMLElement>('[role="listbox"]')!;
    for (const child of Array.from(listbox.children)) {
      expect(["option", "group", "presentation"]).toContain(child.getAttribute("role"));
    }

    // Each group carries role=group + aria-labelledby → an existing header id.
    const groups = listbox.querySelectorAll<HTMLElement>('[role="group"]');
    expect(groups).toHaveLength(3);
    groups.forEach((g) => {
      const headerId = g.getAttribute("aria-labelledby")!;
      expect(headerId).toBeTruthy();
      const header = menu.el.querySelector(`#${headerId}`);
      expect(header?.classList.contains("persona-mention-group-header")).toBe(true);
    });

    // Loading + truncation-hint rows are presentational (announced via live region).
    expect(
      menu.el.querySelector(".persona-mention-loading")?.getAttribute("role")
    ).toBe("presentation");
    expect(
      menu.el.querySelector(".persona-mention-hint")?.getAttribute("role")
    ).toBe("presentation");
  });

  it("marks the empty-state row presentational (spoken via the live region)", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render({
      query: "zzz",
      groups: [{ source, items: [], status: "empty", truncated: false }],
      activeIndex: 0,
    });
    const empty = menu.el.querySelector(".persona-mention-empty")!;
    expect(empty.getAttribute("role")).toBe("presentation");
    const listbox = menu.el.querySelector<HTMLElement>('[role="listbox"]')!;
    // The empty row is a direct listbox child; it must be presentational.
    expect(Array.from(listbox.children)).toContain(empty);
  });

  it("gives options a flat aria-setsize/aria-posinset across groups", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    const docs: AgentWidgetContextMentionSource = { ...source, id: "docs", label: "Docs" };
    menu.render({
      query: "x",
      groups: [
        { source, items, status: "ready", truncated: false }, // 2 options
        { source: docs, items: [{ id: "g", label: "Guide" }], status: "ready", truncated: false }, // 1 option
      ],
      activeIndex: 0,
    });
    const options = menu.el.querySelectorAll<HTMLElement>('[role="option"]');
    expect(options).toHaveLength(3);
    // Flat total on every option; 1-based flat position across group boundaries.
    options.forEach((opt) => expect(opt.getAttribute("aria-setsize")).toBe("3"));
    expect(options[0].getAttribute("aria-posinset")).toBe("1");
    expect(options[1].getAttribute("aria-posinset")).toBe("2");
    expect(options[2].getAttribute("aria-posinset")).toBe("3");
  });

  it("renders item.group overrides under their own header while ungrouped items stay under the source label", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render({
      query: "x",
      groups: [
        {
          source,
          items: [
            { id: "a", label: "App.tsx" },
            { id: "b", label: "Recent doc", group: "Recent" },
          ],
          status: "ready",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });

    const headers = Array.from(
      menu.el.querySelectorAll<HTMLElement>(".persona-mention-group-header")
    ).map((h) => h.textContent);
    // Source label first (ungrouped item), then the override header.
    expect(headers).toEqual(["Files", "Recent"]);

    const sections = menu.el.querySelectorAll<HTMLElement>(".persona-mention-group");
    expect(sections).toHaveLength(2);
    expect(sections[0].querySelector(".persona-mention-option-label")?.textContent).toBe(
      "App.tsx"
    );
    expect(sections[1].querySelector(".persona-mention-option-label")?.textContent).toBe(
      "Recent doc"
    );
  });

  it("shares one header for items with the same group override", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render({
      query: "x",
      groups: [
        {
          source,
          items: [
            { id: "a", label: "One", group: "Pinned" },
            { id: "b", label: "Two", group: "Pinned" },
          ],
          status: "ready",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });

    const headers = menu.el.querySelectorAll<HTMLElement>(".persona-mention-group-header");
    expect(headers).toHaveLength(1);
    expect(headers[0].textContent).toBe("Pinned");
    // Both options live under the single shared header.
    const section = menu.el.querySelector<HTMLElement>(".persona-mention-group")!;
    expect(section.querySelectorAll(".persona-mention-option")).toHaveLength(2);
  });

  it("keeps the flat keyboard order matching visual order across partitions", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    document.body.appendChild(menu.el);
    menu.render({
      query: "x",
      groups: [
        {
          source,
          items: [
            { id: "a", label: "Alpha" },
            { id: "b", label: "Bravo", group: "Recent" },
            { id: "c", label: "Charlie" },
          ],
          status: "ready",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });

    // Partitioning preserves first-appearance order: [Files: Alpha, Charlie],
    // [Recent: Bravo]. Flat option indices follow that visual order.
    const options = menu.el.querySelectorAll<HTMLElement>('[role="option"]');
    expect(Array.from(options).map((o) => o.textContent)).toEqual([
      "Alpha",
      "Charlie",
      "Bravo",
    ]);
    // aria-posinset is 1-based flat and monotonic with visual order.
    expect(Array.from(options).map((o) => o.getAttribute("aria-posinset"))).toEqual([
      "1",
      "2",
      "3",
    ]);
    // The listbox's active descendant is the first flat option (visual order).
    const listbox = menu.el.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[0].id);
    // Advancing the highlight lands on the second visual option (Charlie).
    menu.setActiveIndex(1);
    expect(listbox.getAttribute("aria-activedescendant")).toBe(options[1].id);
    expect(options[1].textContent).toBe("Charlie");
  });

  it("toggles the search field's aria-expanded with its visibility", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    document.body.appendChild(menu.el);
    const input = menu.el.querySelector<HTMLInputElement>(".persona-mention-search-input")!;
    // Hidden combobox never advertises an expanded popup.
    expect(input.getAttribute("aria-expanded")).toBe("false");
    menu.showSearch?.("");
    expect(input.getAttribute("aria-expanded")).toBe("true");
    menu.hideSearch?.();
    expect(input.getAttribute("aria-expanded")).toBe("false");
  });

  it("reuses the same row elements when re-rendering an identical result set", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render(vm());
    const first = Array.from(
      menu.el.querySelectorAll<HTMLElement>(".persona-mention-option")
    );
    menu.render(vm());
    const second = Array.from(
      menu.el.querySelectorAll<HTMLElement>(".persona-mention-option")
    );
    // Same DOM nodes across renders — no rebuild churn.
    expect(second[0]).toBe(first[0]);
    expect(second[1]).toBe(first[1]);
  });

  it("keeps surviving rows' identity and updates aria-setsize when an item is removed", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    menu.render(vm());
    const firstRow = menu.el.querySelector<HTMLElement>(".persona-mention-option")!;
    expect(firstRow.getAttribute("aria-setsize")).toBe("2");

    menu.render({
      query: "ap",
      groups: [{ source, items: [items[0]], status: "ready", truncated: false }],
      activeIndex: 0,
    });
    const rows = menu.el.querySelectorAll<HTMLElement>(".persona-mention-option");
    expect(rows).toHaveLength(1);
    // Surviving row is the very same element, with refreshed setsize.
    expect(rows[0]).toBe(firstRow);
    expect(rows[0].getAttribute("aria-setsize")).toBe("1");
  });

  it("dispatches the correct item after a reorder (no stale flat index in the click handler)", () => {
    const onSelectIndex = vi.fn();
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex,
      onHoverIndex: vi.fn(),
    });
    menu.render(vm());
    const appRow = Array.from(
      menu.el.querySelectorAll<HTMLElement>(".persona-mention-option")
    ).find((r) => r.textContent?.includes("App.tsx"))!;

    // Reverse the order: App.tsx (same element) is now the second flat option.
    menu.render({
      query: "ap",
      groups: [{ source, items: [items[1], items[0]], status: "ready", truncated: false }],
      activeIndex: 0,
    });
    // It's the same reused node, now at visual index 1.
    const rows = Array.from(
      menu.el.querySelectorAll<HTMLElement>(".persona-mention-option")
    );
    expect(rows[1]).toBe(appRow);
    appRow.dispatchEvent(
      new MouseEvent("mousedown", { bubbles: true, cancelable: true })
    );
    // Handler reads the live index, so it dispatches 1, not the stale 0.
    expect(onSelectIndex).toHaveBeenCalledWith(1);
  });

  it("clones cached icons so rows sharing an icon get distinct SVG elements", () => {
    const menu = createMentionMenu({
      config: makeConfig(),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
    });
    // Both items fall back to the same default icon ("at-sign").
    menu.render({
      query: "x",
      groups: [
        {
          source,
          items: [
            { id: "a", label: "One" },
            { id: "b", label: "Two" },
          ],
          status: "ready",
          truncated: false,
        },
      ],
      activeIndex: 0,
    });
    const svgs = menu.el.querySelectorAll(".persona-mention-option-icon svg");
    expect(svgs).toHaveLength(2);
    // Distinct nodes (clones), not the same cached instance shared into two rows.
    expect(svgs[0]).not.toBe(svgs[1]);
  });

  it("hides the picker search field until showSearch, then wires input/keydown", () => {
    const onSearchInput = vi.fn();
    const onSearchKeydown = vi.fn();
    const menu = createMentionMenu({
      config: makeConfig({ searchPlaceholder: "Find a file…" }),
      listboxId: "lb",
      onSelectIndex: vi.fn(),
      onHoverIndex: vi.fn(),
      onSearchInput,
      onSearchKeydown,
    });
    document.body.appendChild(menu.el);

    const wrap = menu.el.querySelector<HTMLElement>(".persona-mention-search")!;
    const input = menu.el.querySelector<HTMLInputElement>(".persona-mention-search-input")!;
    // Hidden by default; placeholder is configurable.
    expect(wrap.style.display).toBe("none");
    expect(input.placeholder).toBe("Find a file…");
    // Options render into the inner listbox, not the root, so the search field
    // survives a re-render.
    menu.render(vm());
    expect(wrap.isConnected).toBe(true);
    expect(menu.el.querySelectorAll(".persona-mention-option")).toHaveLength(2);

    menu.showSearch?.("");
    expect(wrap.style.display).not.toBe("none");
    expect(document.activeElement).toBe(input);

    input.value = "app";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(onSearchInput).toHaveBeenCalledWith("app");

    input.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(onSearchKeydown).toHaveBeenCalled();

    menu.hideSearch?.();
    expect(wrap.style.display).toBe("none");
    expect(input.value).toBe("");
  });
});
