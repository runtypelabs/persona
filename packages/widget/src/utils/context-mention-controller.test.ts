// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextMentionController } from "./context-mention-controller";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

const tick = () => new Promise((r) => setTimeout(r, 0));
const item = (id: string, label = id): AgentWidgetContextMentionItem => ({ id, label });

function setup(
  sources: AgentWidgetContextMentionSource[],
  cfg: Partial<AgentWidgetContextMentionConfig> = {}
) {
  const form = document.createElement("form");
  const textarea = document.createElement("textarea");
  form.appendChild(textarea);
  document.body.appendChild(form);

  const onSelect = vi.fn(() => true);
  const controller = new ContextMentionController({
    mentionConfig: { enabled: true, sources, ...cfg },
    textarea,
    anchor: form,
    getMessages: () => [],
    getConfig: () => ({}) as AgentWidgetConfig,
    onSelect,
    announce: vi.fn(),
  });
  return { controller, textarea, onSelect, form };
}

const syncSource = (
  id: string,
  items: AgentWidgetContextMentionItem[]
): AgentWidgetContextMentionSource => ({
  id,
  label: id,
  search: (q) => items.filter((i) => i.label.toLowerCase().includes(q.toLowerCase())),
  resolve: async () => ({ llmAppend: "x" }),
});

describe("ContextMentionController", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  it("opens instantly on a typed trigger and lists sync results", () => {
    const { controller, textarea } = setup([
      syncSource("files", [item("App.tsx"), item("index.ts")]),
    ]);
    textarea.value = "@App";
    textarea.setSelectionRange(4, 4);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    const menu = document.querySelector("[data-persona-mention-menu]")!;
    const options = menu.querySelectorAll(".persona-mention-option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("App.tsx");
  });

  it("navigates with arrows and selects with Enter, stripping the @query", () => {
    const { controller, textarea, onSelect } = setup([
      syncSource("files", [item("App.tsx"), item("api.ts")]),
    ]);
    textarea.value = "check @a";
    textarea.setSelectionRange(8, 8);
    controller.onInput();

    // Two matches ("App.tsx" via subsequence, "api.ts"); move to the 2nd.
    const down = new KeyboardEvent("keydown", { key: "ArrowDown" });
    expect(controller.handleKeydown(down)).toBe(true);

    const enter = new KeyboardEvent("keydown", { key: "Enter" });
    expect(controller.handleKeydown(enter)).toBe(true);
    expect(onSelect).toHaveBeenCalledTimes(1);

    // The "@a" span is stripped from the textarea, leaving clean prose.
    expect(textarea.value).toBe("check ");
    expect(controller.isOpen()).toBe(false);
  });

  it("Escape closes the menu and keeps the literal trigger", () => {
    const { controller, textarea } = setup([syncSource("files", [item("App.tsx")])]);
    textarea.value = "@";
    textarea.setSelectionRange(1, 1);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    const esc = new KeyboardEvent("keydown", { key: "Escape" });
    expect(controller.handleKeydown(esc)).toBe(true);
    expect(controller.isOpen()).toBe(false);
    expect(textarea.value).toBe("@"); // literal kept
  });

  it("closes when the query is no longer a valid trigger", () => {
    const { controller, textarea } = setup([syncSource("files", [item("App.tsx")])]);
    textarea.value = "@App";
    textarea.setSelectionRange(4, 4);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    // User types a space → mention ends.
    textarea.value = "@App ";
    textarea.setSelectionRange(5, 5);
    controller.onInput();
    expect(controller.isOpen()).toBe(false);
  });

  it("caps items per group and flags truncation", () => {
    const many = Array.from({ length: 10 }, (_, i) => item(`f${i}`, `file${i}`));
    const { controller, textarea } = setup([syncSource("files", many)], {
      maxItemsPerGroup: 3,
    });
    textarea.value = "@file";
    textarea.setSelectionRange(5, 5);
    controller.onInput();
    const options = document.querySelectorAll(".persona-mention-option");
    expect(options).toHaveLength(3);
    expect(document.querySelector(".persona-mention-hint")).not.toBeNull();
  });

  it("debounces async sources and aborts the prior search on the next keystroke", async () => {
    const calls: { query: string; aborted: () => boolean }[] = [];
    const asyncSource: AgentWidgetContextMentionSource = {
      id: "remote",
      label: "Remote",
      search: (q, ctx) => {
        calls.push({ query: q, aborted: () => ctx.signal.aborted });
        return new Promise((resolve) =>
          setTimeout(() => resolve([item(q, `r-${q}`)]), 5)
        );
      },
      resolve: async () => ({ llmAppend: "x" }),
    };
    const { controller, textarea } = setup([asyncSource], { searchDebounceMs: 10 });

    textarea.value = "@a";
    textarea.setSelectionRange(2, 2);
    controller.onInput(); // first invocation classifies it async + fires once
    textarea.value = "@ab";
    textarea.setSelectionRange(3, 3);
    controller.onInput(); // next keystroke aborts the prior controller

    await tick();
    // The first in-flight search was aborted by the second keystroke.
    expect(calls[0].aborted()).toBe(true);
  });
});
