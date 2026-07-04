// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { ContextMentionController } from "./context-mention-controller";
import { createSlashCommandsSource } from "./mention-matcher";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionComposerCapability,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionSource,
} from "../types";

const tick = () => new Promise((r) => setTimeout(r, 0));
const item = (id: string, label = id): AgentWidgetContextMentionItem => ({ id, label });

/** A composer capability spy that tracks the last-set value. */
function makeComposer() {
  let value = "";
  return {
    getValue: () => value,
    setValue: vi.fn((v: string) => {
      value = v;
    }),
    submit: vi.fn(),
    current: () => value,
  };
}

function setup(
  sources: AgentWidgetContextMentionSource[],
  cfg: Partial<AgentWidgetContextMentionConfig> = {},
  composer?: AgentWidgetContextMentionComposerCapability
) {
  const form = document.createElement("form");
  const textarea = document.createElement("textarea");
  form.appendChild(textarea);
  document.body.appendChild(form);

  const onSelect = vi.fn(() => true);
  const announce = vi.fn();
  const controller = new ContextMentionController({
    mentionConfig: { enabled: true, sources, ...cfg },
    textarea,
    anchor: form,
    getMessages: () => [],
    getConfig: () => ({}) as AgentWidgetConfig,
    onSelect,
    composer,
    announce,
  });
  return { controller, textarea, onSelect, form, announce };
}

/** An async source whose `search` promise resolves only when `release` is called. */
function makeDeferredSource(id: string): {
  source: AgentWidgetContextMentionSource;
  release: (items: AgentWidgetContextMentionItem[]) => void;
} {
  let release!: (items: AgentWidgetContextMentionItem[]) => void;
  const source: AgentWidgetContextMentionSource = {
    id,
    label: id,
    search: () => new Promise((r) => (release = r)),
    resolve: async () => ({ llmAppend: "x" }),
  };
  return { source, release: (items) => release(items) };
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

  it("opens from the button as a picker: no trigger char, search field focused, all items listed", () => {
    const { controller, textarea } = setup([
      syncSource("files", [item("App.tsx"), item("index.ts")]),
    ]);
    controller.openFromButton();

    expect(controller.isOpen()).toBe(true);
    // Crucially: nothing is inserted into the composer.
    expect(textarea.value).toBe("");

    const input = document.querySelector<HTMLInputElement>(
      ".persona-mention-search-input"
    )!;
    const wrap = document.querySelector<HTMLElement>(".persona-mention-search")!;
    expect(wrap.style.display).not.toBe("none");
    expect(document.activeElement).toBe(input);
    // Empty query → browse all.
    expect(document.querySelectorAll(".persona-mention-option")).toHaveLength(2);
  });

  it("openFromButton adopts a live typed trigger so selection strips the @query", () => {
    const { controller, textarea, onSelect } = setup([
      syncSource("files", [item("App.tsx")]),
    ]);
    // User typed "@ap" then clicked the affordance button.
    textarea.value = "hey @ap";
    textarea.setSelectionRange(7, 7);
    controller.openFromButton();

    // Adopted as a typed trigger (not picker mode): no search field, and the
    // menu is already filtered by "ap".
    expect(controller.isOpen()).toBe(true);
    const wrap = document.querySelector<HTMLElement>(".persona-mention-search")!;
    expect(wrap.style.display).toBe("none");
    expect(document.querySelectorAll(".persona-mention-option")).toHaveLength(1);

    controller.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The "@ap" span is stripped — not left stranded in the composer.
    expect(textarea.value).toBe("hey ");
  });

  it("mirrors aria-activedescendant onto the textarea and toggles aria-selected", () => {
    const { controller, textarea } = setup([
      syncSource("files", [item("App.tsx"), item("api.ts")]),
    ]);
    textarea.value = "@a";
    textarea.setSelectionRange(2, 2);
    controller.onInput();

    const options = document.querySelectorAll<HTMLElement>(".persona-mention-option");
    expect(options).toHaveLength(2);
    // First option active: aria-selected on it, aria-activedescendant on textarea.
    expect(options[0].getAttribute("aria-selected")).toBe("true");
    expect(options[1].getAttribute("aria-selected")).toBe("false");
    expect(textarea.getAttribute("aria-activedescendant")).toBe(options[0].id);

    controller.handleKeydown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(options[1].getAttribute("aria-selected")).toBe("true");
    expect(options[0].getAttribute("aria-selected")).toBe("false");
    expect(textarea.getAttribute("aria-activedescendant")).toBe(options[1].id);

    controller.close();
    expect(textarea.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("shows a Retry on a failed source and re-runs it on click", () => {
    let calls = 0;
    const flaky: AgentWidgetContextMentionSource = {
      id: "flaky",
      label: "Flaky",
      search: () => {
        calls++;
        if (calls === 1) throw new Error("boom");
        return [item("ok")];
      },
      resolve: async () => ({ llmAppend: "x" }),
    };
    const { controller, textarea } = setup([flaky]);
    textarea.value = "@o";
    textarea.setSelectionRange(2, 2);
    controller.onInput();

    // First search threw → error group with a Retry button, no options.
    const retry = document.querySelector<HTMLButtonElement>(".persona-mention-retry");
    expect(retry).not.toBeNull();
    expect(document.querySelectorAll(".persona-mention-option")).toHaveLength(0);

    retry!.click();
    // Second search succeeded → the option renders.
    expect(calls).toBe(2);
    expect(document.querySelectorAll(".persona-mention-option")).toHaveLength(1);
  });

  it("keeps the highlight on the same item when async results reorder the list", async () => {
    const { source: cmds, release } = makeDeferredSource("cmds");
    // cmds declared FIRST so its results sort ahead of files when they arrive.
    const { controller, textarea } = setup(
      [cmds, syncSource("files", [item("App.tsx"), item("azely")])],
      { searchDebounceMs: 10_000 } // keep the debounce from re-invoking mid-test
    );
    textarea.value = "@a";
    textarea.setSelectionRange(2, 2);
    controller.onInput();

    // Sync files rendered [App.tsx, azely]; move the highlight to azely.
    controller.handleKeydown(new KeyboardEvent("keydown", { key: "ArrowDown" }));
    expect(
      document.querySelector(".persona-mention-option[data-active]")?.textContent
    ).toContain("azely");

    // Async commands arrive and sort above files, pushing azely down a slot.
    release([item("alpha")]);
    await tick();

    // The highlight followed azely rather than staying on a stale index.
    expect(
      document.querySelector(".persona-mention-option[data-active]")?.textContent
    ).toContain("azely");
  });

  it("close() drops in-flight async results (no late render or announce)", async () => {
    const { source: remote, release } = makeDeferredSource("remote");
    const { controller, textarea, announce } = setup([remote]);
    textarea.value = "@x";
    textarea.setSelectionRange(2, 2);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    announce.mockClear();

    controller.close();
    release([item("late")]);
    await tick();

    // The stale search result must not render into or announce for a closed menu.
    expect(controller.isOpen()).toBe(false);
    expect(document.querySelectorAll(".persona-mention-option")).toHaveLength(0);
    expect(announce).not.toHaveBeenCalled();
  });

  it("filters from the picker search field and selects without touching the textarea", () => {
    const { controller, textarea, onSelect } = setup([
      syncSource("files", [item("App.tsx"), item("index.ts")]),
    ]);
    controller.openFromButton();

    const input = document.querySelector<HTMLInputElement>(
      ".persona-mention-search-input"
    )!;
    input.value = "app";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const options = document.querySelectorAll(".persona-mention-option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("App.tsx");

    // Enter from the search field selects the active row.
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter" }));
    expect(onSelect).toHaveBeenCalledTimes(1);
    // The picker never wrote to the composer, so there is nothing to strip.
    expect(textarea.value).toBe("");
    expect(controller.isOpen()).toBe(false);
  });

  it("dismissing the picker with Escape leaves the composer untouched (no stray trigger)", () => {
    const { controller, textarea } = setup([syncSource("files", [item("App.tsx")])]);
    controller.openFromButton();
    expect(controller.isOpen()).toBe(true);

    const input = document.querySelector<HTMLInputElement>(
      ".persona-mention-search-input"
    )!;
    input.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(controller.isOpen()).toBe(false);
    expect(textarea.value).toBe("");
    // Picker torn down: focus returns to the composer so the user keeps typing.
    expect(document.activeElement).toBe(textarea);
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

describe("ContextMentionController — slash-commands", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  /** A `/` channel driven by createSlashCommandsSource, at line-start. */
  function slashSetup(
    commands: Parameters<typeof createSlashCommandsSource>[0]["commands"],
    composer = makeComposer()
  ) {
    const s = setup(
      [],
      {
        triggers: [
          {
            trigger: "/",
            triggerPosition: "line-start",
            allowSpaces: true,
            sources: [
              createSlashCommandsSource({ id: "cmd", label: "Commands", commands }),
            ],
          },
        ],
      },
      composer
    );
    return { ...s, composer };
  }

  const pressEnter = (controller: ContextMentionController) =>
    controller.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));

  it("opens the / channel only at line-start", () => {
    const { controller, textarea } = slashSetup([
      { name: "summarize", kind: "prompt", prompt: "Please summarize." },
    ]);
    // Mid-line `/` must NOT open.
    textarea.value = "hi /sum";
    textarea.setSelectionRange(7, 7);
    controller.onInput();
    expect(controller.isOpen()).toBe(false);
    // Line-start `/` opens and lists the command.
    textarea.value = "/sum";
    textarea.setSelectionRange(4, 4);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    const options = document.querySelectorAll(".persona-mention-option");
    expect(options).toHaveLength(1);
    expect(options[0].textContent).toContain("summarize");
  });

  it("prompt macro: writes resolved text into the composer and submits", async () => {
    const { controller, textarea, composer, onSelect } = slashSetup([
      {
        name: "summarize",
        kind: "prompt",
        prompt: "Please summarize the conversation.",
        submitOnSelect: true,
      },
    ]);
    textarea.value = "/summarize";
    textarea.setSelectionRange(10, 10);
    controller.onInput();
    pressEnter(controller);
    await tick(); // runPromptMacro awaits resolve()

    expect(composer.setValue).toHaveBeenCalledWith("Please summarize the conversation.");
    expect(composer.submit).toHaveBeenCalledTimes(1);
    // No chip path for prompt macros.
    expect(onSelect).not.toHaveBeenCalled();
  });

  it("client action: runs with parsed args, adds no chip, clears the token", () => {
    const action = vi.fn();
    const { controller, textarea, onSelect } = slashSetup([
      { name: "deploy", kind: "action", action },
    ]);
    textarea.value = "/deploy staging";
    textarea.setSelectionRange(15, 15);
    controller.onInput();
    pressEnter(controller);

    expect(action).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith(
      expect.objectContaining({ args: "staging" })
    );
    // Action short-circuits: no manager chip, token stripped from the composer.
    expect(onSelect).not.toHaveBeenCalled();
    expect(textarea.value).toBe("");
  });

  it("server command: selecting inline-completes `/name ` with no chip", () => {
    const { controller, textarea, onSelect } = slashSetup([
      { name: "lookup", kind: "server", data: (args) => ({ query: args }) },
    ]);
    textarea.value = "/lookup";
    textarea.setSelectionRange(7, 7);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    pressEnter(controller);

    // No chip path (Slack-style inline completion): the composer holds editable
    // `/lookup ` text for the argument, the menu closes, and the manager (chip)
    // is never touched.
    expect(onSelect).not.toHaveBeenCalled();
    expect(textarea.value).toBe("/lookup ");
    expect(controller.isOpen()).toBe(false);
  });

  it("server command: typing past the name closes the menu (arg entry)", () => {
    const { controller, textarea } = slashSetup([
      { name: "lookup", kind: "server", data: (args) => ({ query: args }) },
    ]);
    // Name only → menu open (still choosing the command).
    textarea.value = "/lookup";
    textarea.setSelectionRange(7, 7);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    // A space (into the argument) → menu closes; there's nothing left to pick.
    textarea.value = "/lookup 1042";
    textarea.setSelectionRange(12, 12);
    controller.onInput();
    expect(controller.isOpen()).toBe(false);
  });

  it("server command: dispatchInlineCommand resolves context from typed args", async () => {
    const { controller } = slashSetup([
      { name: "lookup", kind: "server", data: (args) => ({ query: args }) },
    ]);
    const result = await controller.dispatchInlineCommand("/lookup order 42");
    expect(result?.kind).toBe("server");
    if (result?.kind !== "server") throw new Error("expected server");
    expect(result.mentions.refs).toEqual([]);
    const bundle = await result.mentions.finalize();
    // Namespaced `{ [sourceId]: { [commandName]: context } }`.
    expect(bundle.context).toEqual({ cmd: { lookup: { query: "order 42" } } });
  });

  it("arg-bearing prompt command dispatches at submit with the typed args", async () => {
    const { controller } = slashSetup([
      {
        name: "greet",
        kind: "prompt",
        prompt: (args) => `Write a greeting for ${args}.`,
        argsPlaceholder: "name",
      },
    ]);
    const result = await controller.dispatchInlineCommand("/greet Ada");
    expect(result).toEqual({ kind: "prompt", sendText: "Write a greeting for Ada." });
  });

  it("arg-bearing action command runs its handler at submit (nothing sent)", async () => {
    const action = vi.fn();
    const { controller } = slashSetup([
      { name: "deploy", kind: "action", action, argsPlaceholder: "environment" },
    ]);
    const result = await controller.dispatchInlineCommand("/deploy staging");
    expect(result).toEqual({ kind: "action" });
    expect(action).toHaveBeenCalledWith(expect.objectContaining({ args: "staging" }));
  });

  it("dispatchInlineCommand ignores plain text and non-inline commands", async () => {
    const { controller } = slashSetup([
      // A zero-arg action (no placeholder) is select-time only, not inline.
      { name: "clear", kind: "action", action: vi.fn() },
    ]);
    expect(await controller.dispatchInlineCommand("hello world")).toBeNull();
    expect(await controller.dispatchInlineCommand("/clear now")).toBeNull();
  });

  it("keeps @ mentions working alongside the / channel", () => {
    const composer = makeComposer();
    const { controller, textarea } = setup(
      [
        {
          id: "files",
          label: "Files",
          search: () => [item("App.tsx")],
          resolve: async () => ({ llmAppend: "x" }),
        },
      ],
      {
        triggers: [
          {
            trigger: "/",
            triggerPosition: "line-start",
            sources: [
              createSlashCommandsSource({
                id: "cmd",
                label: "Commands",
                commands: [{ name: "clear", kind: "action", action: vi.fn() }],
              }),
            ],
          },
        ],
      },
      composer
    );
    // `@` opens the mentions (files) channel.
    textarea.value = "@App";
    textarea.setSelectionRange(4, 4);
    controller.onInput();
    expect(
      document.querySelector(".persona-mention-option")?.textContent
    ).toContain("App.tsx");
    controller.close();
    // `/` at line-start opens the commands channel instead.
    textarea.value = "/clear";
    textarea.setSelectionRange(6, 6);
    controller.onInput();
    expect(
      document.querySelector(".persona-mention-option")?.textContent
    ).toContain("clear");
  });
});
