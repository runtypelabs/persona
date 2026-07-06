// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ContextMentionController } from "./context-mention-controller";
import { createTextareaComposerInput } from "./composer-input";
import { createContentEditableComposerInput } from "./composer-contenteditable";
import { createSlashCommandsSource } from "./mention-matcher";
import type {
  AgentWidgetConfig,
  AgentWidgetContextMentionConfig,
  AgentWidgetContextMentionItem,
  AgentWidgetContextMentionRef,
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
  // The textarea adapter derives submit from `textarea.form.requestSubmit`;
  // spy on it so prompt-macro `submitOnSelect` is observable.
  const submit = vi.fn();
  form.requestSubmit = submit;

  const onSelect = vi.fn(() => true);
  const announce = vi.fn();
  const controller = new ContextMentionController({
    mentionConfig: { enabled: true, sources, ...cfg },
    composerInput: createTextareaComposerInput(textarea),
    anchor: form,
    getMessages: () => [],
    getConfig: () => ({}) as AgentWidgetConfig,
    onSelect,
    announce,
  });
  return { controller, textarea, onSelect, form, announce, submit };
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
    commands: Parameters<typeof createSlashCommandsSource>[0]["commands"]
  ) {
    return setup([], {
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
    });
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
    const { controller, textarea, submit, onSelect } = slashSetup([
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

    // The resolved text is written straight into the composer surface.
    expect(textarea.value).toBe("Please summarize the conversation.");
    expect(submit).toHaveBeenCalledTimes(1);
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
      }
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

describe("ContextMentionController — inline coordinate space", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const appRef: AgentWidgetContextMentionRef = {
    sourceId: "files",
    itemId: "App.tsx",
    label: "App.tsx",
  };

  function renderToken(ref: AgentWidgetContextMentionRef): HTMLElement {
    const el = document.createElement("span");
    el.className = "persona-mention-token";
    const label = document.createElement("span");
    label.className = "persona-mention-token-label";
    label.textContent = `@${ref.label}`;
    el.appendChild(label);
    return el;
  }

  function inlineSetup(
    sources: AgentWidgetContextMentionSource[],
    cfg: Partial<AgentWidgetContextMentionConfig> = {}
  ) {
    const form = document.createElement("form");
    document.body.appendChild(form);
    let idSeq = 0;
    const input = createContentEditableComposerInput({
      generateId: () => `mid-${++idSeq}`,
      renderToken,
    });
    form.appendChild(input.element);
    const onInsertMention = vi.fn();
    const onMentionRejected = vi.fn();
    const controller = new ContextMentionController({
      mentionConfig: {
        enabled: true,
        display: "inline",
        sources,
        onMentionRejected,
        ...cfg,
      },
      composerInput: input,
      anchor: form,
      getMessages: () => [],
      getConfig: () => ({}) as AgentWidgetConfig,
      onSelect: vi.fn(() => true),
      onInsertMention,
      admitMention: () => true,
      announce: vi.fn(),
    });
    return { controller, input, onInsertMention, onMentionRejected };
  }

  const slashCfg = (
    commands: Parameters<typeof createSlashCommandsSource>[0]["commands"]
  ): Partial<AgentWidgetContextMentionConfig> => ({
    triggers: [
      {
        trigger: "/",
        triggerPosition: "line-start",
        allowSpaces: true,
        sources: [createSlashCommandsSource({ id: "cmd", label: "Commands", commands })],
      },
    ],
  });

  const tokenCount = (input: { element: HTMLElement }) =>
    input.element.querySelectorAll(".persona-mention-token").length;

  it("slash-command completion preserves an earlier mention token (logical splice)", () => {
    const { controller, input } = inlineSetup(
      [],
      slashCfg([{ name: "lookup", kind: "server", data: (a: string) => ({ q: a }) }])
    );
    // A token on line 1, "/look" being typed on line 2. In DISPLAY text the token
    // is "@App.tsx" (8 chars); in LOGICAL text it is one `￼` — the pre-fix code
    // sliced DISPLAY text with LOGICAL indices and destroyed the token.
    input.setDocument!({
      blocks: [
        { kind: "mention", id: "t1", ref: appRef },
        { kind: "text", value: "\n/look" },
      ],
    });
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    controller.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(tokenCount(input)).toBe(1); // token survived
    expect(input.getValue()).toBe("@App.tsx\n/lookup ");
    expect(controller.isOpen()).toBe(false);
  });

  it("action-command strip preserves an earlier mention token (logical splice)", () => {
    const action = vi.fn();
    const { controller, input } = inlineSetup(
      [],
      slashCfg([{ name: "deploy", kind: "action", action }])
    );
    input.setDocument!({
      blocks: [
        { kind: "mention", id: "t1", ref: appRef },
        { kind: "text", value: "\n/deploy" },
      ],
    });
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    controller.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(action).toHaveBeenCalledTimes(1);
    expect(tokenCount(input)).toBe(1); // token survived the /deploy strip
    expect(input.getValue()).toBe("@App.tsx\n");
  });

  it("fires the rejection path when an inline insert is stale (no silent no-op)", () => {
    const { controller, input, onInsertMention, onMentionRejected } = inlineSetup([
      syncSource("files", [item("App.tsx")]),
    ]);
    input.setValueWithCaret("@App", 4);
    controller.onInput();
    expect(controller.isOpen()).toBe(true);
    // Staleness: the composer text changes between parse and commit, so the
    // adapter's guard refuses the insert (returns null).
    (input.element.firstChild as Text).data = "@Xyz";
    controller.handleKeydown(new KeyboardEvent("keydown", { key: "Enter" }));

    expect(onInsertMention).not.toHaveBeenCalled();
    expect(tokenCount(input)).toBe(0);
    expect(onMentionRejected).toHaveBeenCalledWith(
      expect.objectContaining({ id: "App.tsx" }),
      "stale"
    );
  });
});

describe("ContextMentionController — trigger-anchored menu positioning", () => {
  beforeEach(() => {
    document.body.innerHTML = "";
  });

  const domRect = (r: Partial<DOMRect>): DOMRect =>
    ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;

  // Composer occupies x:[100, 460] (width 360) in viewport coords.
  const ANCHOR_RECT = domRect({
    left: 100,
    right: 460,
    width: 360,
    top: 200,
    bottom: 240,
  });
  /** Trigger on line 1 — same top as the composer box. */
  const TRIGGER_LINE1 = (left: number) =>
    domRect({ left, top: ANCHOR_RECT.top, width: 8, height: 20 });

  function renderToken(ref: AgentWidgetContextMentionRef): HTMLElement {
    const el = document.createElement("span");
    el.className = "persona-mention-token";
    el.textContent = `@${ref.label}`;
    return el;
  }

  function posSetup(
    triggerRect: DOMRect | null,
    opts: { rtl?: boolean; textarea?: boolean } = {}
  ) {
    const form = document.createElement("form");
    document.body.appendChild(form);
    form.getBoundingClientRect = () => ANCHOR_RECT;

    let input: ReturnType<typeof createTextareaComposerInput>;
    if (opts.textarea) {
      const ta = document.createElement("textarea");
      form.appendChild(ta);
      input = createTextareaComposerInput(ta);
    } else {
      let idSeq = 0;
      input = createContentEditableComposerInput({
        generateId: () => `mid-${++idSeq}`,
        renderToken,
      });
      form.appendChild(input.element);
      if (opts.rtl) input.element.style.direction = "rtl";
    }

    const measure = vi.fn(() => triggerRect);
    // Chip/textarea mode omits the capability entirely (graceful degradation);
    // inline mode exposes it (stubbed — jsdom Range rects are all-zeros).
    if (!opts.textarea) input.getLogicalRangeRect = measure;

    const controller = new ContextMentionController({
      mentionConfig: {
        enabled: true,
        display: "inline",
        sources: [syncSource("files", [item("App.tsx")])],
      },
      composerInput: input,
      anchor: form,
      getMessages: () => [],
      getConfig: () => ({}) as AgentWidgetConfig,
      onSelect: vi.fn(() => true),
      onInsertMention: vi.fn(),
      admitMention: () => true,
      announce: vi.fn(),
    });
    return { controller, input, form, measure };
  }

  /** Open on a typed trigger, then mock the menu's own width and reposition. */
  function openAndMeasureMenu(
    controller: ContextMentionController,
    input: ReturnType<typeof createTextareaComposerInput>,
    text: string,
    caret: number,
    menuWidth = 200
  ): HTMLElement {
    input.setValueWithCaret(text, caret);
    controller.onInput();
    const menu = document.querySelector(".persona-mention-menu") as HTMLElement;
    menu.getBoundingClientRect = () => domRect({ width: menuWidth, height: 100 });
    // Force a reposition now that the menu has a measurable width (the popover
    // subscribes to window resize).
    window.dispatchEvent(new Event("resize"));
    return menu;
  }

  it("anchors the menu's left edge to the trigger glyph when a rect is available", () => {
    // Trigger glyph at viewport x=140 → 40px from the composer's left edge (100).
    const { controller, input } = posSetup(TRIGGER_LINE1(140));
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    expect(menu.style.left).toBe("140px"); // 100 + 40
  });

  it("anchors the menu above the trigger line when the glyph is below line 1", () => {
    // Composer top=200, bottom=260 (3 lines). Trigger on line 3: top=240 → y=40.
    // Menu height=100, offset=6 → top = 200 + 40 - 6 - 100 = 134.
    const formRect = domRect({
      left: 100,
      right: 460,
      width: 360,
      top: 200,
      bottom: 260,
    });
    const form = document.createElement("form");
    document.body.appendChild(form);
    form.getBoundingClientRect = () => formRect;
    let idSeq = 0;
    const input = createContentEditableComposerInput({
      generateId: () => `mid-${++idSeq}`,
      renderToken: (ref) => {
        const el = document.createElement("span");
        el.textContent = `@${ref.label}`;
        return el;
      },
    });
    form.appendChild(input.element);
    input.getLogicalRangeRect = vi.fn(() => domRect({ left: 140, top: 240, width: 8, height: 20 }));
    const controller = new ContextMentionController({
      mentionConfig: {
        enabled: true,
        display: "inline",
        sources: [syncSource("files", [item("App.tsx")])],
      },
      composerInput: input,
      anchor: form,
      getMessages: () => [],
      getConfig: () => ({}) as AgentWidgetConfig,
      onSelect: vi.fn(() => true),
      onInsertMention: vi.fn(),
      admitMention: () => true,
      announce: vi.fn(),
    });
    input.setValueWithCaret("@a", 2);
    controller.onInput();
    const menu = document.querySelector(".persona-mention-menu") as HTMLElement;
    menu.getBoundingClientRect = () => domRect({ width: 200, height: 100 });
    window.dispatchEvent(new Event("resize"));
    expect(menu.style.top).toBe("134px");
  });

  it("uses composer top when the trigger is on line 1 (zero vertical offset)", () => {
    const { controller, input } = posSetup(TRIGGER_LINE1(140));
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    // top = 200 + 0 - 6 - 100 = 94
    expect(menu.style.top).toBe("94px");
  });

  it("clamps a near-right trigger left so the menu fits (Slack-style)", () => {
    // Trigger near the right edge (x=440 → offset 340). A 200px menu placed at 440
    // would overflow past 460, so it shifts left to right-align at 460 → left 260.
    const { controller, input } = posSetup(TRIGGER_LINE1(440));
    const menu = openAndMeasureMenu(controller, input, "@a", 2, 200);
    expect(menu.style.left).toBe("260px"); // 460 - 200
  });

  it("falls back to composer anchoring when the rect is null", () => {
    const { controller, input } = posSetup(null);
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    expect(menu.style.left).toBe("100px"); // anchor left
  });

  it("falls back to composer anchoring in RTL", () => {
    // A rect IS available, but RTL takes the horizontal fallback path; vertical
    // line anchoring still applies (trigger on line 1 → same top as composer).
    const { controller, input } = posSetup(TRIGGER_LINE1(440), {
      rtl: true,
    });
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    expect(menu.style.left).toBe("100px");
    expect(menu.style.top).toBe("94px");
  });

  it("line-anchors vertically in RTL when the trigger is below line 1", () => {
    const { controller, input } = posSetup(domRect({ left: 440, top: 240, width: 8, height: 20 }), {
      rtl: true,
    });
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    expect(menu.style.left).toBe("100px"); // horizontal fallback
    expect(menu.style.top).toBe("134px"); // vertical line anchor
  });

  it("falls back to composer anchoring when the composer has no capability", () => {
    const { controller, input, measure } = posSetup(TRIGGER_LINE1(140), {
      textarea: true,
    });
    const menu = openAndMeasureMenu(controller, input, "@a", 2);
    expect(menu.style.left).toBe("100px");
    expect(measure).not.toHaveBeenCalled();
  });

  it("measures once per session — no re-measure while typing the query", () => {
    const { controller, input, measure } = posSetup(TRIGGER_LINE1(140));
    input.setValueWithCaret("@a", 2);
    controller.onInput(); // opens, measures once
    input.setValueWithCaret("@ab", 3);
    controller.onInput(); // same trigger index → no re-measure
    input.setValueWithCaret("@abc", 4);
    controller.onInput();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("re-measures when the trigger index changes (new session)", () => {
    const { controller, input, measure } = posSetup(TRIGGER_LINE1(140));
    input.setValueWithCaret("@a", 2);
    controller.onInput(); // trigger at index 0, measure #1
    input.setValueWithCaret("hey @a", 6);
    controller.onInput(); // trigger moved to index 4 → measure #2
    expect(measure).toHaveBeenCalledTimes(2);
  });
});

describe("ContextMentionController — follows composer auto-grow (ResizeObserver)", () => {
  // jsdom has no ResizeObserver, so install a controllable stub whose callback we
  // fire by hand. Each instance records the observed target and observe/disconnect
  // calls, and `trigger()` invokes the box-changed callback (a wrap/auto-grow).
  class ResizeObserverStub {
    static instances: ResizeObserverStub[] = [];
    observe = vi.fn();
    disconnect = vi.fn();
    private readonly cb: () => void;
    constructor(cb: () => void) {
      this.cb = cb;
      ResizeObserverStub.instances.push(this);
    }
    trigger(): void {
      this.cb();
    }
  }

  let savedRO: typeof ResizeObserver | undefined;

  beforeEach(() => {
    document.body.innerHTML = "";
    ResizeObserverStub.instances = [];
    savedRO = globalThis.ResizeObserver;
    globalThis.ResizeObserver =
      ResizeObserverStub as unknown as typeof ResizeObserver;
  });

  afterEach(() => {
    if (savedRO) globalThis.ResizeObserver = savedRO;
    else delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
  });

  const domRect = (r: Partial<DOMRect>): DOMRect =>
    ({
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      width: 0,
      height: 0,
      x: 0,
      y: 0,
      toJSON: () => ({}),
      ...r,
    }) as DOMRect;

  // Composer occupies x:[100, 460] (width 360) in viewport coords.
  const ANCHOR_RECT = domRect({
    left: 100,
    right: 460,
    width: 360,
    top: 200,
    bottom: 240,
  });

  function renderToken(ref: AgentWidgetContextMentionRef): HTMLElement {
    const el = document.createElement("span");
    el.className = "persona-mention-token";
    el.textContent = `@${ref.label}`;
    return el;
  }

  function inlinePosSetup(triggerRect: DOMRect | null) {
    const form = document.createElement("form");
    document.body.appendChild(form);
    form.getBoundingClientRect = () => ANCHOR_RECT;
    let idSeq = 0;
    const input = createContentEditableComposerInput({
      generateId: () => `mid-${++idSeq}`,
      renderToken,
    });
    form.appendChild(input.element);
    const measure = vi.fn(() => triggerRect);
    input.getLogicalRangeRect = measure;
    const controller = new ContextMentionController({
      mentionConfig: {
        enabled: true,
        display: "inline",
        sources: [syncSource("files", [item("App.tsx")])],
      },
      composerInput: input,
      anchor: form,
      getMessages: () => [],
      getConfig: () => ({}) as AgentWidgetConfig,
      onSelect: vi.fn(() => true),
      onInsertMention: vi.fn(),
      admitMention: () => true,
      announce: vi.fn(),
    });
    return { controller, input, form, measure };
  }

  const TRIGGER_LINE1_RESIZE = domRect({ left: 140, top: ANCHOR_RECT.top, width: 8, height: 20 });

  /** Open on a typed trigger and give the menu a measurable width for reposition. */
  function openMenu(
    controller: ContextMentionController,
    input: ReturnType<typeof createContentEditableComposerInput>,
    menuWidth = 200
  ): HTMLElement {
    input.setValueWithCaret("@a", 2);
    controller.onInput();
    const menu = document.querySelector(".persona-mention-menu") as HTMLElement;
    menu.getBoundingClientRect = () => domRect({ width: menuWidth, height: 100 });
    window.dispatchEvent(new Event("resize")); // force a reposition with the width
    return menu;
  }

  it("observes the composer on open and disconnects on close", () => {
    const { controller, input, form } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    openMenu(controller, input);
    expect(ResizeObserverStub.instances).toHaveLength(1);
    const obs = ResizeObserverStub.instances[0];
    expect(obs.observe).toHaveBeenCalledWith(form);

    controller.close();
    expect(obs.disconnect).toHaveBeenCalledTimes(1);
  });

  it("disconnects the observer on destroy", () => {
    const { controller, input } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    openMenu(controller, input);
    const obs = ResizeObserverStub.instances[0];

    controller.destroy();
    expect(obs.disconnect).toHaveBeenCalledTimes(1);
  });

  it("re-measures the trigger anchor and repositions when the composer resizes", () => {
    // @ glyph starts at x=140 → 40px from the composer's left edge (100) → left 140.
    const { controller, input, measure } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    const menu = openMenu(controller, input);
    expect(menu.style.left).toBe("140px");
    expect(measure).toHaveBeenCalledTimes(1); // measured once on open

    // A wrap moved the glyph to x=240 (offset 140). Fire the observer: it must
    // re-measure and reposition so the menu tracks the glyph's new x.
    const remeasure = vi.fn(() => domRect({ left: 240, top: ANCHOR_RECT.top, width: 8, height: 20 }));
    input.getLogicalRangeRect = remeasure;
    ResizeObserverStub.instances[0].trigger();

    expect(menu.style.left).toBe("240px"); // 100 + 140, reposition ran
    expect(remeasure).toHaveBeenCalledTimes(1); // re-measured on resize
  });

  it("repositions vertically when a wrap moves the trigger to a new line", () => {
    const { controller, input } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    const menu = openMenu(controller, input);
    expect(menu.style.top).toBe("94px"); // line 1

    input.getLogicalRangeRect = vi.fn(() =>
      domRect({ left: 140, top: 240, width: 8, height: 20 })
    );
    ResizeObserverStub.instances[0].trigger();

    expect(menu.style.top).toBe("134px"); // line 3
  });

  it("does not re-measure the anchor on plain query typing (once-per-session)", () => {
    const { controller, input, measure } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    openMenu(controller, input);
    input.setValueWithCaret("@ab", 3);
    controller.onInput(); // same trigger index → no re-measure
    input.setValueWithCaret("@abc", 4);
    controller.onInput();
    expect(measure).toHaveBeenCalledTimes(1);
  });

  it("creates no observer and does not crash when ResizeObserver is undefined", () => {
    delete (globalThis as { ResizeObserver?: unknown }).ResizeObserver;
    const { controller, input } = inlinePosSetup(TRIGGER_LINE1_RESIZE);
    let menu!: HTMLElement;
    expect(() => {
      menu = openMenu(controller, input);
    }).not.toThrow();
    expect(ResizeObserverStub.instances).toHaveLength(0);
    // Positioning still works via the scroll/window-resize path (degrades cleanly).
    expect(menu.style.left).toBe("140px");
    expect(() => controller.close()).not.toThrow();
  });
});
