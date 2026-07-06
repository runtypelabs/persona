// @vitest-environment jsdom

import { describe, it, expect, vi } from "vitest";
import { createContextMentionOrchestrator } from "./context-mention-orchestrator";
import { createStaticMentionSource, createSlashCommandsSource } from "./mention-matcher";
import { loadContextMentions } from "../context-mentions-loader";
import {
  loadContextMentionsInline,
  setContextMentionsInlineLoader,
} from "../context-mentions-inline-loader";
import type { AgentWidgetConfig } from "../types";

const pump = async (n = 8) => {
  for (let i = 0; i < n; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Build an inline-display orchestrator over a fresh textarea. */
function inlineSetup() {
  document.body.innerHTML = "";
  const form = document.createElement("form");
  const textarea = document.createElement("textarea");
  form.appendChild(textarea);
  document.body.appendChild(form);
  const config = {
    contextMentions: {
      enabled: true,
      display: "inline",
      sources: [
        createStaticMentionSource({
          id: "files",
          label: "Files",
          items: [{ id: "app", label: "App.tsx" }],
          resolve: (i: { label: string }) => ({ llmAppend: `body of ${i.label}` }),
        }),
      ],
    },
  } as AgentWidgetConfig;
  const orchestrator = createContextMentionOrchestrator({
    config,
    textarea,
    anchor: form,
    getMessages: () => [],
    announce: vi.fn(),
  })!;
  return { orchestrator, textarea, form };
}

// Flush the dynamic-import → mount → handleInput promise chain. Awaiting the
// module load first makes this deterministic regardless of which test pays the
// initial (slower) dynamic-import cost.
const flush = async () => {
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 4; i++) await new Promise((r) => setTimeout(r, 0));
};

/** Also flush the inline chunk (composer swap happens on its load). */
const flushInline = async () => {
  await loadContextMentionsInline().catch(() => {});
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 6; i++) await new Promise((r) => setTimeout(r, 0));
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

  it("reflects the picker open state on the affordance button (aria-expanded + aria-controls)", async () => {
    const { orchestrator } = setup();
    const button = orchestrator.affordanceButtons[0].querySelector(
      "button"
    ) as HTMLButtonElement;
    // Collapsed before any interaction.
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);

    button.click();
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
    const listbox = document.querySelector<HTMLElement>('[role="listbox"]')!;
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(button.getAttribute("aria-controls")).toBe(listbox.id);

    // Escape closes the picker → button collapses and drops the dangling control.
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(button.getAttribute("aria-expanded")).toBe("false");
    expect(button.hasAttribute("aria-controls")).toBe(false);
  });

  it("does not put aria-expanded on the composer surface (role=textbox keeps aria-haspopup instead)", async () => {
    const { orchestrator, textarea } = setup();
    textarea.value = "@";
    textarea.setSelectionRange(1, 1);
    orchestrator.handleInput("insertText");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
    // aria-expanded is unsupported on role=textbox; the popup is advertised via
    // aria-haspopup + aria-controls + the result-count live region instead.
    expect(textarea.hasAttribute("aria-expanded")).toBe(false);
    expect(textarea.getAttribute("aria-haspopup")).toBe("listbox");
    expect(textarea.getAttribute("aria-controls")).toBe(
      document.querySelector<HTMLElement>('[role="listbox"]')!.id
    );
  });

  it("takeInlineCommand: ignores plain text, dispatches a leading server command", async () => {
    document.body.innerHTML = "";
    const form = document.createElement("form");
    const textarea = document.createElement("textarea");
    form.appendChild(textarea);
    document.body.appendChild(form);
    const config = {
      contextMentions: {
        enabled: true,
        sources: [],
        triggers: [
          {
            trigger: "/",
            triggerPosition: "line-start",
            sources: [
              createSlashCommandsSource({
                id: "cmd",
                label: "Commands",
                commands: [
                  {
                    name: "lookup",
                    kind: "server",
                    argsPlaceholder: "order id",
                    data: (args) => ({ orderId: args }),
                  },
                ],
              }),
            ],
          },
        ],
      },
    } as AgentWidgetConfig;
    const orchestrator = createContextMentionOrchestrator({
      config,
      textarea,
      anchor: form,
      getMessages: () => [],
      announce: vi.fn(),
    })!;

    // Plain text never loads the runtime or matches.
    expect(await orchestrator.takeInlineCommand("just a message")).toBeNull();

    // A leading `/lookup 1042` lazy-loads the runtime and resolves its context.
    const result = await orchestrator.takeInlineCommand("/lookup 1042");
    expect(result?.kind).toBe("server");
    if (result?.kind !== "server") throw new Error("expected a server command");
    expect(result.mentions.refs).toEqual([]);
    const bundle = await result.mentions.finalize();
    expect(bundle.context).toEqual({ cmd: { lookup: { orderId: "1042" } } });
  });

  it("degraded inline (chunk load fails): Backspace still removes the last chip", async () => {
    // Force the inline chunk to fail so the widget degrades to chip behavior while
    // config still says `display: "inline"`. Gating on the config (not the runtime
    // swap) lost this affordance exactly in the degraded state.
    setContextMentionsInlineLoader(() =>
      Promise.reject(new Error("no inline chunk"))
    );
    const { orchestrator, textarea } = inlineSetup();

    await flushInline().catch(() => {});
    expect(textarea.isConnected).toBe(true); // swap never happened → still textarea

    // Select a mention → the degraded path uses the chip row.
    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(orchestrator.hasMentions()).toBe(true);

    // Empty composer + Backspace removes the last chip (runtime chip mode).
    textarea.value = "";
    textarea.setSelectionRange(0, 0);
    const bs = new KeyboardEvent("keydown", { key: "Backspace" });
    expect(orchestrator.handleKeydown(bs)).toBe(true);
    expect(orchestrator.hasMentions()).toBe(false);
  });

  it("rebinds the menu engine to the live composer when the menu opened before the swap", async () => {
    // Gate the inline chunk so the menu engine mounts (bound to the textarea)
    // BEFORE the swap — the race that left the menu dead for the session.
    let releaseInline!: () => void;
    const gate = new Promise<void>((r) => (releaseInline = r));
    const realInline = await import("../context-mentions-inline");
    setContextMentionsInlineLoader(() => gate.then(() => realInline));

    const { orchestrator, textarea, form } = inlineSetup();

    // Open the menu on the still-live textarea (inline swap gated).
    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
    expect(textarea.isConnected).toBe(true); // not swapped yet

    // Release the inline chunk → swap + engine re-mount onto the contenteditable.
    releaseInline();
    await pump();
    const editable = form.querySelector<HTMLElement>(
      '[contenteditable="true"][data-persona-composer-input]'
    );
    expect(editable).not.toBeNull();
    expect(textarea.isConnected).toBe(false);

    // A post-swap `@` drives a WORKING menu on the contenteditable and selecting
    // inserts a token there (proving the engine tracks the live element, not the
    // detached textarea).
    const el = editable as unknown as HTMLTextAreaElement;
    el.value = "@app";
    orchestrator.handleInput("insertText");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(editable!.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    expect(orchestrator.hasMentions()).toBe(true);
  });

  it("a mention committed pre-swap (chip path) survives the engine rebind and still finalizes", async () => {
    // Gate the inline chunk: the user opens the menu and COMMITS a mention while
    // the textarea is still live (chip path, resolve in flight), then the chunk
    // lands. The rebind must not discard the manager — the committed chip and its
    // resolve must survive into the submit payload.
    let releaseInline!: () => void;
    const gate = new Promise<void>((r) => (releaseInline = r));
    const realInline = await import("../context-mentions-inline");
    setContextMentionsInlineLoader(() => gate.then(() => realInline));

    const { orchestrator, textarea, form } = inlineSetup();

    textarea.value = "@app";
    textarea.setSelectionRange(4, 4);
    orchestrator.handleInput("insertText");
    await flush();
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(orchestrator.hasMentions()).toBe(true);
    expect(
      orchestrator.contextRow.querySelectorAll("[data-persona-mention-chip]")
    ).toHaveLength(1); // committed as a chip pre-swap

    // Inline chunk lands → swap + engine rebind.
    releaseInline();
    await pump();
    expect(
      form.querySelector('[contenteditable="true"][data-persona-composer-input]')
    ).not.toBeNull();
    expect(textarea.isConnected).toBe(false);

    // The pre-swap mention was NOT discarded: chip intact, still collectable.
    expect(orchestrator.hasMentions()).toBe(true);
    expect(
      orchestrator.contextRow.querySelectorAll("[data-persona-mention-chip]")
    ).toHaveLength(1);
    const collected = orchestrator.collectForSubmit();
    expect(collected?.refs.map((r) => r.itemId)).toEqual(["app"]);
    const bundle = await collected!.finalize();
    expect(bundle.llmEntries[0]).toMatchObject({
      label: "App.tsx",
      text: "body of App.tsx",
    });
  });

  it("inline display: swaps the textarea for a contenteditable and inserts a token on select", async () => {
    document.body.innerHTML = "";
    const form = document.createElement("form");
    const textarea = document.createElement("textarea");
    form.appendChild(textarea);
    document.body.appendChild(form);
    const config = {
      contextMentions: {
        enabled: true,
        display: "inline",
        sources: [
          createStaticMentionSource({
            id: "files",
            label: "Files",
            items: [{ id: "app", label: "App.tsx" }],
            resolve: (item) => ({ llmAppend: `body of ${item.label}` }),
          }),
        ],
      },
    } as AgentWidgetConfig;

    const swaps: Array<{ next: HTMLElement; prev: HTMLElement }> = [];
    const orchestrator = createContextMentionOrchestrator({
      config,
      textarea,
      anchor: form,
      getMessages: () => [],
      announce: vi.fn(),
    })!;
    orchestrator.onComposerSwap((next, prev) => swaps.push({ next, prev }));

    // The inline chunk loads on mount and swaps the textarea for a contenteditable.
    await flushInline();
    const editable = form.querySelector<HTMLElement>(
      '[contenteditable="true"][data-persona-composer-input]'
    );
    expect(editable).not.toBeNull();
    expect(textarea.isConnected).toBe(false); // replaced
    expect(swaps).toHaveLength(1);
    expect(swaps[0].next).toBe(editable);

    // Type "@app" into the swapped surface (via the textarea-compat shim) and open.
    const el = editable as unknown as HTMLTextAreaElement;
    el.value = "@app";
    orchestrator.handleInput("insertText");
    await flush();
    expect(orchestrator.isMenuOpen()).toBe(true);

    // Enter selects → an atomic token lands in the prose (no chip row), and the
    // mention is tracked for submit.
    orchestrator.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(editable!.querySelectorAll(".persona-mention-token")).toHaveLength(1);
    expect(orchestrator.contextRow.children).toHaveLength(0); // no chip row
    expect(orchestrator.hasMentions()).toBe(true);

    const collected = orchestrator.collectForSubmit();
    expect(collected?.refs.map((r) => r.itemId)).toEqual(["app"]);
    const bundle = await collected!.finalize();
    expect(bundle.llmEntries[0]).toMatchObject({
      label: "App.tsx",
      text: "body of App.tsx",
    });
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
