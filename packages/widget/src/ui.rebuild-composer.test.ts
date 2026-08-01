// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";

type ComposerCtx = Parameters<NonNullable<AgentWidgetPlugin["renderComposer"]>>[0];

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

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

/**
 * Composer plugin that gates the composer while `gated` is true and falls
 * through to the built-in composer once it flips: blueprint B's shape.
 */
const createGatePlugin = () => {
  const state = {
    gated: true,
    renders: 0,
    ctx: null as ComposerCtx | null,
  };
  const plugin: AgentWidgetPlugin = {
    id: "gate",
    renderComposer: (ctx) => {
      state.renders += 1;
      state.ctx = ctx;
      if (!state.gated) return null;
      const footer = document.createElement("div");
      footer.setAttribute("data-test-gate", "");
      return footer;
    },
  };
  return { plugin, state };
};

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]");

describe("rebuildComposer (composer ctx requestRender)", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => {
      try {
        controller.destroy();
      } catch {
        /* already destroyed in the test */
      }
    });
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("swaps a gated plugin composer for the default composer in place", () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({ plugins: [plugin] });

    expect(mount.querySelector("[data-test-gate]")).not.toBeNull();
    expect(textareaOf(mount)).toBeNull();

    const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
    const gateIndex = Array.from(container.children).findIndex((child) =>
      child.hasAttribute("data-test-gate")
    );

    state.gated = false;
    state.ctx!.requestRender();

    expect(mount.querySelector("[data-test-gate]")).toBeNull();
    expect(textareaOf(mount)).not.toBeNull();
    // Swapped in place: the footer keeps its slot in the panel.
    expect(
      Array.from(container.children).findIndex((child) =>
        child.classList.contains("persona-widget-footer")
      )
    ).toBe(gateIndex);
    expect(state.renders).toBe(2);
  });

  it("re-attaches the composer listener registry and the form submit handler", async () => {
    const { plugin, state } = createGatePlugin();
    const { mount, controller } = makeController({ plugins: [plugin] });

    state.gated = false;
    state.ctx!.requestRender();

    const textarea = textareaOf(mount)!;
    textarea.value = "typed after rebuild";
    textarea.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    await flush();

    expect(
      controller.getMessages().some((m) => m.content === "typed after rebuild")
    ).toBe(true);
  });

  it("re-attaches the form submit handler", async () => {
    const { plugin, state } = createGatePlugin();
    const { mount, controller } = makeController({ plugins: [plugin] });

    state.gated = false;
    state.ctx!.requestRender();

    textareaOf(mount)!.value = "submitted after rebuild";
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    expect(
      controller.getMessages().some((m) => m.content === "submitted after rebuild")
    ).toBe(true);
  });

  it("detaches the outgoing composer so its listeners cannot fire again", async () => {
    const { plugin, state } = createGatePlugin();
    const { mount, controller } = makeController({ plugins: [plugin] });

    state.gated = false;
    state.ctx!.requestRender();
    const first = textareaOf(mount)!;
    const firstForm = mount.querySelector<HTMLFormElement>(
      "[data-persona-composer-form]"
    )!;

    // Rebuild again: the first default composer is now detached.
    state.ctx!.requestRender();

    first.value = "stale listener";
    first.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Enter", bubbles: true })
    );
    firstForm.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();

    expect(controller.getMessages()).toHaveLength(0);
    expect(textareaOf(mount)).not.toBe(first);
  });

  it("carries the composer text across the rebuild", () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({ plugins: [plugin] });

    state.gated = false;
    state.ctx!.requestRender();
    textareaOf(mount)!.value = "half-written question";

    state.ctx!.requestRender();

    expect(textareaOf(mount)!.value).toBe("half-written question");
  });

  it("keeps pending attachments and rebinds the file input", async () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({
      plugins: [plugin],
      attachments: { enabled: true },
    });

    state.gated = false;
    state.ctx!.requestRender();

    const input = mount.querySelector<HTMLInputElement>(
      "[data-persona-composer-attachment-input]"
    )!;
    const file = new File(["notes"], "notes.txt", { type: "text/plain" });
    Object.defineProperty(input, "files", {
      value: { 0: file, length: 1, item: () => file },
      configurable: true,
    });
    input.dispatchEvent(new Event("change"));

    await vi.waitFor(() => {
      const previews = mount.querySelector<HTMLElement>(
        "[data-persona-composer-attachment-previews]"
      )!;
      expect(previews.children.length).toBe(1);
    });

    const previewsBefore = mount.querySelector<HTMLElement>(
      "[data-persona-composer-attachment-previews]"
    )!;

    state.ctx!.requestRender();

    const previewsAfter = mount.querySelector<HTMLElement>(
      "[data-persona-composer-attachment-previews]"
    )!;
    expect(previewsAfter).not.toBe(previewsBefore);
    // The manager survives the swap and repaints its pending previews.
    expect(previewsAfter.children.length).toBe(1);
    expect(previewsAfter.querySelector("[data-attachment-id]")).not.toBeNull();
    expect(
      mount.querySelector("[data-persona-composer-attachment-input]")
    ).not.toBe(input);
  });

  it("re-attaches the mention context row and affordance buttons", () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({
      plugins: [plugin],
      contextMentions: {
        enabled: true,
        sources: [
          {
            id: "docs",
            label: "Docs",
            items: [{ id: "a", label: "Getting started" }],
          },
        ],
      },
    });

    state.gated = false;
    state.ctx!.requestRender();

    const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    expect(footer.querySelector(".persona-mention-button")).not.toBeNull();
    const textarea = textareaOf(mount)!;
    const contextRow = textarea.parentElement!.querySelector(
      "[data-persona-mention-context-row]"
    );
    expect(contextRow).not.toBeNull();

    // Rebuild again: exactly one context row and one affordance button remain.
    state.ctx!.requestRender();
    const rebuilt = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    expect(rebuilt.querySelectorAll(".persona-mention-button").length).toBe(1);
    expect(
      rebuilt.querySelectorAll("[data-persona-mention-context-row]").length
    ).toBe(1);
  });

  it("rewires the mic button after the rebuild", () => {
    const start = vi.fn();
    class FakeSpeechRecognition {
      continuous = false;
      interimResults = false;
      lang = "";
      onresult: unknown = null;
      onerror: unknown = null;
      onend: unknown = null;
      start = start;
      stop = vi.fn();
      abort = vi.fn();
    }
    vi.stubGlobal("SpeechRecognition", FakeSpeechRecognition);

    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({
      plugins: [plugin],
      voiceRecognition: { enabled: true },
    });

    state.gated = false;
    state.ctx!.requestRender();

    const mic = mount.querySelector<HTMLButtonElement>(
      "[data-persona-composer-mic]"
    )!;
    mic.click();

    expect(start).toHaveBeenCalledTimes(1);
  });

  it("rebuilds mid-stream with the streaming state applied", async () => {
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((_url: string, options: any) => {
      const signal = options.signal as AbortSignal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    try {
      const { plugin, state } = createGatePlugin();
      const { mount, controller } = makeController({ plugins: [plugin] });

      state.gated = false;
      state.ctx!.requestRender();

      const textarea = textareaOf(mount)!;
      textarea.value = "stream please";
      mount
        .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();
      expect(controller.getState().streaming).toBe(true);

      state.ctx!.requestRender();

      expect(state.ctx!.streaming).toBe(true);
      const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
      expect(footer.dataset.personaComposerStreaming).toBe("true");
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("rebuilds the pill composer in composer-bar mode", () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({
      plugins: [plugin],
      launcher: { mountMode: "composer-bar" },
    });

    state.gated = false;
    state.ctx!.requestRender();

    const pillRoot = mount.querySelector<HTMLElement>(".persona-widget-pill-root")!;
    const footer = pillRoot.querySelector<HTMLElement>(
      "[data-persona-composer-form]"
    );
    expect(footer).not.toBeNull();
    // The pill stays a child of the viewport-fixed pill root, not the panel.
    expect(mount.querySelector(".persona-widget-container")!.contains(footer!)).toBe(
      false
    );
  });

  it("carries the model selection into the next render", () => {
    const { plugin, state } = createGatePlugin();
    makeController({
      plugins: [plugin],
      composer: {
        models: [
          { id: "fast", label: "Fast" },
          { id: "smart", label: "Smart" },
        ],
        selectedModelId: "fast",
      },
    });

    expect(state.ctx!.selectedModelId).toBe("fast");
    state.ctx!.onModelChange?.("smart");
    state.ctx!.requestRender();

    expect(state.ctx!.selectedModelId).toBe("smart");
    expect(state.ctx!.models?.map((model) => model.id)).toEqual(["fast", "smart"]);
  });

  it("exposes the same storage facade as renderWelcome, memory-backed when blocked", () => {
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("blocked");
      });

    const { plugin, state } = createGatePlugin();
    makeController({ plugins: [plugin], persistState: true });

    state.ctx!.storage.set("identity", "ada");
    expect(state.ctx!.storage.get("identity")).toBe("ada");

    state.ctx!.requestRender();
    expect(state.ctx!.storage.get("identity")).toBe("ada");

    setItem.mockRestore();
    getItem.mockRestore();
  });

  it("keeps the composer suggestion row live after a rebuild", () => {
    const { plugin, state } = createGatePlugin();
    const { mount } = makeController({
      plugins: [plugin],
      suggestions: {
        starters: {
          items: ["Track my order"],
          placement: "composer",
          variant: "chip",
        },
      },
    });

    state.gated = false;
    state.ctx!.requestRender();

    const row = mount.querySelector<HTMLElement>(
      "[data-persona-composer-suggestions]"
    )!;
    expect(row.hidden).toBe(false);
    expect(row.querySelectorAll("button.persona-suggestion").length).toBe(1);
  });
});
