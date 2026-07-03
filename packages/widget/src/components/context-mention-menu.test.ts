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
    flat: items.map((item) => ({ source, item })),
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
});
