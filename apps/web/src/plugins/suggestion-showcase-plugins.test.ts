// @vitest-environment jsdom

import { describe, expect, it } from "vitest";

import type {
  AgentWidgetPluginStorage,
  AgentWidgetRenderWelcomeContext,
} from "@runtypelabs/persona";

import {
  createCuratedSuggestionsPlugin,
  createWelcomeHomePlugin,
} from "./suggestion-showcase-plugins";

describe("createCuratedSuggestionsPlugin", () => {
  it("reorders suggestions before enriching the recommended item", () => {
    const plugin = createCuratedSuggestionsPlugin();
    const transformed = plugin.transformSuggestions?.({
      suggestions: [
        {
          id: "short",
          label: "Short",
          prompt: "Short",
          behavior: "send",
          emphasis: "default",
        },
        {
          id: "long",
          label: "A much longer suggestion",
          prompt: "A much longer suggestion",
          behavior: "send",
          emphasis: "default",
        },
        {
          id: "medium",
          label: "Medium label",
          prompt: "Medium label",
          behavior: "send",
          emphasis: "default",
        },
      ],
      surface: "followUp",
      source: "agent",
      config: {},
    });

    expect(
      transformed?.map((suggestion) =>
        typeof suggestion === "string" ? suggestion : suggestion.id,
      ),
    ).toEqual(["long", "medium", "short"]);
    const first = transformed?.[0];
    if (!first || typeof first === "string") {
      throw new Error("Expected an enriched suggestion object.");
    }
    expect(first).toMatchObject({
      label: "Recommended · A much longer suggestion",
      emphasis: "primary",
      icon: "sparkles",
    });
    expect(first.description).toContain("Based on this answer");
  });
});

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

/** Mirrors the core's welcome arbitration: cleanups run, prior content drops, fresh ctx. */
const createWelcomeHarness = (
  plugin: ReturnType<typeof createWelcomeHomePlugin>,
) => {
  const storage = createMemoryStorage();
  const cleanups: Array<() => void> = [];
  const starters: string[] = [];
  let content: HTMLElement | null = null;
  let visible = true;

  const render = (): HTMLElement | null => {
    cleanups.splice(0, cleanups.length).forEach((fn) => fn());
    content?.remove();
    starters.length = 0;
    content =
      plugin.renderWelcome?.({
        config: {
          title: "Hello",
          subtitle: "Ask about anything on this page.",
          variant: "card",
          dismiss: "never",
        },
        variant: "card",
        visible,
        defaultRenderer: () => document.createElement("div"),
        sendMessage: () => {},
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
    starters,
    current: () => content,
    setVisible: (next: boolean) => {
      visible = next;
    },
  };
};

describe("createWelcomeHomePlugin", () => {
  it("renders the home stack with starters on first arbitration", () => {
    const harness = createWelcomeHarness(createWelcomeHomePlugin());
    const home = harness.render();

    expect(home?.className).toBe("suggestion-home");
    expect(harness.starters).toHaveLength(3);
  });

  it("re-shows the home stack after leaving it, even when derived visibility is false", () => {
    const plugin = createWelcomeHomePlugin();
    const harness = createWelcomeHarness(plugin);

    const home = harness.render();
    home
      ?.querySelector<HTMLButtonElement>(".suggestion-home__start")
      ?.click();
    expect(harness.current()).toBeNull();

    // The transcript now has a user message, so the core derives visible: false.
    harness.setVisible(false);
    plugin.showHome();

    expect(harness.current()?.className).toBe("suggestion-home");
    expect(harness.starters).toHaveLength(3);
  });
});
