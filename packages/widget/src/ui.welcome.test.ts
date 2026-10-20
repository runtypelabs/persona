// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { DEFAULT_WELCOME_SUBTITLE, DEFAULT_WELCOME_TITLE } from "./welcome";
import type { AgentWidgetMessage } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const makeController = (config?: Record<string, unknown>) => {
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

const welcomeHost = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-welcome]")!;

const greetingHost = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-welcome-greeting]")!;

const isVisible = (element: HTMLElement) =>
  !element.hidden && element.style.display !== "none";

const userMessage = (id = "u1"): AgentWidgetMessage => ({
  id,
  role: "user",
  content: "hello",
  createdAt: "2026-08-01T00:00:00.000Z",
  streaming: false,
});

const assistantMessage = (id = "a1"): AgentWidgetMessage => ({
  id,
  role: "assistant",
  content: "hi there",
  createdAt: "2026-08-01T00:00:01.000Z",
  streaming: false,
});

/** Stubs WAAPI with an animation that never finishes until `finish()` is called. */
const stubAnimate = () => {
  let resolveFinished: () => void = () => {};
  const finished = new Promise<void>((resolve) => {
    resolveFinished = resolve;
  });
  const cancel = vi.fn();
  const animate = vi.fn(
    (_keyframes: unknown, _options?: { fill?: string }) =>
      ({ finished, cancel }) as unknown as Animation
  );
  const original = (Element.prototype as { animate?: unknown }).animate;
  (Element.prototype as { animate?: unknown }).animate = animate;
  return {
    animate,
    cancel,
    finished,
    finish: () => resolveFinished(),
    restore: () => {
      if (original === undefined) {
        delete (Element.prototype as { animate?: unknown }).animate;
      } else {
        (Element.prototype as { animate?: unknown }).animate = original;
      }
    },
  };
};

const sendUserMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "u1"
) => {
  controller.injectTestMessage({ type: "message", message: userMessage(id) });
};

afterEach(() => {
  controllers.splice(0).forEach((controller) => controller.destroy());
  mounts.splice(0).forEach((mount) => mount.remove());
});

describe("welcome surface", () => {
  it("renders resolver defaults into a permanent host", () => {
    const { mount } = makeController();
    const host = welcomeHost(mount);
    expect(host).toBeTruthy();
    expect(host.getAttribute("data-persona-welcome-variant")).toBe("card");
    expect(host.querySelector("h2")?.textContent).toBe(DEFAULT_WELCOME_TITLE);
    expect(host.querySelector(".persona-welcome-subtitle")?.textContent).toBe(
      DEFAULT_WELCOME_SUBTITLE
    );
    expect(isVisible(host)).toBe(true);
    // Back-compatible hook for layout.slots["body-top"].
    expect(host.hasAttribute("data-persona-intro-card")).toBe(true);
  });

  it("hides the host for variant none", () => {
    const { mount } = makeController({ welcome: { variant: "none" } });
    expect(isVisible(welcomeHost(mount))).toBe(false);
  });

  it("omits the subtitle paragraph when the subtitle is empty", () => {
    const { mount } = makeController({ welcome: { subtitle: "" } });
    expect(
      welcomeHost(mount).querySelector<HTMLElement>(".persona-welcome-subtitle")!.hidden
    ).toBe(true);
  });
});

describe("welcome visibility state machine", () => {
  it("keeps a card visible after the first user message (dismiss never)", () => {
    const { mount, controller } = makeController();
    sendUserMessage(controller);
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("dismisses a card configured with on-first-message", () => {
    const { mount, controller } = makeController({
      welcome: { dismiss: "on-first-message" },
    });
    expect(isVisible(welcomeHost(mount))).toBe(true);
    sendUserMessage(controller);
    expect(isVisible(welcomeHost(mount))).toBe(false);
  });

  it("shows the hero on a fresh empty session and dismisses it on send", () => {
    const { mount, controller } = makeController({
      welcome: { variant: "hero" },
    });
    const host = welcomeHost(mount);
    expect(host.getAttribute("data-persona-welcome-variant")).toBe("hero");
    expect(host.getAttribute("data-persona-welcome-dismiss")).toBe(
      "on-first-message"
    );
    expect(isVisible(host)).toBe(true);
    sendUserMessage(controller);
    expect(isVisible(host)).toBe(false);
  });

  it("never shows the hero for restored history containing user messages", () => {
    const { mount } = makeController({
      welcome: { variant: "hero" },
      initialMessages: [userMessage("restored")],
    });
    expect(isVisible(welcomeHost(mount))).toBe(false);
  });

  it("shows a never-dismissing card for restored history", () => {
    const { mount } = makeController({
      initialMessages: [userMessage("restored")],
    });
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("returns the hero after clearChat, without stored state", () => {
    const { mount, controller } = makeController({
      welcome: { variant: "hero" },
    });
    sendUserMessage(controller);
    expect(isVisible(welcomeHost(mount))).toBe(false);
    controller.clearChat();
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("derives visibility per load with persistState false", () => {
    const first = makeController({
      welcome: { variant: "hero" },
      persistState: false,
    });
    sendUserMessage(first.controller);
    expect(isVisible(welcomeHost(first.mount))).toBe(false);

    const second = makeController({
      welcome: { variant: "hero" },
      persistState: false,
    });
    expect(isVisible(welcomeHost(second.mount))).toBe(true);
  });

  it("animates the hero out through WAAPI before hiding it", async () => {
    // WAAPI, not a CSS transition: morph re-renders cancel transitions.
    const waapi = stubAnimate();
    try {
      const { mount, controller } = makeController({
        welcome: { variant: "hero" },
      });
      const host = welcomeHost(mount);
      sendUserMessage(controller);
      expect(waapi.animate).toHaveBeenCalled();
      // `forwards`: `backwards` reverts to opacity 1 after the keyframes end.
      expect(waapi.animate.mock.calls[0]![1]?.fill).toBe("forwards");
      expect(isVisible(host)).toBe(true);
      waapi.finish();
      await waapi.finished;
      await Promise.resolve();
      expect(isVisible(host)).toBe(false);
    } finally {
      waapi.restore();
    }
  });

  it("animates a dismissing card out through WAAPI, same as the hero", async () => {
    // The spec's state machine keys the animation on the dismiss rule, not
    // the variant: { variant: "card", dismiss: "on-first-message" } fades too.
    const waapi = stubAnimate();
    try {
      const { mount, controller } = makeController({
        welcome: { dismiss: "on-first-message" },
      });
      const host = welcomeHost(mount);
      sendUserMessage(controller);
      expect(waapi.animate).toHaveBeenCalled();
      expect(waapi.animate.mock.calls[0]![1]?.fill).toBe("forwards");
      expect(isVisible(host)).toBe(true);
      waapi.finish();
      await waapi.finished;
      await Promise.resolve();
      expect(isVisible(host)).toBe(false);
    } finally {
      waapi.restore();
    }
  });

  it("keeps the hero visible across later renders while the dismiss runs", async () => {
    // The assistant placeholder and every streaming chunk re-render within
    // milliseconds of the send; none of them may truncate the animation.
    const waapi = stubAnimate();
    try {
      const { mount, controller } = makeController({
        welcome: { variant: "hero" },
      });
      const host = welcomeHost(mount);
      sendUserMessage(controller);
      expect(isVisible(host)).toBe(true);

      controller.injectTestMessage({
        type: "message",
        message: assistantMessage(),
      });
      expect(isVisible(host)).toBe(true);
      controller.injectTestMessage({
        type: "message",
        message: assistantMessage("a2"),
      });
      expect(isVisible(host)).toBe(true);
      expect(waapi.animate).toHaveBeenCalledTimes(1);

      waapi.finish();
      await waapi.finished;
      await Promise.resolve();
      expect(isVisible(host)).toBe(false);
    } finally {
      waapi.restore();
    }
  });

  it("cancels an in-flight dismiss when clearChat re-shows the hero", async () => {
    const waapi = stubAnimate();
    try {
      const { mount, controller } = makeController({
        welcome: { variant: "hero" },
      });
      const host = welcomeHost(mount);
      sendUserMessage(controller);
      controller.clearChat();
      expect(waapi.cancel).toHaveBeenCalled();
      expect(isVisible(host)).toBe(true);

      waapi.finish();
      await waapi.finished;
      await Promise.resolve();
      // The settled animation must not hide a host that was re-shown.
      expect(isVisible(host)).toBe(true);
    } finally {
      waapi.restore();
    }
  });

  it("hides the hero without animating when hydration restores user messages", async () => {
    const waapi = stubAnimate();
    try {
      const { mount } = makeController({
        welcome: { variant: "hero" },
        persistState: true,
        storageAdapter: {
          load: () =>
            Promise.resolve({
              messages: [userMessage("restored")],
              metadata: {},
            }),
          save: () => {},
          clear: () => {},
        },
      });
      const host = welcomeHost(mount);
      expect(isVisible(host)).toBe(true);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
      expect(isVisible(host)).toBe(false);
      expect(waapi.animate).not.toHaveBeenCalled();
    } finally {
      waapi.restore();
    }
  });

  it("re-derives visibility when update() changes the variant", () => {
    const { mount, controller } = makeController();
    const host = welcomeHost(mount);
    sendUserMessage(controller);
    controller.update({ welcome: { variant: "hero" } });
    // Same host element: the welcome host is permanent, content swaps in place.
    expect(welcomeHost(mount)).toBe(host);
    expect(isVisible(host)).toBe(false);
    controller.clearChat();
    expect(isVisible(host)).toBe(true);
  });
});

describe("welcome greeting bubble", () => {
  it.each([false, true])("renders an assistant-styled bubble above the transcript (v5=%s)", (v5Defaults) => {
    const { mount } = makeController({ future: { v5Defaults }, welcome: { message: "Hi, I'm Ada." } });
    const greeting = greetingHost(mount);
    expect(isVisible(greeting)).toBe(true);
    expect(greeting.textContent).toBe("Hi, I'm Ada.");
    const bubble = greeting.querySelector<HTMLElement>(
      "[data-persona-theme-zone='assistant-message']"
    );
    expect(bubble).toBeTruthy();
    expect(bubble!.hasAttribute("data-message-id")).toBe(false);

    const body = mount.querySelector<HTMLElement>("#persona-scroll-container")!;
    const children = Array.from(body.children);
    const transcript = body.querySelector<HTMLElement>(
      ":scope > .persona-widget-messages"
    )!;
    expect(children.indexOf(greeting)).toBeLessThan(
      children.indexOf(transcript)
    );
  });

  it("never enters session state and survives clearChat", () => {
    const { mount, controller } = makeController({
      welcome: { message: "Hi, I'm Ada." },
    });
    expect(controller.getMessages()).toHaveLength(0);
    sendUserMessage(controller);
    expect(
      controller.getMessages().some((message) => message.content.includes("Ada"))
    ).toBe(false);
    expect(isVisible(greetingHost(mount))).toBe(true);
    controller.clearChat();
    expect(controller.getMessages()).toHaveLength(0);
    expect(isVisible(greetingHost(mount))).toBe(true);
  });

  it("is suppressed entirely under the hero variant", () => {
    const { mount } = makeController({
      welcome: { variant: "hero", message: "Hi, I'm Ada." },
    });
    expect(isVisible(greetingHost(mount))).toBe(false);
    expect(greetingHost(mount).textContent).toBe("");
  });
});

describe("welcome icon", () => {
  it("renders a lucide icon", () => {
    const { mount } = makeController({
      welcome: { icon: { type: "lucide", name: "sparkles" } },
    });
    const holder = mount.querySelector<HTMLElement>(
      "[data-persona-welcome-icon]"
    )!;
    expect(holder.hidden).toBe(false);
    expect(holder.querySelector("svg")).toBeTruthy();
  });

  it("renders an image with its required alt text", () => {
    const { mount } = makeController({
      welcome: { icon: { type: "image", url: "/logo.png", alt: "Acme" } },
    });
    const image = mount.querySelector<HTMLImageElement>(
      "[data-persona-welcome-icon] img"
    )!;
    expect(image.getAttribute("src")).toBe("/logo.png");
    expect(image.getAttribute("alt")).toBe("Acme");
  });

  it("renders a text glyph", () => {
    const { mount } = makeController({
      welcome: { icon: { type: "text", text: "🎈" } },
    });
    expect(
      mount.querySelector("[data-persona-welcome-icon]")!.textContent
    ).toBe("🎈");
  });

  it("renders a function-provided element", () => {
    const { mount } = makeController({
      welcome: {
        icon: () => {
          const custom = document.createElement("span");
          custom.id = "custom-welcome-icon";
          return custom;
        },
      },
    });
    expect(mount.querySelector("#custom-welcome-icon")).toBeTruthy();
  });

  it("hides the holder when no icon is configured", () => {
    const { mount } = makeController();
    expect(
      mount.querySelector<HTMLElement>("[data-persona-welcome-icon]")!.hidden
    ).toBe(true);
  });
});

describe("welcome live updates", () => {
  it("updates the title", () => {
    const { mount, controller } = makeController();
    controller.update({ welcome: { title: "Updated title" } });
    expect(welcomeHost(mount).querySelector("h2")?.textContent).toBe(
      "Updated title"
    );
  });

  it("updates the subtitle", () => {
    const { mount, controller } = makeController();
    controller.update({ welcome: { subtitle: "Updated subtitle" } });
    expect(
      welcomeHost(mount).querySelector(".persona-welcome-subtitle")?.textContent
    ).toBe(
      "Updated subtitle"
    );
  });

  it("updates the icon", () => {
    const { mount, controller } = makeController();
    controller.update({
      welcome: { icon: { type: "text", text: "★" } },
    });
    const holder = mount.querySelector<HTMLElement>(
      "[data-persona-welcome-icon]"
    )!;
    expect(holder.textContent).toBe("★");
    controller.update({ welcome: { icon: undefined } });
    expect(holder.hidden).toBe(true);
  });

  it("updates the variant", () => {
    const { mount, controller } = makeController();
    controller.update({ welcome: { variant: "hero" } });
    expect(
      welcomeHost(mount).getAttribute("data-persona-welcome-variant")
    ).toBe("hero");
    controller.update({ welcome: { variant: "none" } });
    expect(isVisible(welcomeHost(mount))).toBe(false);
    controller.update({ welcome: { variant: undefined } });
    expect(
      welcomeHost(mount).getAttribute("data-persona-welcome-variant")
    ).toBe("card");
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("updates the dismiss rule against the current transcript", () => {
    const { mount, controller } = makeController();
    sendUserMessage(controller);
    expect(isVisible(welcomeHost(mount))).toBe(true);
    controller.update({ welcome: { dismiss: "on-first-message" } });
    expect(isVisible(welcomeHost(mount))).toBe(false);
    controller.update({ welcome: { dismiss: "never" } });
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("updates the greeting message in place", () => {
    const { mount, controller } = makeController({
      welcome: { message: "First greeting" },
    });
    const greeting = greetingHost(mount);
    controller.update({ welcome: { message: "Second greeting" } });
    expect(greetingHost(mount)).toBe(greeting);
    expect(greeting.textContent).toBe("Second greeting");
    controller.update({ welcome: { message: undefined } });
    expect(isVisible(greeting)).toBe(false);
  });

  it("still honors the legacy copy aliases through update()", () => {
    const { mount, controller } = makeController();
    controller.update({
      copy: { welcomeTitle: "Legacy title", showWelcomeCard: false },
    });
    expect(welcomeHost(mount).querySelector("h2")?.textContent).toBe(
      "Legacy title"
    );
    expect(isVisible(welcomeHost(mount))).toBe(false);
    controller.update({ copy: { showWelcomeCard: undefined } });
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });
});

describe("centered welcome", () => {
  it("groups legacy starters in the V5 welcome and restores them after clear", () => {
    const { mount, controller } = makeController({ future: { v5Defaults: true }, suggestionChips: ["One", "Two", "Three", "Four", "Five"] });
    const host = welcomeHost(mount);
    expect(host.getAttribute("data-persona-welcome-layout")).toBe("centered");
    expect(host.querySelector("h2")?.textContent).toBe("What can I help with?");
    expect(host.querySelectorAll(".persona-suggestion")).toHaveLength(3);
    expect(host.querySelector(".persona-suggestions")?.getAttribute("data-variant")).toBe("chip");
    controller.injectTestMessage({ type: "message", message: { ...assistantMessage(), content: "", streaming: true } });
    expect(isVisible(host)).toBe(true);
    sendUserMessage(controller);
    expect(isVisible(host)).toBe(false);
    controller.clearChat();
    expect(isVisible(host)).toBe(true);
    expect(host.querySelectorAll(".persona-suggestion")).toHaveLength(3);
  });

  it("raises fullscreen empty composers and defaults starters to four cards", () => {
    const { mount } = makeController({ future: { v5Defaults: true }, launcher: { enabled: false, fullHeight: true }, suggestionChips: ["One", "Two", "Three", "Four", "Five"] });
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("center");
    expect(welcomeHost(mount).querySelectorAll(".persona-suggestion")).toHaveLength(4);
    expect(welcomeHost(mount).querySelector(".persona-suggestions")?.getAttribute("data-variant")).toBe("card");
  });
});

it("updates starter density when the floating panel becomes mobile fullscreen", () => {
  const originalWidth = window.innerWidth;
  try {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    const { mount } = makeController({ future: { v5Defaults: true }, launcher: { enabled: true }, suggestionChips: ["One", "Two", "Three", "Four", "Five"] });
    expect(welcomeHost(mount).querySelectorAll(".persona-suggestion")).toHaveLength(3);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 500 });
    window.dispatchEvent(new Event("resize"));
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("center");
    expect(welcomeHost(mount).querySelectorAll(".persona-suggestion")).toHaveLength(4);
    Object.defineProperty(window, "innerWidth", { configurable: true, value: 1000 });
    window.dispatchEvent(new Event("resize"));
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
    expect(welcomeHost(mount).querySelectorAll(".persona-suggestion")).toHaveLength(3);
  } finally {
    Object.defineProperty(window, "innerWidth", { configurable: true, value: originalWidth });
  }
});

describe.each([false, true])("explicit welcome layout (V5 defaults: %s)", (v5Defaults) => {
  it("makes top override hero centering in empty and active states", () => {
    const { mount, controller } = makeController({ future: { v5Defaults }, welcome: { layout: "top", variant: "hero", dismiss: "never" } });
    expect(mount.getAttribute("data-persona-welcome-layout-explicit")).toBe("top");
    expect(isVisible(welcomeHost(mount))).toBe(true);
    sendUserMessage(controller);
    expect(mount.getAttribute("data-persona-welcome-layout-explicit")).toBe("top");
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("centers and resets explicit greeting/starters while honoring overrides", () => {
    const { mount, controller } = makeController({
      future: { v5Defaults },
      welcome: { layout: "centered", title: "Custom", subtitle: "Scope", dismiss: "on-first-message", align: "start", anchor: "bottom" },
      suggestions: { starters: { items: ["One", "Two", "Three", "Four", "Five"], maxItems: 2, variant: "list", behavior: "fill" } },
    });
    expect(welcomeHost(mount).getAttribute("data-persona-welcome-layout")).toBe("centered");
    expect(welcomeHost(mount).getAttribute("data-persona-welcome-align")).toBe("start");
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
    expect(welcomeHost(mount).querySelector("h2")?.textContent).toBe("Custom");
    expect(welcomeHost(mount).querySelectorAll(".persona-suggestion")).toHaveLength(2);
    controller.injectTestMessage({ type: "message", message: { ...assistantMessage(), content: "", streaming: true } });
    expect(isVisible(welcomeHost(mount))).toBe(true);
    sendUserMessage(controller);
    expect(isVisible(welcomeHost(mount))).toBe(false);
    controller.clearChat();
    expect(isVisible(welcomeHost(mount))).toBe(true);
  });

  it("centers the measured fullscreen group and preserves an explicit percentage", () => {
    const { mount, controller } = makeController({ future: { v5Defaults }, launcher: { enabled: false, fullHeight: true }, composer: { placement: "overlay" }, welcome: { layout: "centered" } });
    const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    const container = footer.parentElement!;
    Object.defineProperty(container, "clientHeight", { configurable: true, value: 800 });
    Object.defineProperty(footer, "offsetHeight", { configurable: true, value: 100 });
    Object.defineProperty(welcomeHost(mount), "offsetHeight", { configurable: true, value: 200 });
    window.dispatchEvent(new Event("resize"));
    // jsdom has no stylesheet geometry: the zero gap/body origin gives
    // (800 - 200 - 100) / 2 rather than the old 44%-top anchoring.
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("250px");
    controller.update({ welcome: { layout: "centered", anchorComposerTop: "40%" } });
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("380px");
  });
});

describe("composer anchoring with transcript activity", () => {
  const setGeometry = (mount: HTMLElement) => {
    const footer = mount.querySelector<HTMLElement>(".persona-widget-footer")!;
    Object.defineProperty(footer.parentElement!, "clientHeight", { configurable: true, value: 800 });
    Object.defineProperty(footer, "offsetHeight", { configurable: true, value: 100 });
    Object.defineProperty(welcomeHost(mount), "offsetHeight", { configurable: true, value: 200 });
    window.dispatchEvent(new Event("resize"));
    return footer;
  };

  it.each(["overlay", "block"] as const)("drops a %s composer for proactive assistant activity and restores the greeting after clear", (placement) => {
    const { mount, controller } = makeController({
      future: { v5Defaults: true }, launcher: { enabled: false, fullHeight: true },
      composer: { placement }, welcome: { message: "An intentional greeting" },
    });
    const footer = setGeometry(mount);
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
    expect(isVisible(greetingHost(mount))).toBe(true);
    expect(placement === "overlay" ? mount.style.getPropertyValue("--persona-composer-lift") : footer.style.marginBottom).toBe("250px");
    controller.injectTestMessage({ type: "message", message: assistantMessage() });
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("active");
    expect(isVisible(welcomeHost(mount))).toBe(false);
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("0px");
    expect(footer.style.marginBottom).toBe("");
    controller.clearChat();
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
    expect(isVisible(welcomeHost(mount))).toBe(true);
    expect(isVisible(greetingHost(mount))).toBe(true);
  });

  it.each(["tool", "reasoning"] as const)("pins the composer below a restored %s-only transcript with a disabled welcome", (variant) => {
    const activity: AgentWidgetMessage = {
      ...assistantMessage("restored-activity"), content: "", variant,
      ...(variant === "tool" ? { toolCall: { id: "restored-tool", name: "Read", status: "complete" as const, args: { path: "example.ts" }, result: "Restored output" } }
        : { reasoning: { id: "restored-reasoning", status: "complete" as const, chunks: ["Review the source"] } }),
    };
    const { mount } = makeController({
      future: { v5Defaults: true }, launcher: { enabled: false, fullHeight: true },
      composer: { placement: "overlay" }, welcome: { variant: "none", anchor: "center" }, initialMessages: [activity],
    });
    setGeometry(mount);
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("active");
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("0px");
    expect(isVisible(welcomeHost(mount))).toBe(false);
  });

  it("keeps a disabled empty welcome at the bottom and honors explicit center anchoring", () => {
    const { mount, controller } = makeController({
      future: { v5Defaults: true }, launcher: { enabled: false, fullHeight: true },
      composer: { placement: "overlay" }, welcome: { variant: "none" },
    });
    setGeometry(mount);
    expect(mount.getAttribute("data-persona-conversation-state")).toBe("empty");
    expect(mount.getAttribute("data-persona-welcome-anchor")).toBe("bottom");
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("0px");
    controller.update({ welcome: { anchor: "center", anchorComposerTop: "40%" } });
    expect(mount.style.getPropertyValue("--persona-composer-lift")).toBe("380px");
  });
});
