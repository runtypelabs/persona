// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { createContextMentionOrchestrator } from "./context-mention-orchestrator";
import { createStaticMentionSource } from "./mention-matcher";
import { loadContextMentions } from "../context-mentions-loader";
import type { AgentWidgetConfig } from "../types";

// Flush the dynamic-import → mount → handleInput promise chain. Awaiting the
// module load first makes this deterministic regardless of which test pays the
// initial (slower) dynamic-import cost.
const flush = async () => {
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

function makeConfig(): AgentWidgetConfig {
  return {
    contextMentions: {
      enabled: true,
      sources: [
        createStaticMentionSource({
          id: "files",
          label: "Files",
          items: [
            { id: "app", label: "App.tsx" },
            { id: "readme", label: "README.md" },
          ],
          resolve: (item) => ({ llmAppend: `body of ${item.label}` }),
        }),
      ],
    },
  } as AgentWidgetConfig;
}

function setup() {
  document.body.innerHTML = "";
  const form = document.createElement("form");
  const textarea = document.createElement("textarea");
  form.appendChild(textarea);
  document.body.appendChild(form);
  const config = makeConfig();
  const orchestrator = createContextMentionOrchestrator({
    config,
    textarea,
    anchor: form,
    getMessages: () => [],
    announce: vi.fn(),
  })!;
  // Place the orchestrator DOM like ui.ts does.
  textarea.parentElement!.insertBefore(orchestrator.contextRow, textarea);
  for (const btn of orchestrator.affordanceButtons) form.appendChild(btn);
  return { orchestrator, textarea, form };
}

describe("createContextMentionOrchestrator (lazy-load integration)", () => {
  it("returns null when disabled", () => {
    const o = createContextMentionOrchestrator({
      config: {} as AgentWidgetConfig,
      textarea: document.createElement("textarea"),
      anchor: document.createElement("form"),
      getMessages: () => [],
      announce: () => {},
    });
    expect(o).toBeNull();
  });

  it("exposes an affordance button and an (initially hidden) chip row", () => {
    const { orchestrator } = setup();
    expect(orchestrator.affordanceButtons).toHaveLength(1);
    expect(orchestrator.contextRow.getAttribute("data-persona-mention-context-row")).toBe("");
  });

  it("lazy-loads the runtime on the first @ and opens the menu", async () => {
    const { orchestrator, textarea } = setup();
    expect(document.querySelector("[data-persona-mention-menu]")).toBeNull();
    textarea.value = "@";
    textarea.setSelectionRange(1, 1);
    orchestrator.handleInput("insertText");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
    expect(document.querySelector("[data-persona-mention-menu]")).not.toBeNull();
  });

  it("does not lazy-load on paste of an @", async () => {
    const { orchestrator, textarea } = setup();
    textarea.value = "@";
    textarea.setSelectionRange(1, 1);
    orchestrator.handleInput("insertFromPaste");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(false);
  });

  it("selecting an item adds a chip and surfaces it via collectForSubmit", async () => {
    const { orchestrator, textarea } = setup();
    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();

    const enter = new KeyboardEvent("keydown", { key: "Enter" });
    expect(orchestrator.handleKeydown(enter)).toBe(true);

    expect(orchestrator.hasMentions()).toBe(true);
    expect(textarea.value).toBe(""); // @app stripped on select
    const collected = orchestrator.collectForSubmit();
    expect(collected?.refs.map((r) => r.itemId)).toEqual(["app"]);
    const bundle = await collected!.finalize();
    expect(bundle.llmEntries[0]).toMatchObject({ label: "App.tsx", text: "body of App.tsx" });
  });

  it("Backspace on an empty composer removes the last chip", async () => {
    const { orchestrator, textarea } = setup();
    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(orchestrator.hasMentions()).toBe(true);

    // Empty composer + Backspace → removes the chip.
    textarea.value = "";
    textarea.setSelectionRange(0, 0);
    const bs = new KeyboardEvent("keydown", { key: "Backspace" });
    expect(orchestrator.handleKeydown(bs)).toBe(true);
    expect(orchestrator.hasMentions()).toBe(false);
  });

  it("the affordance button opens the same menu", async () => {
    const { orchestrator } = setup();
    (orchestrator.affordanceButtons[0].querySelector("button") as HTMLButtonElement).click();
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
  });

  it("emits persona:mention:* analytics events", async () => {
    const { orchestrator, textarea } = setup();
    const opened = vi.fn();
    const selected = vi.fn();
    window.addEventListener("persona:mention:opened", opened);
    window.addEventListener("persona:mention:selected", selected);

    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();
    expect(opened).toHaveBeenCalled();

    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(selected).toHaveBeenCalled();

    window.removeEventListener("persona:mention:opened", opened);
    window.removeEventListener("persona:mention:selected", selected);
  });
});
