// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { AgentWidgetMessage } from "./types";

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

const host = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-welcome]")!;

const userMessage = (id = "u1"): AgentWidgetMessage => ({
  id,
  role: "user",
  content: "hello",
  createdAt: "2026-08-01T00:00:00.000Z",
  streaming: false,
});

describe("renderWelcome plugin hook", () => {
  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    document.body.innerHTML = "";
    window.localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders the plugin element inside the core-owned host and hides the default content", () => {
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: () => {
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        return root;
      },
    };
    const { mount } = makeController({ plugins: [plugin] });

    const welcome = host(mount);
    const content = welcome.querySelector("[data-test-home]");
    expect(content).not.toBeNull();
    expect(content!.hasAttribute("data-persona-welcome-plugin")).toBe(true);
    expect(welcome.getAttribute("data-persona-welcome-content")).toBe("plugin");
    // The host itself is never removed: it is the permanent mount point.
    expect(welcome.isConnected).toBe(true);
  });

  it("first plugin returning an element wins; null falls through", () => {
    const order: string[] = [];
    const skipping: AgentWidgetPlugin = {
      id: "skips",
      priority: 10,
      renderWelcome: () => {
        order.push("skips");
        return null;
      },
    };
    const winning: AgentWidgetPlugin = {
      id: "wins",
      priority: 5,
      renderWelcome: () => {
        order.push("wins");
        const root = document.createElement("div");
        root.setAttribute("data-test-owner", "wins");
        return root;
      },
    };
    const never: AgentWidgetPlugin = {
      id: "never",
      priority: 1,
      renderWelcome: () => {
        order.push("never");
        const root = document.createElement("div");
        root.setAttribute("data-test-owner", "never");
        return root;
      },
    };
    const { mount } = makeController({ plugins: [winning, skipping, never] });

    expect(order).toEqual(["skips", "wins"]);
    expect(
      host(mount).querySelector("[data-test-owner]")!.getAttribute("data-test-owner")
    ).toBe("wins");
  });

  it("falls through to the default renderer when every plugin returns null", () => {
    const plugin: AgentWidgetPlugin = { id: "noop", renderWelcome: () => null };
    const { mount } = makeController({
      plugins: [plugin],
      welcome: { title: "Hi there" },
    });

    const welcome = host(mount);
    expect(welcome.hasAttribute("data-persona-welcome-content")).toBe(false);
    expect(welcome.hasAttribute("data-persona-welcome-overlay")).toBe(false);
    expect(welcome.textContent).toContain("Hi there");
  });

  it("passes the alias-resolved config, variant, and derived visibility", () => {
    const seen: Array<Record<string, unknown>> = [];
    const plugin: AgentWidgetPlugin = {
      id: "probe",
      renderWelcome: (ctx) => {
        seen.push({
          title: ctx.config.title,
          subtitle: ctx.config.subtitle,
          variant: ctx.variant,
          visible: ctx.visible,
        });
        return null;
      },
    };
    makeController({
      plugins: [plugin],
      copy: { welcomeTitle: "Legacy title" },
      welcome: { subtitle: "Scoped help", variant: "hero" },
    });

    expect(seen[0]).toEqual({
      title: "Legacy title",
      subtitle: "Scoped help",
      variant: "hero",
      visible: true,
    });
  });

  it("renders plugin content regardless of derived visibility and overlays the transcript", () => {
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: () => {
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        return root;
      },
    };
    const { mount, controller } = makeController({
      plugins: [plugin],
      welcome: { variant: "hero" },
    });

    controller.injectUserMessage({ content: "book a table" });

    const welcome = host(mount);
    // Derived visibility is false after a user message; the plugin element wins.
    expect(welcome.hidden).toBe(false);
    expect(welcome.style.display).not.toBe("none");
    expect(welcome.hasAttribute("data-persona-welcome-overlay")).toBe(true);
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    expect(body.classList.contains("persona-welcome-overlay-active")).toBe(true);
  });

  it("requestRender re-arbitrates: cleanups run, previous content is removed, overlay clears", () => {
    const cleanup = vi.fn();
    let showHome = true;
    let request: () => void = () => {};
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: (ctx) => {
        request = ctx.requestRender;
        ctx.onCleanup(cleanup);
        if (!showHome) return null;
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        return root;
      },
    };
    const { mount } = makeController({ plugins: [plugin] });

    expect(host(mount).querySelectorAll("[data-test-home]").length).toBe(1);

    showHome = false;
    request();

    expect(cleanup).toHaveBeenCalledTimes(1);
    const welcome = host(mount);
    expect(welcome.querySelector("[data-test-home]")).toBeNull();
    expect(welcome.hasAttribute("data-persona-welcome-overlay")).toBe(false);
    expect(
      mount
        .querySelector<HTMLElement>("#persona-scroll-container")!
        .classList.contains("persona-welcome-overlay-active")
    ).toBe(false);
  });

  it("re-shows plugin content over an existing transcript (home button flow)", () => {
    let showHome = false;
    let request: () => void = () => {};
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: (ctx) => {
        request = ctx.requestRender;
        if (!showHome) return null;
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    controller.injectUserMessage({ content: "hello" });
    showHome = true;
    request();

    const welcome = host(mount);
    expect(welcome.querySelector("[data-test-home]")).not.toBeNull();
    expect(welcome.hasAttribute("data-persona-welcome-overlay")).toBe(true);
  });

  it("zeroes the body scroll while the overlay is active and restores it after", () => {
    // An absolute inset: 0 child of a scrolled scroller maps to the content
    // origin, not the viewport; without the reset the overlay paints
    // scrollTop pixels above the visible area.
    let showHome = false;
    let request: () => void = () => {};
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: (ctx) => {
        request = ctx.requestRender;
        if (!showHome) return null;
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    controller.injectUserMessage({ content: "hello" });
    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    body.scrollTop = 240;

    showHome = true;
    request();
    expect(body.scrollTop).toBe(0);

    showHome = false;
    request();
    expect(body.scrollTop).toBe(240);
  });

  it("re-enables renderStarter output when a stream ends", async () => {
    const flush = () => new Promise((resolve) => setTimeout(resolve, 0));
    const originalFetch = global.fetch;
    global.fetch = vi.fn().mockImplementation((_url: string, options: { signal: AbortSignal }) => {
      const signal = options.signal;
      return new Promise((_resolve, reject) => {
        signal.addEventListener("abort", () => {
          const error = new Error("aborted");
          error.name = "AbortError";
          reject(error);
        });
      });
    }) as unknown as typeof fetch;

    try {
      let request: () => void = () => {};
      const plugin: AgentWidgetPlugin = {
        id: "home",
        renderWelcome: (ctx) => {
          request = ctx.requestRender;
          const root = document.createElement("div");
          root.appendChild(ctx.renderStarter({ label: "Track my order" }));
          return root;
        },
      };
      const { mount } = makeController({ plugins: [plugin] });

      const textarea = mount.querySelector<HTMLTextAreaElement>(
        "[data-persona-composer-input]"
      )!;
      textarea.value = "start a stream";
      const form = mount.querySelector<HTMLFormElement>(
        "[data-persona-composer-form]"
      )!;
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();

      // Rebuild the plugin stack mid-stream: the starter is born disabled.
      request();
      const starter = host(mount).querySelector<HTMLButtonElement>(
        ".persona-suggestion"
      )!;
      expect(starter.disabled).toBe(true);

      // Submitting while streaming is the stop path; the one-shot starter
      // DOM must be re-enabled with the managed surfaces.
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await flush();
      expect(starter.disabled).toBe(false);
    } finally {
      global.fetch = originalFetch;
    }
  });

  it("composes with defaultRenderer() without taking over visibility", () => {
    const plugin: AgentWidgetPlugin = {
      id: "search",
      renderWelcome: ({ defaultRenderer, onCleanup }) => {
        const card = defaultRenderer();
        const search = document.createElement("input");
        search.setAttribute("data-test-search", "");
        card.appendChild(search);
        onCleanup(() => search.remove());
        return card;
      },
    };
    const { mount, controller } = makeController({
      plugins: [plugin],
      welcome: { variant: "hero" },
    });

    const welcome = host(mount);
    expect(welcome.querySelector("[data-test-search]")).not.toBeNull();
    // Composition is not a takeover: no overlay, derived visibility still rules.
    expect(welcome.hasAttribute("data-persona-welcome-overlay")).toBe(false);

    controller.injectUserMessage({ content: "hi" });
    expect(welcome.hidden || welcome.style.display === "none").toBe(true);
  });

  it("renderStarter runs the full select pipeline (events, hooks, send)", () => {
    const selected: string[] = [];
    const plugin: AgentWidgetPlugin = {
      id: "home",
      onSuggestionSelect: ({ suggestion }) => {
        selected.push(suggestion.prompt);
      },
      renderWelcome: ({ renderStarter }) => {
        const root = document.createElement("div");
        root.setAttribute("data-test-home", "");
        root.appendChild(
          renderStarter({ label: "Track my order", prompt: "Where is my order?" })
        );
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    const shown = vi.fn();
    mount.addEventListener("persona:suggestion:selected", shown);

    const starter = host(mount).querySelector<HTMLButtonElement>(
      "button.persona-suggestion"
    )!;
    expect(starter.dataset.suggestionId).toBe("Where is my order?");
    starter.click();

    expect(shown).toHaveBeenCalledTimes(1);
    expect(selected).toEqual(["Where is my order?"]);
    expect(
      controller.getMessages().some((m) => m.content === "Where is my order?")
    ).toBe(true);
  });

  it("renderStarter honors a canceled persona:suggestion:selected event", () => {
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: ({ renderStarter }) => {
        const root = document.createElement("div");
        root.appendChild(renderStarter("Ask about pricing"));
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });
    mount.addEventListener("persona:suggestion:selected", (event) =>
      event.preventDefault()
    );

    host(mount).querySelector<HTMLButtonElement>("button.persona-suggestion")!.click();

    expect(controller.getMessages()).toHaveLength(0);
  });

  it("renderStarter fills the composer when behavior is fill", () => {
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: ({ renderStarter }) => {
        const root = document.createElement("div");
        root.appendChild(
          renderStarter({ label: "Draft a reply", behavior: "fill" })
        );
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    host(mount).querySelector<HTMLButtonElement>("button.persona-suggestion")!.click();

    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    expect(textarea.value).toBe("Draft a reply");
    expect(controller.getMessages()).toHaveLength(0);
  });

  it("ctx.sendMessage posts a user message", () => {
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: ({ sendMessage }) => {
        const root = document.createElement("div");
        const button = document.createElement("button");
        button.setAttribute("data-test-send", "");
        button.addEventListener("click", () => sendMessage("start over"));
        root.appendChild(button);
        return root;
      },
    };
    const { mount, controller } = makeController({ plugins: [plugin] });

    host(mount).querySelector<HTMLButtonElement>("[data-test-send]")!.click();

    expect(controller.getMessages().some((m) => m.content === "start over")).toBe(
      true
    );
  });

  it("ctx.storage persists across a re-render and namespaces by plugin id", () => {
    const reads: Array<string | null> = [];
    let request: () => void = () => {};
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: (ctx) => {
        request = ctx.requestRender;
        reads.push(ctx.storage.get("view"));
        ctx.storage.set("view", "chat");
        return null;
      },
    };
    makeController({ plugins: [plugin], persistState: true });

    request();

    expect(reads).toEqual([null, "chat"]);
    expect(window.localStorage.getItem("persona-plugin:home:view")).toBe("chat");
  });

  it("re-arbitrates when controller.update() changes the welcome config", () => {
    const titles: string[] = [];
    const plugin: AgentWidgetPlugin = {
      id: "probe",
      renderWelcome: (ctx) => {
        titles.push(ctx.config.title);
        return null;
      },
    };
    const { controller } = makeController({
      plugins: [plugin],
      welcome: { title: "First" },
    });

    controller.update({ welcome: { title: "Second" } });
    // An unrelated update must not churn plugin-owned content.
    controller.update({ copy: { inputPlaceholder: "Type here" } });

    expect(titles).toEqual(["First", "Second"]);
  });

  it("runs cleanups on destroy", () => {
    const cleanup = vi.fn();
    const plugin: AgentWidgetPlugin = {
      id: "home",
      renderWelcome: (ctx) => {
        ctx.onCleanup(cleanup);
        return null;
      },
    };
    const { controller } = makeController({ plugins: [plugin] });

    controllers.splice(controllers.indexOf(controller), 1);
    controller.destroy();

    expect(cleanup).toHaveBeenCalledTimes(1);
  });

  it("keeps derived dismissal for the default renderer when no plugin claims the surface", () => {
    const plugin: AgentWidgetPlugin = { id: "noop", renderWelcome: () => null };
    const { mount, controller } = makeController({
      plugins: [plugin],
      welcome: { variant: "hero" },
      initialMessages: [userMessage()],
    });

    expect(host(mount).hidden || host(mount).style.display === "none").toBe(true);
    controller.destroy();
    controllers.splice(controllers.indexOf(controller), 1);
  });
});
