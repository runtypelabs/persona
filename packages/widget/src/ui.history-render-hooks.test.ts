// @vitest-environment jsdom

/**
 * Public history render hooks (`docs/visitor-history-implementation-plan.md`
 * D7, "Public rendering customization contract"): arbitration order, default
 * delegation, throw containment, `requestRender`, snapshot sanitization, the
 * shared action path, and the ChatGPT-style rail composition.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createHistoryView } from "./components/history-view";
import { setHistoryViewLoader } from "./history-view-loader";
import { setHistoryProviderFactory } from "./internal/history-provider-registry";
import {
  createDemoHistoryProvider,
  type DemoHistoryConversationSeed,
  type DemoHistoryProviderOptions,
} from "./internal/demo-history-provider";
import type { AgentWidgetPlugin } from "./plugins/types";
import type {
  AgentWidgetRenderHistoryViewContext,
  AgentWidgetRenderHistoryConversationContext,
  AgentWidgetRenderHistoryHeaderContext,
  AgentWidgetRenderHistoryStateContext,
} from "./types";

const SEEDS: DemoHistoryConversationSeed[] = [
  {
    id: "conv-a",
    title: "Order status",
    targetId: null,
    messages: [
      { id: "a1", role: "user", content: "where is my order" },
      { id: "a2", role: "assistant", content: "it ships tomorrow" },
    ],
  },
  {
    id: "conv-b",
    title: "Refund request",
    targetId: null,
    messages: [{ id: "b1", role: "user", content: "i need a refund" }],
  },
];

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

type SetupOptions = {
  plugins?: AgentWidgetPlugin[];
  provider?: DemoHistoryProviderOptions;
  historyFeature?: Record<string, unknown>;
  config?: Record<string, unknown>;
};

const setup = (options: SetupOptions = {}) => {
  const provider = createDemoHistoryProvider({
    conversations: SEEDS,
    ...options.provider,
  });
  setHistoryProviderFactory(() => provider);
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    features: { history: { enabled: true, ...options.historyFeature } },
    ...(options.plugins ? { plugins: options.plugins } : {}),
    ...options.config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller, provider };
};

const historyButton = (mount: HTMLElement) =>
  mount.querySelector<HTMLButtonElement>("[data-persona-history-toggle]")!;
const defaultView = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>(".persona-history-view");
const rowOf = (mount: HTMLElement, id: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-persona-history-conversation="${id}"]`
  );
const dialogOf = () => document.querySelector<HTMLElement>('[role="alertdialog"]');

const openHistoryUI = async (mount: HTMLElement) => {
  historyButton(mount).click();
  await flush(20);
};

const setContainerWidth = (mount: HTMLElement, width: number) => {
  const container = mount.querySelector<HTMLElement>(".persona-widget-container")!;
  Object.defineProperty(container, "clientWidth", {
    configurable: true,
    get: () => width,
  });
};

/** Minimal full-view plugin returning a tagged element. */
const fullViewPlugin = (
  id: string,
  tag: string,
  priority?: number
): AgentWidgetPlugin => ({
  id,
  ...(priority === undefined ? {} : { priority }),
  renderHistoryView: () => {
    const element = document.createElement("div");
    element.setAttribute("data-test-view", tag);
    return element;
  },
});

describe("history render hooks", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    setHistoryViewLoader(async () => ({ createHistoryView }));
  });

  afterEach(() => {
    setHistoryProviderFactory(null);
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

  describe("full view arbitration", () => {
    it("runs plugins by priority and the first non-null view wins", async () => {
      const { mount } = setup({
        plugins: [
          fullViewPlugin("low", "low", 1),
          fullViewPlugin("high", "high", 10),
        ],
      });
      await openHistoryUI(mount);
      expect(
        mount.querySelector("[data-test-view]")?.getAttribute("data-test-view")
      ).toBe("high");
      expect(defaultView(mount)).toBeNull();
    });

    it("falls through a null hook to the next plugin, then to the default", async () => {
      const nulled = vi.fn(() => null);
      const { mount } = setup({
        plugins: [{ id: "nulls", priority: 10, renderHistoryView: nulled }],
      });
      await openHistoryUI(mount);
      expect(nulled).toHaveBeenCalled();
      expect(defaultView(mount)).not.toBeNull();
      expect(rowOf(mount, "conv-a")).not.toBeNull();
    });

    it("delegates to defaultRenderer without recursion and keeps lower hooks", async () => {
      const calls: string[] = [];
      const { mount } = setup({
        plugins: [
          {
            id: "composer",
            renderHistoryView: (context) => {
              calls.push("view");
              const wrapper = document.createElement("div");
              wrapper.setAttribute("data-test-wrapper", "");
              wrapper.appendChild(context.defaultRenderer());
              return wrapper;
            },
            // Same plugin's lower-level hook still applies.
            renderHistoryConversation: (context) => {
              calls.push(`row:${context.conversation.id}`);
              const row = document.createElement("li");
              row.setAttribute("data-test-row", context.conversation.id);
              return row;
            },
          },
        ],
      });
      await openHistoryUI(mount);
      const wrapper = mount.querySelector("[data-test-wrapper]");
      expect(wrapper).not.toBeNull();
      expect(wrapper!.contains(defaultView(mount))).toBe(true);
      expect(mount.querySelectorAll("[data-test-row]").length).toBe(2);
      // One full-hook invocation: defaultRenderer() cannot re-enter it.
      expect(calls.filter((entry) => entry === "view").length).toBe(1);
    });

    it("reports a thrown hook and falls back without losing history state", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const { mount } = setup({
        plugins: [
          {
            id: "boom",
            priority: 10,
            renderHistoryView: () => {
              throw new Error("hook exploded");
            },
          },
        ],
      });
      await openHistoryUI(mount);
      expect(warn).toHaveBeenCalledWith(
        "[persona] renderHistoryView threw",
        expect.any(Error)
      );
      expect(defaultView(mount)).not.toBeNull();
      expect(rowOf(mount, "conv-a")).not.toBeNull();
      expect(rowOf(mount, "conv-b")).not.toBeNull();
    });
  });

  describe("requestRender", () => {
    it("replaces the mounted DOM after running the prior cleanups", async () => {
      const order: string[] = [];
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      let generation = 0;
      const { mount } = setup({
        plugins: [
          {
            id: "stateful",
            renderHistoryView: (ctx) => {
              context = ctx;
              generation += 1;
              order.push(`render:${generation}`);
              ctx.onCleanup(() => order.push(`cleanup:${generation}`));
              const element = document.createElement("div");
              element.setAttribute("data-test-view", String(generation));
              return element;
            },
          },
        ],
      });
      await openHistoryUI(mount);
      const first = mount.querySelector("[data-test-view]")!;
      const settled = generation;
      order.length = 0;

      context!.requestRender();
      await flush();
      const second = mount.querySelector("[data-test-view]")!;
      expect(second).not.toBe(first);
      expect(second.getAttribute("data-test-view")).toBe(String(settled + 1));
      expect(first.isConnected).toBe(false);
      // The previous render's cleanup runs BEFORE its DOM is replaced.
      expect(order).toEqual([`cleanup:${settled}`, `render:${settled + 1}`]);
    });

    it("is inert after the surface closes", async () => {
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      const renders = vi.fn();
      const { mount, controller } = setup({
        plugins: [
          {
            id: "inert",
            renderHistoryView: (ctx) => {
              context = ctx;
              renders();
              return document.createElement("div");
            },
          },
        ],
      });
      await openHistoryUI(mount);
      const before = renders.mock.calls.length;
      controller.hideHistory();
      await flush();
      context!.requestRender();
      await flush();
      expect(renders.mock.calls.length).toBe(before);
    });

    it("re-invokes the renderer when the core model changes", async () => {
      const snapshots: number[] = [];
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      const { mount, controller } = setup({
        plugins: [
          {
            id: "counts",
            renderHistoryView: (ctx) => {
              context = ctx;
              snapshots.push(ctx.conversations.length);
              const element = document.createElement("div");
              element.setAttribute("data-test-view", "counts");
              return element;
            },
          },
        ],
      });
      await openHistoryUI(mount);
      expect(snapshots.at(-1)).toBe(2);

      await controller.deleteConversation("conv-a");
      // No plugin bookkeeping: reloading the list rerenders the custom view.
      await context!.actions.refresh();
      await flush(20);
      expect(snapshots.at(-1)).toBe(1);
      expect(mount.querySelector("[data-test-view]")).not.toBeNull();
    });
  });

  describe("snapshot", () => {
    it("is frozen and carries no provider, credential, or transport data", async () => {
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      const { mount } = setup({
        plugins: [
          {
            id: "capture",
            renderHistoryView: (ctx) => {
              context = ctx;
              return document.createElement("div");
            },
          },
        ],
      });
      await openHistoryUI(mount);
      const captured = context!;

      expect(Object.isFrozen(captured)).toBe(true);
      expect(Object.isFrozen(captured.conversations)).toBe(true);
      expect(Object.isFrozen(captured.conversations[0])).toBe(true);
      expect(Object.isFrozen(captured.identityStatus)).toBe(true);
      expect(Object.isFrozen(captured.actions)).toBe(true);
      expect(Object.keys(captured.conversations[0]!).sort()).toEqual([
        "createdAt",
        "id",
        "messageCount",
        "preview",
        "targetId",
        "title",
        "updatedAt",
      ]);

      // Deep sweep of everything except the host's own config object.
      const forbidden =
        /provider|token|proof|jwt|credential|visitor|enduser|secret|commit|discard|response|headers|cookie|authorization|client/i;
      const seen = new Set<unknown>();
      const walk = (value: unknown, path: string): void => {
        if (value === null || typeof value !== "object") return;
        if (seen.has(value)) return;
        seen.add(value);
        for (const [key, child] of Object.entries(value)) {
          expect(
            forbidden.test(key),
            `${path}.${key} leaks a non-public field`
          ).toBe(false);
          walk(child, `${path}.${key}`);
        }
      };
      // `config` is the host's own object and `copy` is a flat string map, so
      // both are asserted directly rather than swept for field names.
      const { config: _config, copy, ...snapshot } = captured;
      walk(snapshot, "context");
      expect(
        Object.values(copy).every((value) => typeof value === "string")
      ).toBe(true);
      // The transactional seam is absent, not merely undefined.
      expect("prepareOpen" in captured).toBe(false);
      expect(Object.keys(captured.actions).sort()).toEqual([
        "close",
        "loadMore",
        "openConversation",
        "refresh",
        "requestClearConversationHistory",
        "requestDeleteConversation",
        "requestResetHistoryIdentity",
        "startNewConversation",
      ]);
    });

    it("re-invokes the same renderer with the new presentation on a rail collapse", async () => {
      const seen: string[] = [];
      const renderer = vi.fn((context: AgentWidgetRenderHistoryViewContext) => {
        seen.push(context.presentation);
        const element = document.createElement("div");
        element.setAttribute("data-test-view", context.presentation);
        return element;
      });
      const { mount, controller } = setup({
        historyFeature: { presentation: "rail" },
        plugins: [{ id: "responsive", renderHistoryView: renderer }],
      });
      setContainerWidth(mount, 900);
      await openHistoryUI(mount);
      expect(seen.at(-1)).toBe("rail");
      expect(
        mount.querySelector(".persona-history-rail-host")?.querySelector(
          "[data-test-view]"
        )
      ).not.toBeNull();

      setContainerWidth(mount, 500);
      controller.update({});
      await flush(20);
      expect(seen.at(-1)).toBe("panel");
      expect(
        mount.querySelector("[data-test-view]")?.getAttribute("data-test-view")
      ).toBe("panel");
      expect(mount.querySelector(".persona-history-rail-host")).toBeNull();
    });
  });

  describe("actions", () => {
    const actionSetup = async () => {
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      const result = setup({
        plugins: [
          {
            id: "actions",
            renderHistoryView: (ctx) => {
              context = ctx;
              const element = document.createElement("div");
              element.setAttribute("data-test-view", "actions");
              return element;
            },
          },
        ],
      });
      await openHistoryUI(result.mount);
      return { ...result, context: () => context! };
    };

    it("opens a conversation through the shell path and closes the panel", async () => {
      const { mount, provider, context } = await actionSetup();
      await context().actions.openConversation("conv-a");
      await flush(20);
      expect(provider.getActiveConversationId()).toBe("conv-a");
      expect(mount.querySelector("[data-test-view]")).toBeNull();
      const ids = Array.from(
        mount.querySelectorAll("#persona-scroll-container [data-message-id]")
      ).map((node) => node.getAttribute("data-message-id"));
      expect(ids).toEqual(["a1", "a2"]);
    });

    it("routes a delete through Persona's confirmation and resolves the outcome", async () => {
      const { provider, context } = await actionSetup();
      const cancelled = context().actions.requestDeleteConversation("conv-a");
      await flush();
      dialogOf()!
        .querySelector<HTMLButtonElement>(".persona-history-confirm__cancel")!
        .click();
      expect(await cancelled).toBe("cancelled");
      expect(provider.getConversationIds()).toContain("conv-a");

      const deleted = context().actions.requestDeleteConversation("conv-a");
      await flush();
      dialogOf()!
        .querySelector<HTMLButtonElement>(".persona-history-confirm__confirm")!
        .click();
      expect(await deleted).toBe("deleted");
      expect(provider.getConversationIds()).not.toContain("conv-a");
    });

    it("ignores a second action while one is pending", async () => {
      let context: AgentWidgetRenderHistoryViewContext | null = null;
      const pendings: string[] = [];
      const { mount, provider } = setup({
        provider: { latencyMs: 10 },
        plugins: [
          {
            id: "busy",
            renderHistoryView: (ctx) => {
              context = ctx;
              pendings.push(ctx.pendingAction?.kind ?? "idle");
              return document.createElement("div");
            },
          },
        ],
      });
      await openHistoryUI(mount);
      await new Promise((resolve) => setTimeout(resolve, 40));
      await flush(20);

      const first = context!.actions.openConversation("conv-a");
      // The busy view rejects the duplicate exactly like an inert default row.
      const second = context!.actions.openConversation("conv-b");
      await second;
      expect(provider.getActiveConversationId()).not.toBe("conv-b");
      await first;
      await flush(20);
      expect(provider.getActiveConversationId()).toBe("conv-a");
      expect(pendings).toContain("open");
    });
  });

  describe("slot hooks", () => {
    it("applies the first non-null header, row, and state hook by priority", async () => {
      const header = vi.fn((context: AgentWidgetRenderHistoryHeaderContext) => {
        const element = document.createElement("div");
        element.setAttribute("data-test-header", context.presentation);
        const close = document.createElement("button");
        close.setAttribute("data-test-close", "");
        close.addEventListener("click", () => context.actions.close());
        element.appendChild(close);
        return element;
      });
      const { mount, controller } = setup({
        plugins: [
          { id: "low", priority: 1, renderHistoryHeader: () => null },
          {
            id: "high",
            priority: 10,
            renderHistoryHeader: header,
            renderHistoryConversation: (
              context: AgentWidgetRenderHistoryConversationContext
            ) => {
              const row = document.createElement("li");
              row.setAttribute("data-test-row", context.conversation.id);
              row.textContent = context.conversation.title;
              return row;
            },
          },
        ],
      });
      await openHistoryUI(mount);
      expect(
        mount.querySelector("[data-test-header]")?.getAttribute("data-test-header")
      ).toBe("panel");
      expect(mount.querySelector(".persona-history-topbar")).toBeNull();
      expect(mount.querySelectorAll("[data-test-row]").length).toBe(2);
      // The shell keeps ownership of the close path the header invoked.
      mount.querySelector<HTMLButtonElement>("[data-test-close]")!.click();
      await flush();
      expect(controller.isHistoryVisible()).toBe(false);
    });

    it("replaces only non-ready list states and keeps default DOM on a throw", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      const states: string[] = [];
      const { mount } = setup({
        provider: { conversations: [], failures: { list: { code: "unavailable" } } },
        plugins: [
          {
            id: "states",
            renderHistoryState: (context: AgentWidgetRenderHistoryStateContext) => {
              states.push(context.state.kind);
              if (context.state.kind === "error") {
                throw new Error("state hook exploded");
              }
              const element = document.createElement("div");
              element.setAttribute("data-test-state", context.state.kind);
              return element;
            },
          },
        ],
      });
      await openHistoryUI(mount);
      expect(states).toContain("loading");
      expect(states).toContain("error");
      expect(warn).toHaveBeenCalledWith(
        "[persona] renderHistoryState threw",
        expect.any(Error)
      );
      // The throwing state falls back to Persona's block, retry included.
      expect(
        mount.querySelector('[data-persona-history-state="error"]')
      ).not.toBeNull();
      expect(states).not.toContain("ready");
    });
  });

  describe("reference ChatGPT-style rail", () => {
    /**
     * Fixture proving the rail composition is reachable through public hooks
     * only: no provider, no controller, no chunk internals.
     */
    const railPlugin = (): AgentWidgetPlugin => ({
      id: "chatgpt-rail",
      renderHistoryView: (context) => {
        const rail = document.createElement("nav");
        rail.setAttribute("data-test-rail", context.presentation);
        rail.setAttribute("aria-label", context.copy.viewTitle);

        const create = document.createElement("button");
        create.setAttribute("data-test-new", "");
        create.textContent = context.copy.newConversationLabel;
        create.addEventListener("click", () => {
          void context.actions.startNewConversation();
        });
        rail.appendChild(create);

        if (context.state.kind === "loading") {
          const status = document.createElement("p");
          status.setAttribute("data-test-loading", context.state.phase);
          rail.appendChild(status);
        }

        for (const conversation of context.conversations) {
          const row = document.createElement("button");
          row.setAttribute("data-test-rail-row", conversation.id);
          row.textContent = conversation.title;
          if (conversation.id === context.activeConversationId) {
            row.setAttribute("aria-current", "page");
          }
          row.addEventListener("click", () => {
            void context.actions.openConversation(conversation.id);
          });
          rail.appendChild(row);
        }

        if (context.nextCursor) {
          const more = document.createElement("button");
          more.setAttribute("data-test-more", "");
          more.addEventListener("click", () => void context.actions.loadMore());
          rail.appendChild(more);
        }
        return rail;
      },
    });

    it("stays open beside the conversation and drives selection", async () => {
      const { mount, provider } = setup({
        historyFeature: { presentation: "rail" },
        plugins: [railPlugin()],
      });
      setContainerWidth(mount, 900);
      await openHistoryUI(mount);

      const rail = mount.querySelector<HTMLElement>("[data-test-rail]")!;
      expect(rail.getAttribute("data-test-rail")).toBe("rail");
      expect(
        mount.querySelector(".persona-history-rail-host")!.contains(rail)
      ).toBe(true);
      expect(mount.querySelectorAll("[data-test-rail-row]").length).toBe(2);
      // The default view never rendered: only the plugin's DOM is mounted.
      expect(defaultView(mount)).toBeNull();

      mount
        .querySelector<HTMLButtonElement>('[data-test-rail-row="conv-a"]')!
        .click();
      await flush(30);
      expect(provider.getActiveConversationId()).toBe("conv-a");
      // Rail presentation keeps the navigation open and marks the active row.
      const active = mount.querySelector<HTMLElement>("[data-test-rail]")!;
      expect(active.isConnected).toBe(true);
      expect(
        active
          .querySelector('[data-test-rail-row="conv-a"]')!
          .getAttribute("aria-current")
      ).toBe("page");
      const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
      expect(body.style.display).not.toBe("none");
      expect(body.hasAttribute("inert")).toBe(false);
    });

    it("pages through the public loadMore action", async () => {
      const many: DemoHistoryConversationSeed[] = Array.from(
        { length: 4 },
        (_value, index) => ({
          id: `conv-${index}`,
          title: `Thread ${index}`,
          targetId: null,
          messages: [{ id: `m${index}`, role: "user" as const, content: "hi" }],
        })
      );
      const { mount } = setup({
        provider: { conversations: many },
        historyFeature: { pageSize: 2 },
        plugins: [railPlugin()],
      });
      await openHistoryUI(mount);
      expect(mount.querySelectorAll("[data-test-rail-row]").length).toBe(2);

      mount.querySelector<HTMLButtonElement>("[data-test-more]")!.click();
      await flush(30);
      expect(mount.querySelectorAll("[data-test-rail-row]").length).toBe(4);
      expect(mount.querySelector("[data-test-more]")).toBeNull();
    });
  });
});
