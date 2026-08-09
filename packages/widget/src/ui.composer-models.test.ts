// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";

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

const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const picker = (mount: HTMLElement) =>
  mount.querySelector<HTMLSelectElement>("[data-persona-composer-model-picker]");

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const models = [
  { id: "fast", label: "Fast" },
  { id: "smart", label: "Smart" },
];

describe("composer model picker", () => {
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

  it("renders nothing when composer.models is unset", () => {
    const { mount } = makeController();
    expect(picker(mount)).toBeNull();
  });

  it("renders one option per model in the end cluster", () => {
    const { mount } = makeController({ composer: { models } });
    const select = picker(mount)!;
    expect(Array.from(select.options).map((option) => option.value)).toEqual([
      "fast",
      "smart",
    ]);
    expect(
      select.closest("[data-persona-composer-actions-end]")
    ).not.toBeNull();
  });

  it("wraps the select with an aria-hidden chevron in one grid cell", () => {
    const { mount } = makeController({ composer: { models } });
    const select = picker(mount)!;
    const wrapper = select.parentElement!;
    expect(wrapper.classList.contains("persona-composer-model-picker-wrapper")).toBe(
      true
    );
    const chevron = wrapper.querySelector(
      ".persona-composer-model-picker-chevron"
    )!;
    expect(chevron.getAttribute("aria-hidden")).toBe("true");
    // The select stays the focusable control and the accessible name holder.
    expect(select.getAttribute("aria-label")).toBe("Model");
    expect(chevron.hasAttribute("aria-label")).toBe(false);
    // The wrapper is what the registry places, so it carries the action id.
    expect(wrapper.getAttribute("data-persona-composer-action")).toBe("core:model");
  });

  it("keeps a long model label on the select without extra markup", () => {
    const longLabel = "Claude Opus 4.6 Extended Thinking Preview (2026-08)";
    const { mount } = makeController({
      composer: { models: [{ id: "long", label: longLabel }] },
    });
    const select = picker(mount)!;
    expect(select.options[0].textContent).toBe(longLabel);
    // Truncation is CSS on the select itself, so appearance:none cannot
    // reintroduce a second text node that escapes the ellipsis.
    expect(select.children).toHaveLength(1);
    expect(select.parentElement!.children).toHaveLength(2);
  });

  it("seeds the selection from composer.selectedModelId", () => {
    const { mount, controller } = makeController({
      composer: { models, selectedModelId: "smart" },
    });
    expect(picker(mount)!.value).toBe("smart");
    expect(controller.getComposerState().selectedModelId).toBe("smart");
  });

  it("falls back to the first model when the seed is unknown", () => {
    const { mount } = makeController({
      composer: { models, selectedModelId: "gone" },
    });
    expect(picker(mount)!.value).toBe("fast");
  });

  it("writes the selection to composer state, not to config", async () => {
    const config = { composer: { models, selectedModelId: "fast" } };
    const { mount, controller } = makeController(config);
    const select = picker(mount)!;
    select.value = "smart";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(controller.getComposerState().selectedModelId).toBe("smart");
    expect(config.composer.selectedModelId).toBe("fast");
  });

  it("never mutates config.agent", async () => {
    const agent = { name: "Inline", model: "default", systemPrompt: "hi" };
    const { mount } = makeController({ agent, composer: { models } });
    const select = picker(mount)!;
    select.value = "smart";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(agent.model).toBe("default");
  });

  it("fires composer.onModelChange with the new id", async () => {
    const onModelChange = vi.fn();
    const { mount } = makeController({
      composer: { models, selectedModelId: "fast", onModelChange },
    });
    const select = picker(mount)!;
    select.value = "smart";
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(onModelChange).toHaveBeenCalledExactlyOnceWith("smart");

    // Re-selecting the same id is not a change.
    select.dispatchEvent(new Event("change"));
    await flush();
    expect(onModelChange).toHaveBeenCalledOnce();
  });

  it("repaints its options on controller.update()", () => {
    const { mount, controller } = makeController({ composer: { models } });
    controller.update({
      composer: { models: [{ id: "only", label: "Only" }] },
    } as never);
    expect(Array.from(picker(mount)!.options).map((o) => o.value)).toEqual([
      "only",
    ]);
  });

  it("routes a renderComposer plugin's onModelChange into the store", async () => {
    let notify: ((id: string) => void) | undefined;
    const plugin: AgentWidgetPlugin = {
      id: "custom-composer",
      renderComposer: (ctx) => {
        notify = ctx.onModelChange;
        return ctx.defaultRenderer();
      },
    };
    const config = { composer: { models, selectedModelId: "fast" } };
    const { mount, controller } = makeController({ ...config, plugins: [plugin] });
    // The plugin composed rather than replaced, so no built-in picker is added
    // on top of whatever the plugin renders from `models`.
    expect(picker(mount)).toBeNull();

    notify?.("smart");
    await flush();
    expect(controller.getComposerState().selectedModelId).toBe("smart");
    expect(config.composer.selectedModelId).toBe("fast");
  });

  it("snapshots the selection into the outgoing request", async () => {
    const sent: Record<string, unknown>[] = [];
    const { mount } = makeController({
      composer: { models, selectedModelId: "fast" },
      customFetch: async (_url: string, _init: unknown, payload: unknown) => {
        sent.push(payload as Record<string, unknown>);
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        } as unknown as Response;
      },
    });
    const select = picker(mount)!;
    select.value = "smart";
    select.dispatchEvent(new Event("change"));
    await flush();

    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush(12);

    expect(sent[0]?.composerOptions).toEqual({ selectedModelId: "smart" });
  });

  it("hands onBeforeSend the selection and honors an options patch", async () => {
    const seen: Array<Record<string, unknown>> = [];
    const sent: Record<string, unknown>[] = [];
    const { mount } = makeController({
      composer: {
        models,
        selectedModelId: "fast",
        onBeforeSend: (snapshot: { options: Record<string, unknown> }) => {
          seen.push(snapshot.options);
          return { options: { selectedModelId: "smart" } };
        },
      },
      customFetch: async (_url: string, _init: unknown, payload: unknown) => {
        sent.push(payload as Record<string, unknown>);
        return {
          ok: true,
          body: new ReadableStream({
            start(controller) {
              controller.close();
            },
          }),
        } as unknown as Response;
      },
    });
    const textarea = textareaOf(mount);
    textarea.value = "hello";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush(12);

    expect(seen[0]).toEqual({ selectedModelId: "fast" });
    expect(sent[0]?.composerOptions).toEqual({ selectedModelId: "smart" });
  });
});
