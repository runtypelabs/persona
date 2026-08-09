// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { ComposerAction } from "./types";

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

/** The store coalesces on a microtask, so state-driven syncs need a turn. */
const flush = async (times = 4) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const actionEl = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLElement>(`[data-persona-composer-action="${id}"]`);

const actionButton = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-composer-action="${id}"] button`
  );

const startCluster = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-actions-start]")!;
const endCluster = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-actions-end]")!;

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const hostAction = (patch: Partial<ComposerAction> = {}): ComposerAction =>
  ({
    id: "host",
    placement: "start",
    label: "Host action",
    onSelect: () => {},
    ...patch,
  }) as ComposerAction;

describe("composer action registry in the live widget", () => {
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

  it("renders host, plugin, and core contributions in one ordered row", () => {
    const plugin: AgentWidgetPlugin = {
      id: "demo",
      contributeComposerActions: () => [
        hostAction({ id: "chip", placement: "start", order: 300 }),
        hostAction({ id: "tail", placement: "end", order: 700 }),
      ],
    };
    const { mount } = makeController({
      attachments: { enabled: true },
      composer: { actions: [hostAction({ id: "host", order: 150 })] },
      plugins: [plugin],
    });

    expect(
      Array.from(startCluster(mount).children).map((child) =>
        child.getAttribute("data-persona-composer-action")
      )
    ).toEqual(["host", null, "demo:chip"]);
    // The middle slot is the untouched attachment built-in.
    expect(
      startCluster(mount).querySelector(
        "[data-persona-composer-attachment-button]"
      )
    ).not.toBeNull();

    const end = Array.from(endCluster(mount).children);
    expect(end[0].getAttribute("data-persona-composer-action")).toBe("demo:tail");
    expect(
      end[end.length - 1].querySelector("[data-persona-composer-submit]")
    ).not.toBeNull();
  });

  it("keeps send terminal even when a host action asks to sort past it", () => {
    const { mount } = makeController({
      composer: {
        actions: [hostAction({ id: "greedy", placement: "end", order: 9999 })],
      },
    });
    const end = Array.from(endCluster(mount).children);
    expect(
      end[end.length - 1].querySelector("[data-persona-composer-submit]")
    ).not.toBeNull();
    expect(end[0].getAttribute("data-persona-composer-action")).toBe("greedy");
  });

  it("gives an action the capability context, and setValue reaches the draft", () => {
    const { mount, controller } = makeController({
      composer: {
        actions: [
          hostAction({
            id: "fill",
            onSelect: (ctx) => ctx.setValue("filled by an action"),
          }),
        ],
      },
    });

    actionButton(mount, "fill")!.click();
    expect(textareaOf(mount).value).toBe("filled by an action");
    expect(controller.getComposerState().text).toBe("filled by an action");
  });

  it("submits through the composer's own pipeline", async () => {
    const { mount, controller } = makeController({
      composer: {
        actions: [
          hostAction({
            id: "send-it",
            onSelect: (ctx) => {
              ctx.setValue("sent from an action");
              ctx.submit();
            },
          }),
        ],
      },
    });

    actionButton(mount, "send-it")!.click();
    await flush();
    expect(
      controller.getMessages().some((m) => m.content === "sent from an action")
    ).toBe(true);
  });

  it("re-evaluates visible against live composer state", async () => {
    const { mount } = makeController({
      composer: {
        actions: [
          hostAction({
            id: "clear",
            order: 150,
            visible: (state) => state.text.length > 0,
          }),
        ],
      },
    });

    expect(actionEl(mount, "clear")).toBeNull();

    const textarea = textareaOf(mount);
    textarea.value = "draft";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(actionEl(mount, "clear")).not.toBeNull();

    textarea.value = "";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    await flush();
    expect(actionEl(mount, "clear")).toBeNull();
  });

  it("re-resolves config.actions on controller.update()", () => {
    const { mount, controller } = makeController({
      composer: { actions: [hostAction({ id: "first", label: "First" })] },
    });
    expect(actionButton(mount, "first")!.getAttribute("aria-label")).toBe("First");

    controller.update({
      composer: {
        actions: [
          hostAction({ id: "first", label: "Renamed" }),
          hostAction({ id: "second", label: "Second" }),
        ],
      },
    } as never);

    expect(actionButton(mount, "first")!.getAttribute("aria-label")).toBe(
      "Renamed"
    );
    expect(actionEl(mount, "second")).not.toBeNull();

    controller.update({ composer: { actions: [] } } as never);
    expect(actionEl(mount, "first")).toBeNull();
    expect(actionEl(mount, "second")).toBeNull();
  });

  it("re-resolves plugin contributions when the plugin list changes", () => {
    const plugin: AgentWidgetPlugin = {
      id: "late",
      contributeComposerActions: () => [hostAction({ id: "x" })],
    };
    const { mount, controller } = makeController({});
    expect(actionEl(mount, "late:x")).toBeNull();

    controller.update({ plugins: [plugin] } as never);
    expect(actionEl(mount, "late:x")).not.toBeNull();

    controller.update({ plugins: [] } as never);
    expect(actionEl(mount, "late:x")).toBeNull();
  });

  it("renders both clusters in the composer-bar pill", () => {
    const { mount } = makeController({
      launcher: { mountMode: "composer-bar" },
      attachments: { enabled: true },
      composer: {
        actions: [
          hostAction({ id: "s", placement: "start", order: 150 }),
          hostAction({ id: "e", placement: "end", order: 600 }),
        ],
      },
    });

    expect(actionEl(mount, "s")!.parentElement).toBe(startCluster(mount));
    expect(actionEl(mount, "e")!.parentElement).toBe(endCluster(mount));
    expect(
      endCluster(mount).lastElementChild!.querySelector(
        "[data-persona-composer-submit]"
      )
    ).not.toBeNull();
  });

  it("survives a composer rebuild: custom actions are destroyed and re-rendered", () => {
    const destroy = vi.fn();
    let ctx: { requestRender: () => void } | null = null;
    const plugin: AgentWidgetPlugin = {
      id: "combo",
      renderComposer: (context) => {
        ctx = context;
        return null;
      },
      contributeComposerActions: () => [
        {
          id: "panel",
          kind: "custom",
          placement: "end",
          order: 600,
          label: "Panel",
          render: () => {
            const element = document.createElement("div");
            element.setAttribute("data-test-custom", "");
            return { element, destroy };
          },
        } as ComposerAction,
      ],
    };
    const { mount } = makeController({ plugins: [plugin] });
    expect(actionEl(mount, "combo:panel")).not.toBeNull();

    ctx!.requestRender();

    expect(destroy).toHaveBeenCalledTimes(1);
    // Re-rendered into the NEW bindings, not the detached footer.
    const rebuilt = actionEl(mount, "combo:panel");
    expect(rebuilt).not.toBeNull();
    expect(rebuilt!.parentElement).toBe(endCluster(mount));
    expect(mount.querySelectorAll("[data-test-custom]").length).toBe(1);
  });

  it("runs custom-action cleanup on widget destroy", () => {
    const destroy = vi.fn();
    const { controller } = makeController({
      composer: {
        actions: [
          {
            id: "panel",
            kind: "custom",
            placement: "end",
            label: "Panel",
            render: () => ({ element: document.createElement("div"), destroy }),
          } as ComposerAction,
        ],
      },
    });

    controller.destroy();
    expect(destroy).toHaveBeenCalledTimes(1);
  });

  it("leaves the mention affordance leftmost, ahead of the attachment button", () => {
    const { mount } = makeController({
      attachments: { enabled: true },
      contextMentions: {
        enabled: true,
        sources: [
          {
            id: "docs",
            label: "Docs",
            items: [{ id: "a", label: "A", body: "A" }],
          },
        ],
      },
    });

    const children = Array.from(startCluster(mount).children);
    expect(children[0].querySelector(".persona-mention-button")).not.toBeNull();
    expect(
      children[1].querySelector("[data-persona-composer-attachment-button]")
    ).not.toBeNull();
  });
});
