// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createStaticMentionSource } from "./utils/mention-matcher";
import { loadContextMentions } from "./context-mentions-loader";
import { loadContextMentionsInline } from "./context-mentions-inline-loader";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { ComposerMode } from "./types";

type ComposerCtx = Parameters<NonNullable<AgentWidgetPlugin["renderComposer"]>>[0];

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const modes: ComposerMode[] = [
  { id: "search", label: "Search" },
  { id: "code", label: "Code" },
];

const mentionSources = [
  createStaticMentionSource({
    id: "files",
    label: "Files",
    items: [{ id: "app", label: "app" }],
    resolve: (item: { label: string }) => ({ llmAppend: `body of ${item.label}` }),
  }),
];

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 6) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

/** Await the memoized lazy mention chunk, then pump the debounced menu search. */
const flushMentions = async () => {
  await loadContextMentions().catch(() => {});
  for (let i = 0; i < 8; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await new Promise((r) => setTimeout(r, 0));
  }
};

const footerOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-widget-footer")!;

const rowsOf = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>("[data-persona-composer-chip-row]")
  );

const rowOf = (mount: HTMLElement) => rowsOf(mount)[0];

const inputOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-input]")!;

const textareaOf = (mount: HTMLElement) =>
  inputOf(mount) as HTMLTextAreaElement;

/** "mode" / "mention" per chip, in DOM order. */
const chipKinds = (mount: HTMLElement) =>
  Array.from(rowOf(mount)?.children ?? []).map((el) =>
    el.hasAttribute("data-persona-composer-mode") ? "mode" : "mention"
  );

const modeButton = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-composer-action="core:mode:${id}"] button`
  )!;

const modeChips = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      "[data-persona-composer-chip-row] [data-persona-composer-mode]"
    )
  );

const mentionChips = (mount: HTMLElement) =>
  Array.from(
    mount.querySelectorAll<HTMLElement>(
      "[data-persona-composer-chip-row] [data-persona-mention-chip]"
    )
  );

/** Type a trigger and commit the first menu result as a chip. */
const addMention = async (mount: HTMLElement, trigger = "@app") => {
  const textarea = textareaOf(mount);
  textarea.value = trigger;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await flushMentions();
  textarea.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  );
  await flushMentions();
};

const clearDraft = async (mount: HTMLElement) => {
  const textarea = textareaOf(mount);
  textarea.value = "";
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  await flush();
};

const isCompact = (mount: HTMLElement) =>
  footerOf(mount).hasAttribute("data-persona-composer-compact");

const createGatePlugin = () => {
  const state = { gated: true, ctx: null as ComposerCtx | null };
  const plugin: AgentWidgetPlugin = {
    id: "gate",
    renderComposer: (ctx) => {
      state.ctx = ctx;
      if (!state.gated) return null;
      const footer = document.createElement("div");
      footer.setAttribute("data-test-gate", "");
      return footer;
    },
  };
  return { plugin, state };
};

describe("shared composer chip row", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("holds mode chips and mention chips in ONE wrapping row, modes first", async () => {
    const { mount } = makeController({
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });

    modeButton(mount, "search").click();
    await flush();
    await addMention(mount);

    expect(rowsOf(mount)).toHaveLength(1);
    expect(chipKinds(mount)).toEqual(["mode", "mention"]);
    const row = rowOf(mount);
    // One rail: the wrapping is the row's own (class rule), not a nested box.
    expect(row.className).toContain("persona-composer-chip-row");
    expect(row.style.display).toBe("flex");
    expect(row.closest("[data-persona-composer-header]")).not.toBeNull();
    // No second row anywhere in the composer.
    expect(mount.querySelectorAll("[data-persona-mention-context-row]")).toHaveLength(0);
  });

  it("keeps modes ahead of mentions when the mode is activated last", async () => {
    const { mount } = makeController({
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });

    await addMention(mount);
    modeButton(mount, "search").click();
    await flush();

    expect(chipKinds(mount)).toEqual(["mode", "mention"]);
  });

  it("stays hidden while empty and hides again once the last chip goes", async () => {
    const { mount } = makeController({ composer: { modes } });
    expect(rowOf(mount).style.display).toBe("none");
    modeButton(mount, "search").click();
    await flush();
    expect(rowOf(mount).style.display).toBe("flex");
    modeButton(mount, "search").click();
    await flush();
    expect(rowOf(mount).style.display).toBe("none");
  });

  it("sits above the quote banner and the deferred submission card", async () => {
    const { mount, controller } = makeController({
      composer: { modes, streamingSubmitBehavior: "defer-one" },
    });
    controller.setQuote({ text: "quoted" } as never);
    await flush();

    const header = mount.querySelector<HTMLElement>(
      "[data-persona-composer-header]"
    )!;
    const order = Array.from(header.children).map((child) =>
      child.hasAttribute("data-persona-composer-chip-row")
        ? "chips"
        : child.hasAttribute("data-persona-composer-quote")
          ? "quote"
          : child.hasAttribute("data-persona-composer-pending")
            ? "pending"
            : "other"
    );
    expect(order.indexOf("chips")).toBeLessThan(order.indexOf("quote"));
    expect(order.indexOf("chips")).toBeLessThan(order.indexOf("pending"));
  });

  it("removing a mode chip leaves the mention chip, and the reverse", async () => {
    const { mount, controller } = makeController({
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });

    modeButton(mount, "search").click();
    await flush();
    await addMention(mount);
    expect(chipKinds(mount)).toEqual(["mode", "mention"]);

    modeChips(mount)[0]
      .querySelector<HTMLButtonElement>(".persona-mention-chip-remove")!
      .click();
    await flush();
    expect(controller.getComposerState().activeModeIds).toEqual([]);
    expect(chipKinds(mount)).toEqual(["mention"]);

    modeButton(mount, "search").click();
    await flush();
    mentionChips(mount)[0]
      .querySelector<HTMLButtonElement>(".persona-mention-chip-remove")!
      .click();
    await flushMentions();
    expect(chipKinds(mount)).toEqual(["mode"]);
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);
  });

  it("Backspace on an empty draft eats the last mention chip, never a mode chip", async () => {
    const { mount, controller } = makeController({
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });

    modeButton(mount, "search").click();
    await flush();
    await addMention(mount);
    await clearDraft(mount);
    expect(chipKinds(mount)).toEqual(["mode", "mention"]);

    const textarea = textareaOf(mount);
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
    );
    await flushMentions();
    expect(chipKinds(mount)).toEqual(["mode"]);

    // Nothing left to eat: the mode chip survives further Backspaces.
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Backspace", bubbles: true, cancelable: true })
    );
    await flushMentions();
    expect(chipKinds(mount)).toEqual(["mode"]);
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);
  });

  it("survives a composer rebuild with one row and the mode chips repainted", async () => {
    const { plugin, state } = createGatePlugin();
    const { mount, controller } = makeController({
      plugins: [plugin],
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });

    state.gated = false;
    state.ctx!.requestRender();
    await flush();

    modeButton(mount, "search").click();
    await flush();
    await addMention(mount);
    expect(chipKinds(mount)).toEqual(["mode", "mention"]);

    // Rebuild: one row in the NEW header, mode chips repainted into it, and a
    // fresh mention lands in that same row behind them.
    state.ctx!.requestRender();
    await flush();
    expect(rowsOf(mount)).toHaveLength(1);
    expect(chipKinds(mount)).toEqual(["mode"]);
    expect(controller.getComposerState().activeModeIds).toEqual(["search"]);

    await addMention(mount);
    expect(rowsOf(mount)).toHaveLength(1);
    expect(chipKinds(mount)).toEqual(["mode", "mention"]);
  });

  it("renders mode chips in inline mention display, with no mention chip row", async () => {
    const { mount } = makeController({
      composer: { modes },
      contextMentions: {
        enabled: true,
        display: "inline",
        sources: mentionSources,
      },
    });
    await loadContextMentionsInline().catch(() => {});
    await flush();

    modeButton(mount, "search").click();
    await flush();

    // The editor was swapped for the contenteditable surface; tokens live there.
    expect(inputOf(mount)).not.toBeInstanceOf(HTMLTextAreaElement);
    expect(rowsOf(mount)).toHaveLength(1);
    expect(chipKinds(mount)).toEqual(["mode"]);
    expect(mentionChips(mount)).toHaveLength(0);
    expect(mount.querySelectorAll("[data-persona-mention-context-row]")).toHaveLength(0);
  });

  it("drives compact state from the row: either chip kind alone, and both", async () => {
    const { mount } = makeController({
      composer: { modes },
      contextMentions: { enabled: true, sources: mentionSources },
    });
    expect(isCompact(mount)).toBe(true);

    // Mode chip alone.
    modeButton(mount, "search").click();
    await flush();
    expect(isCompact(mount)).toBe(false);
    modeButton(mount, "search").click();
    await flush();
    expect(isCompact(mount)).toBe(true);

    // Mention chip alone.
    await addMention(mount);
    await clearDraft(mount);
    expect(isCompact(mount)).toBe(false);

    // Both.
    modeButton(mount, "search").click();
    await flush();
    expect(isCompact(mount)).toBe(false);
  });

  it("places the row in the pill composer header, above the pill form", async () => {
    const { mount } = makeController({
      launcher: { mountMode: "composer-bar" },
      composer: { modes },
    });

    modeButton(mount, "search").click();
    await flush();

    expect(rowsOf(mount)).toHaveLength(1);
    const row = rowOf(mount);
    expect(row.closest("[data-persona-composer-header]")).not.toBeNull();
    expect(chipKinds(mount)).toEqual(["mode"]);

    const footer = footerOf(mount);
    const form = footer.querySelector<HTMLElement>("[data-persona-composer-form]")!;
    // Header is `display: contents`, so the row is a footer-level row itself.
    expect(
      row.compareDocumentPosition(form) & Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });
});
