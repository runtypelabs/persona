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
  mount.querySelector<HTMLSelectElement>(
    '[data-persona-composer-model-picker=""]'
  );

const trigger = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>(
    '[data-persona-composer-model-picker="popover"]'
  );

const menu = () =>
  document.querySelector<HTMLElement>("[data-persona-composer-model-menu]");

const rows = () =>
  Array.from(
    menu()?.querySelectorAll<HTMLButtonElement>("[data-persona-model-option]") ??
      []
  );

const key = (target: HTMLElement, code: string) =>
  target.dispatchEvent(
    new KeyboardEvent("keydown", { key: code, bubbles: true, cancelable: true })
  );

const richModels = [
  { id: "fast", label: "Haiku 4.5", icon: "zap", description: "Fastest" },
  { id: "smart", label: "Opus 5", icon: "sparkles", description: "Most capable" },
];

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

  it("stays a native select when composer.modelPicker is unset", () => {
    const { mount } = makeController({ composer: { models: richModels } });
    const select = picker(mount)!;
    expect(select.tagName).toBe("SELECT");
    expect(select.getAttribute("data-persona-composer-model-picker")).toBe("");
    expect(trigger(mount)).toBeNull();
  });

  it("keeps the native select under an explicit native presentation", () => {
    const { mount } = makeController({
      composer: { models, modelPicker: { presentation: "native" } },
    });
    expect(picker(mount)!.tagName).toBe("SELECT");
  });

  describe("popover presentation", () => {
    const popoverConfig = (extra: Record<string, unknown> = {}) => ({
      composer: {
        models: richModels,
        modelPicker: { presentation: "popover" as const },
        ...extra,
      },
    });

    it("renders a listbox trigger in the same wrapper as the select", () => {
      const { mount } = makeController(popoverConfig());
      const button = trigger(mount)!;
      expect(button.tagName).toBe("BUTTON");
      expect(button.getAttribute("aria-haspopup")).toBe("listbox");
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(picker(mount)).toBeNull();
      const wrapper = button.parentElement!;
      expect(
        wrapper.classList.contains("persona-composer-model-picker-wrapper")
      ).toBe(true);
      expect(wrapper.getAttribute("data-persona-composer-action")).toBe(
        "core:model"
      );
      expect(
        wrapper.querySelector(".persona-composer-model-picker-chevron")
      ).not.toBeNull();
      // The trigger keeps the select's class, so themed sizing is unchanged.
      expect(button.classList.contains("persona-composer-model-picker")).toBe(
        true
      );
    });

    it("returns the menu to the stylesheet fallback when an update unsets the token", () => {
      const token = "--persona-components-composer-modelPicker-menuBackground";
      const { mount, controller } = makeController({
        ...popoverConfig(),
        theme: {
          components: { composer: { modelPicker: { menuBackground: "#1e1f20" } } },
        },
      });
      expect(mount.style.getPropertyValue(token)).toBe("#1e1f20");
      // The panel is portaled to document.body, so it never inherits the
      // mount's theme vars. Stamped on the trigger here because jsdom's
      // computed style does not inherit custom properties.
      const button = trigger(mount)!;
      button.style.setProperty(token, "#1e1f20");

      button.click();
      const panel = menu()!;
      expect(panel.style.getPropertyValue(token)).toBe("#1e1f20");
      button.click();

      // Explicit undefined is the documented reset, so the mount stops
      // carrying the var; the trigger's stand-in follows it.
      controller.update({
        theme: {
          components: { composer: { modelPicker: { menuBackground: undefined } } },
        },
      });
      expect(mount.style.getPropertyValue(token)).toBe("");
      button.style.removeProperty(token);

      // The menu outlives the update, so the next open has to clear the value
      // the first one stamped; an empty inline value is the fallback state.
      trigger(mount)!.click();
      expect(menu()).toBe(panel);
      expect(panel.style.getPropertyValue(token)).toBe("");
    });

    it("shows the selected label on the closed control", () => {
      const { mount } = makeController(
        popoverConfig({ selectedModelId: "smart" })
      );
      expect(
        trigger(mount)!.querySelector(".persona-composer-model-picker-label")!
          .textContent
      ).toBe("Opus 5");
    });

    it("opens a listbox of rows with icon, label, and description", () => {
      const { mount } = makeController(popoverConfig());
      trigger(mount)!.click();
      expect(trigger(mount)!.getAttribute("aria-expanded")).toBe("true");
      expect(menu()!.getAttribute("role")).toBe("listbox");
      const [first, second] = rows();
      expect(first.getAttribute("role")).toBe("option");
      expect(first.getAttribute("data-persona-model-option")).toBe("fast");
      expect(first.getAttribute("aria-selected")).toBe("true");
      expect(second.getAttribute("aria-selected")).toBe("false");
      expect(
        first.querySelector(".persona-composer-model-option-label")!.textContent
      ).toBe("Haiku 4.5");
      expect(
        first.querySelector(".persona-composer-model-option-description")!
          .textContent
      ).toBe("Fastest");
      expect(
        first.querySelector(".persona-composer-model-option-icon svg")
      ).not.toBeNull();
    });

    it("omits the description node for a model without one", () => {
      const { mount } = makeController({
        composer: {
          models: [{ id: "plain", label: "Plain" }],
          modelPicker: { presentation: "popover" },
        },
      });
      trigger(mount)!.click();
      expect(
        rows()[0].querySelector(".persona-composer-model-option-description")
      ).toBeNull();
    });

    it("writes a row selection to the same composer state the select drives", async () => {
      const onModelChange = vi.fn();
      const { mount, controller } = makeController(
        popoverConfig({ selectedModelId: "fast", onModelChange })
      );
      trigger(mount)!.click();
      rows()[1].click();
      await flush();
      expect(controller.getComposerState().selectedModelId).toBe("smart");
      expect(onModelChange).toHaveBeenCalledExactlyOnceWith("smart");
      // Closed, focus back on the trigger, and the label repainted.
      expect(menu()).toBeNull();
      expect(trigger(mount)!.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(trigger(mount));
      expect(
        trigger(mount)!.querySelector(".persona-composer-model-picker-label")!
          .textContent
      ).toBe("Opus 5");
    });

    it("renders composer.modelPicker.suffix muted after the label", () => {
      const { mount } = makeController(
        popoverConfig({ selectedModelId: "smart" })
      );
      const controller = controllers[controllers.length - 1];
      controller.update({
        composer: {
          models: richModels,
          modelPicker: { presentation: "popover", suffix: "High" },
        },
      } as never);
      const suffix = trigger(mount)!.querySelector(
        ".persona-composer-model-picker-suffix"
      )!;
      expect(suffix.textContent).toBe("High");
      expect(trigger(mount)!.getAttribute("aria-label")).toBe(
        "Model: Opus 5 High"
      );
    });

    it("leaves the suffix node empty when no suffix is configured", () => {
      const { mount } = makeController(popoverConfig());
      expect(
        trigger(mount)!.querySelector(
          ".persona-composer-model-picker-suffix"
        )!.textContent
      ).toBe("");
    });

    it("moves focus with the arrow keys and selects with Enter", async () => {
      const { mount, controller } = makeController(
        popoverConfig({ selectedModelId: "fast" })
      );
      const button = trigger(mount)!;
      key(button, "ArrowDown");
      expect(document.activeElement).toBe(rows()[0]);
      key(rows()[0], "ArrowDown");
      expect(document.activeElement).toBe(rows()[1]);
      key(rows()[1], "ArrowUp");
      expect(document.activeElement).toBe(rows()[0]);
      key(rows()[0], "End");
      expect(document.activeElement).toBe(rows()[1]);
      key(rows()[0], "Home");
      expect(document.activeElement).toBe(rows()[0]);
      // Enter activates a button natively; jsdom needs the click.
      rows()[1].click();
      await flush();
      expect(controller.getComposerState().selectedModelId).toBe("smart");
    });

    it("closes on Escape and returns focus to the trigger", () => {
      const { mount } = makeController(popoverConfig());
      const button = trigger(mount)!;
      button.click();
      key(rows()[0], "Escape");
      expect(menu()).toBeNull();
      expect(button.getAttribute("aria-expanded")).toBe("false");
      expect(document.activeElement).toBe(button);
    });

    it("opens with the selected row focused", () => {
      const { mount } = makeController(
        popoverConfig({ selectedModelId: "smart" })
      );
      trigger(mount)!.click();
      expect(document.activeElement).toBe(rows()[1]);
    });

    it("repaints its rows on controller.update()", () => {
      const { mount, controller } = makeController(popoverConfig());
      controller.update({
        composer: {
          models: [{ id: "only", label: "Only" }],
          modelPicker: { presentation: "popover" },
        },
      } as never);
      trigger(mount)!.click();
      expect(rows().map((r) => r.getAttribute("data-persona-model-option"))).toEqual(
        ["only"]
      );
    });

    it("rebuilds the control when the presentation flips live", () => {
      const { mount, controller } = makeController({
        composer: { models: richModels },
      });
      expect(picker(mount)!.tagName).toBe("SELECT");
      controller.update({
        composer: { models: richModels, modelPicker: { presentation: "popover" } },
      } as never);
      expect(picker(mount)).toBeNull();
      expect(trigger(mount)).not.toBeNull();
    });

    it("stays in the action row instead of folding into the overflow menu", () => {
      const { mount } = makeController(popoverConfig());
      expect(
        trigger(mount)!.closest("[data-persona-composer-actions-end]")
      ).not.toBeNull();
      const wrapper = trigger(mount)!.parentElement!;
      expect(wrapper.getAttribute("data-persona-composer-action")).toBe(
        "core:model"
      );
    });

    it("tears the menu down with the widget", () => {
      const { mount, controller } = makeController(popoverConfig());
      trigger(mount)!.click();
      expect(menu()).not.toBeNull();
      controller.destroy();
      expect(menu()).toBeNull();
    });
  });
});
