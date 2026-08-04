// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type {
  AgentWidgetPluginStorage,
  AgentWidgetRenderWelcomeContext,
} from "@runtypelabs/persona";

import {
  createHomeScreenPlugin,
  type HomeScreenOptions,
} from "./home-screen-plugin";

const createMemoryStorage = (): AgentWidgetPluginStorage => {
  const entries = new Map<string, string>();
  return {
    get: (key) => entries.get(key) ?? null,
    set: (key, value) => {
      entries.set(key, value);
    },
    remove: (key) => {
      entries.delete(key);
    },
  };
};

const OPTIONS: HomeScreenOptions = {
  avatar: { text: "🛍️" },
  starters: [
    { id: "order", label: "Track my latest order" },
    { id: "returns", label: "Start a return" },
  ],
  cards: [
    {
      id: "release",
      title: "Same-day delivery is live",
      prompt: "What changed with same-day delivery?",
      actionLabel: "Ask what changed",
    },
  ],
  links: [
    { id: "docs", label: "Read the documentation", href: "https://example.com/docs" },
  ],
};

/** Mirrors the core's welcome arbitration: cleanups run, prior content drops, fresh ctx. */
const createWelcomeHarness = (
  plugin: ReturnType<typeof createHomeScreenPlugin>,
) => {
  const storage = createMemoryStorage();
  const cleanups: Array<() => void> = [];
  const starters: string[] = [];
  const sent: string[] = [];
  let content: HTMLElement | null = null;
  let composerContent: HTMLElement | null = null;
  let visible = true;

  // Mirrors the core's composer arbitration: same storage facade, and
  // `requestRender` re-runs the hook like `rebuildComposer()` does.
  const renderComposer = (): HTMLElement | null => {
    composerContent =
      plugin.renderComposer?.({
        config: {},
        defaultRenderer: () => document.createElement("div"),
        onSubmit: () => {},
        streaming: false,
        disabled: false,
        openAttachmentPicker: () => {},
        requestRender: () => {
          renderComposer();
        },
        storage,
      }) ?? null;
    return composerContent;
  };

  const render = (): HTMLElement | null => {
    cleanups.splice(0, cleanups.length).forEach((fn) => fn());
    content?.remove();
    starters.length = 0;
    content =
      plugin.renderWelcome?.({
        config: {
          title: "Hi, how can we help?",
          subtitle: "Ask about orders, returns, and billing.",
          variant: "hero",
          dismiss: "on-first-message",
        },
        variant: "hero",
        visible,
        defaultRenderer: () => document.createElement("div"),
        sendMessage: (text) => {
          sent.push(text);
        },
        requestRender: () => {
          render();
        },
        renderStarter: (suggestion) => {
          const label =
            typeof suggestion === "string" ? suggestion : (suggestion.label ?? "");
          starters.push(label);
          const button = document.createElement("button");
          button.type = "button";
          button.textContent = label;
          return button;
        },
        storage,
        onCleanup: (fn) => {
          cleanups.push(fn);
        },
      } satisfies AgentWidgetRenderWelcomeContext) ?? null;
    if (content) document.body.appendChild(content);
    return content;
  };

  return {
    render,
    renderComposer,
    starters,
    sent,
    storage,
    current: () => content,
    composer: () => composerContent,
    setVisible: (next: boolean) => {
      visible = next;
    },
  };
};

describe("createHomeScreenPlugin", () => {
  it("renders the greeting, start card, starters, cards, and links", () => {
    const harness = createWelcomeHarness(createHomeScreenPlugin(OPTIONS));
    const home = harness.render();

    expect(home?.querySelector(".persona-home__title")?.textContent).toBe(
      "Hi, how can we help?",
    );
    expect(home?.querySelector(".persona-home__avatar")?.textContent).toBe("🛍️");
    expect(
      home?.querySelector(".persona-home__start .persona-home__label")
        ?.textContent,
    ).toBe("Start a conversation");
    expect(harness.starters).toEqual([
      "Track my latest order",
      "Start a return",
    ]);
    expect(home?.querySelectorAll(".persona-home__card")).toHaveLength(1);
    expect(home?.querySelectorAll(".persona-home__link")).toHaveLength(1);
  });

  it("hands the panel to the transcript on start, then re-shows over it", () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);

    harness.render()?.querySelector<HTMLButtonElement>(".persona-home__start")?.click();
    expect(harness.current()).toBeNull();
    expect(plugin.isHome()).toBe(false);

    // The transcript now has a user message, so the core derives visible: false.
    harness.setVisible(false);
    plugin.showHome();

    expect(harness.current()?.className).toBe("persona-home");
    expect(plugin.isHome()).toBe(true);
  });

  it("leaves home after a starter selection commits", async () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);
    harness.render();

    plugin.onSuggestionSelect?.({
      suggestion: {
        id: "order",
        label: "Track my latest order",
        prompt: "Track my latest order",
        behavior: "send",
        emphasis: "default",
      },
      surface: "starter",
      source: "config",
      variant: "card",
      config: {},
    });
    await Promise.resolve();

    expect(harness.current()).toBeNull();
    expect(plugin.isHome()).toBe(false);
  });

  it("stays on home when a follow-up is selected from the transcript", async () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);
    harness.render();

    plugin.onSuggestionSelect?.({
      suggestion: {
        id: "next",
        label: "Anything else?",
        prompt: "Anything else?",
        behavior: "send",
        emphasis: "default",
      },
      surface: "followUp",
      source: "agent",
      variant: "chip",
      config: {},
    });
    await Promise.resolve();

    expect(harness.current()?.className).toBe("persona-home");
  });

  it("sends a card prompt and hands the panel over", () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);

    harness.render()?.querySelector<HTMLButtonElement>(".persona-home__card")?.click();

    expect(harness.sent).toEqual(["What changed with same-day delivery?"]);
    expect(harness.current()).toBeNull();
  });

  it("re-renders in place when options change", () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);
    harness.render();

    plugin.update({ links: [], cards: [] });

    expect(harness.current()?.querySelectorAll(".persona-home__link")).toHaveLength(
      0,
    );
    expect(harness.current()?.querySelectorAll(".persona-home__card")).toHaveLength(
      0,
    );
    expect(harness.starters).toHaveLength(2);
  });

  it("never covers a restored conversation until the home action asks for it", () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);

    // Unset view flag plus derived visible: false means history was restored.
    harness.setVisible(false);
    expect(harness.render()).toBeNull();

    plugin.showHome();
    expect(harness.current()?.className).toBe("persona-home");
  });

  it("hides the composer while home is shown and restores it on start", async () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);

    // Construction order: the composer hook runs before the first welcome render.
    harness.renderComposer();
    harness.render();
    expect(
      harness.composer()?.hasAttribute("data-persona-home-composer-hidden"),
    ).toBe(true);

    harness.current()?.querySelector<HTMLButtonElement>(".persona-home__start")?.click();
    await Promise.resolve();

    // Null falls through to the default composer.
    expect(harness.composer()).toBeNull();
  });

  it("keeps the composer for a restored conversation, corrected before paint", async () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);
    harness.setVisible(false);

    // The composer hook alone cannot see `visible`, so it guesses home ...
    harness.renderComposer();
    expect(
      harness.composer()?.hasAttribute("data-persona-home-composer-hidden"),
    ).toBe(true);

    // ... and the welcome render corrects it in a microtask.
    expect(harness.render()).toBeNull();
    await Promise.resolve();
    expect(harness.composer()).toBeNull();
  });

  it("hides the composer again when showHome returns over the transcript", async () => {
    const plugin = createHomeScreenPlugin(OPTIONS);
    const harness = createWelcomeHarness(plugin);
    harness.renderComposer();
    harness.render();

    harness.current()?.querySelector<HTMLButtonElement>(".persona-home__start")?.click();
    await Promise.resolve();
    expect(harness.composer()).toBeNull();

    harness.setVisible(false);
    plugin.showHome();
    await Promise.resolve();
    expect(
      harness.composer()?.hasAttribute("data-persona-home-composer-hidden"),
    ).toBe(true);
  });
});
