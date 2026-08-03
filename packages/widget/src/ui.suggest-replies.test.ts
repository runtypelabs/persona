// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { SUGGEST_REPLIES_TOOL_NAME } from "./suggest-replies-tool";
import type { AgentWidgetPlugin } from "./plugins/types";
import type { AgentWidgetSuggestion } from "./types";

const createMount = () => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  return mount;
};

const makeController = (config?: Record<string, unknown>) => {
  const mount = createMount();
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  return { mount, controller };
};

const injectUserMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "u1",
  createdAt = "2026-06-10T00:00:00.000Z",
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "user",
      content: "hello",
      createdAt,
      streaming: false,
    },
  });
};

const injectAssistantMessage = (
  controller: ReturnType<typeof createAgentExperience>,
  id = "a1",
  createdAt = "2026-06-10T00:00:01.000Z",
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "Here is the answer.",
      createdAt,
      streaming: false,
    },
  });
};

const injectSuggestReplies = (
  controller: ReturnType<typeof createAgentExperience>,
  {
    id = "sr-1",
    suggestions = ["Tell me more", "Show pricing"],
  }: { id?: string; suggestions?: AgentWidgetSuggestion[] } = {},
) => {
  controller.injectTestMessage({
    type: "message",
    message: {
      id,
      role: "assistant",
      content: "",
      createdAt: "2026-06-10T00:00:01.000Z",
      streaming: false,
      variant: "tool",
      toolCall: {
        id,
        name: SUGGEST_REPLIES_TOOL_NAME,
        status: "complete",
        args: { suggestions },
        chunks: [],
      },
      // No executionId/awaitingLocalTool: rendering is driven purely by the
      // message list; the auto-resume path is covered in
      // suggest-replies-tool.test.ts.
    },
  });
};

/** SSE body in the wire's data-only shape: one JSON frame per event. */
const sseStream = (frames: Record<string, unknown>[]) => {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const frame of frames) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(frame)}\n\n`));
      }
      controller.close();
    },
  });
};

/** Drives a real stream to completion so the session flips back to idle. */
const completeStream = (
  controller: ReturnType<typeof createAgentExperience>,
  frames: Record<string, unknown>[] = [{ type: "done" }],
) => controller.connectStream(sseStream(frames));

const chipButtons = (mount: HTMLElement, label: string): HTMLButtonElement[] =>
  Array.from(mount.querySelectorAll("button")).filter(
    (btn) => btn.textContent === label,
  );

describe("suggest_replies chips UI", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders agent-pushed chips mid-conversation (after a user message exists)", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    expect(chipButtons(mount, "Tell me more")).toHaveLength(1);
    expect(chipButtons(mount, "Show pricing")).toHaveLength(1);

    controller.destroy();
  });

  it("renders rich starter cards in the welcome surface", () => {
    const { mount, controller } = makeController({
      suggestions: {
        starters: {
          variant: "card",
          items: [
            {
              id: "pricing",
              label: "Compare plans",
              prompt: "Help me compare plans",
              description: "See features and pricing side by side",
              icon: "dollar-sign",
              emphasis: "primary",
            },
          ],
        },
      },
    });

    const welcome = mount.querySelector(
      '[data-persona-suggestions="starter"]',
    );
    const button = welcome?.querySelector<HTMLButtonElement>(
      '[data-suggestion-id="pricing"]',
    );
    expect(welcome?.getAttribute("data-variant")).toBe("card");
    expect(button?.textContent).toContain("Compare plans");
    expect(button?.textContent).toContain(
      "See features and pricing side by side",
    );
    expect(button?.dataset.emphasis).toBe("primary");

    controller.destroy();
  });

  it("wraps starters by default and honors an explicit overflow", () => {
    const wrapping = makeController({
      suggestions: { starters: { items: ["Compare plans"] } },
    });
    expect(
      wrapping.mount
        .querySelector('[data-persona-suggestions="starter"]')
        ?.getAttribute("data-overflow"),
    ).toBe("wrap");
    wrapping.controller.destroy();

    const scrolling = makeController({
      suggestions: {
        starters: { items: ["Compare plans"], overflow: "scroll" },
      },
    });
    expect(
      scrolling.mount
        .querySelector('[data-persona-suggestions="starter"]')
        ?.getAttribute("data-overflow"),
    ).toBe("scroll");
    scrolling.controller.destroy();
  });

  it("wraps follow-ups by default", () => {
    // 2-4 compact chips always fit at widget width; a scroll strip hides
    // most of the set behind a fade, so scroll is opt-in for large sets.
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    // No followUps config: agent chips land on the composer surface.
    expect(
      mount
        .querySelector("[data-persona-composer-suggestions]")
        ?.getAttribute("data-overflow"),
    ).toBe("wrap");

    controller.destroy();
  });

  it("auto placement follows welcome-card visibility", () => {
    const withCard = makeController({
      suggestions: { starters: { items: ["Compare plans"] } },
    });
    expect(
      withCard.mount.querySelector('[data-persona-suggestions="starter"]')
        ?.textContent,
    ).toContain("Compare plans");
    withCard.controller.destroy();

    const withoutCard = makeController({
      copy: { showWelcomeCard: false },
      suggestions: { starters: { items: ["Compare plans"] } },
    });
    expect(
      withoutCard.mount.querySelector('[data-persona-suggestions="starter"]')
        ?.textContent,
    ).not.toContain("Compare plans");
    expect(
      withoutCard.mount.querySelector("[data-persona-composer-suggestions]")
        ?.textContent,
    ).toContain("Compare plans");
    withoutCard.controller.destroy();
  });

  it("renders nothing and warns in debug when welcome is pinned without the card", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { mount, controller } = makeController({
      debug: true,
      copy: { showWelcomeCard: false },
      suggestions: {
        starters: { items: ["Compare plans"], placement: "welcome" },
      },
    });

    expect(chipButtons(mount, "Compare plans")).toHaveLength(0);
    const placementWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("suggestions.starters.placement"),
    );
    expect(placementWarnings).toHaveLength(1);

    // Re-rendering the surface must not repeat the warning.
    controller.update({
      copy: { showWelcomeCard: false, welcomeTitle: "Updated" },
    });
    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes("suggestions.starters.placement"),
      ),
    ).toHaveLength(1);

    controller.destroy();
  });

  it("honors an explicit composer placement while the welcome card shows", () => {
    const { mount, controller } = makeController({
      suggestions: {
        starters: { items: ["Compare plans"], placement: "composer" },
      },
    });

    expect(
      mount.querySelector("[data-persona-composer-suggestions]")?.textContent,
    ).toContain("Compare plans");
    expect(
      mount.querySelector('[data-persona-suggestions="starter"]')?.textContent,
    ).not.toContain("Compare plans");

    controller.destroy();
  });

  it("swaps starters in through controller.update (async starters recipe)", () => {
    const { mount, controller } = makeController({
      suggestions: { starters: { items: ["Loading suggestions"] } },
    });

    controller.update({
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      suggestions: {
        starters: {
          items: [
            { id: "reset", label: "Reset my password", prompt: "How do I reset my password?" },
            "Check my order status",
          ],
        },
      },
    } as unknown as Parameters<typeof controller.update>[0]);

    const surface = mount.querySelector('[data-persona-suggestions="starter"]');
    expect(surface?.textContent).not.toContain("Loading suggestions");
    expect(surface?.textContent).toContain("Reset my password");
    expect(surface?.textContent).toContain("Check my order status");
    expect(
      surface?.querySelector('[data-suggestion-id="reset"]'),
    ).not.toBeNull();

    controller.destroy();
  });

  it("places structured follow-ups after the transcript", () => {
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "after-message",
          variant: "list",
        },
      },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller, {
      suggestions: [
        {
          label: "See examples",
          description: "Browse common implementations",
        },
      ],
    });

    const transcriptHost = mount.querySelector(
      '[data-persona-suggestions="follow-up"]',
    );
    expect(transcriptHost?.getAttribute("data-variant")).toBe("list");
    expect(transcriptHost?.textContent).toContain("See examples");
    expect(transcriptHost?.textContent).toContain(
      "Browse common implementations",
    );
    expect(
      mount.querySelector("[data-persona-composer-suggestions]")?.textContent,
    ).not.toContain("See examples");

    controller.destroy();
  });

  it("fills the composer without sending when behavior is fill", () => {
    global.fetch = vi.fn();
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "composer",
          behavior: "fill",
        },
      },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller, {
      suggestions: [
        {
          label: "Customize this",
          prompt: "Customize this for my team",
        },
      ],
    });

    chipButtons(mount, "Customize this")[0]!.click();

    expect(
      mount.querySelector<HTMLTextAreaElement>("textarea")?.value,
    ).toBe("Customize this for my team");
    expect(global.fetch).not.toHaveBeenCalled();
    expect(
      controller.getMessages().filter((message) => message.role === "user"),
    ).toHaveLength(1);

    controller.destroy();
  });

  it("suppresses the transcript tool bubble for the suggest_replies message", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    // No tool bubble rendered for the suggest_replies tool message.
    expect(mount.querySelector('[data-bubble-type="tool"]')).toBeNull();
    expect(mount.textContent).not.toContain("suggest_replies");

    controller.destroy();
  });

  it("clears the chips once a user message follows them", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller, "u1");
    injectSuggestReplies(controller);
    expect(chipButtons(mount, "Tell me more")).toHaveLength(1);

    injectUserMessage(controller, "u2", "2026-06-10T00:00:02.000Z");
    expect(chipButtons(mount, "Tell me more")).toHaveLength(0);

    controller.destroy();
  });

  it("shows only the latest call's chips when a turn carries several", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller, { id: "sr-1", suggestions: ["Old"] });
    injectSuggestReplies(controller, { id: "sr-2", suggestions: ["New"] });

    expect(chipButtons(mount, "Old")).toHaveLength(0);
    expect(chipButtons(mount, "New")).toHaveLength(1);

    controller.destroy();
  });

  it("sends the chip text verbatim as a user message on click", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          c.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    chipButtons(mount, "Tell me more")[0]!.click();
    await Promise.resolve();

    const sent = controller
      .getMessages()
      .filter((m) => m.role === "user")
      .map((m) => m.content);
    expect(sent).toContain("Tell me more");
    // The chip click appended a user message, so the chips cleared.
    expect(chipButtons(mount, "Tell me more")).toHaveLength(0);

    controller.destroy();
  });

  it("keeps live agent chips through a config update", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);
    expect(chipButtons(mount, "Tell me more")).toHaveLength(1);

    // A display-only config update (e.g. theme tweak) re-renders the
    // suggestions row: it must re-apply the agent-chips rule, not fall back
    // to the static config chips (which are hidden mid-conversation).
    controller.update({
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: false },
      suggestionChips: [],
      copy: { title: "Updated title" },
    } as unknown as Parameters<typeof controller.update>[0]);

    expect(chipButtons(mount, "Tell me more")).toHaveLength(1);

    controller.destroy();
  });

  it("updates follow-up presentation and placement through live config", () => {
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "after-message",
          variant: "card",
        },
      },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    expect(
      mount
        .querySelector('[data-persona-suggestions="follow-up"]')
        ?.getAttribute("data-variant"),
    ).toBe("card");

    controller.update({
      suggestions: {
        followUps: {
          placement: "composer",
          variant: "list",
          behavior: "fill",
        },
      },
    });

    const composerSurface = mount.querySelector(
      '[data-persona-composer-suggestions][data-persona-suggestion-surface="follow-up"]',
    );
    expect(composerSurface?.getAttribute("data-variant")).toBe("list");
    const updatedButton = Array.from(
      composerSurface?.querySelectorAll<HTMLButtonElement>("button") ?? [],
    ).find((button) => button.textContent?.includes("Tell me more"));
    updatedButton?.click();
    expect(mount.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Tell me more",
    );

    controller.destroy();
  });

  it("tracks the visible overflow edges for horizontally scrolling chips", async () => {
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "after-message",
          variant: "chip",
          overflow: "scroll",
        },
      },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    const surface = mount.querySelector<HTMLElement>(
      '[data-persona-suggestions="follow-up"]',
    )!;
    Object.defineProperties(surface, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    const flushOverflowFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    // Scroll snap may settle just inside the 2px visual padding.
    surface.scrollLeft = 2;
    surface.dispatchEvent(new Event("scroll"));
    await flushOverflowFrame();
    expect(surface.hasAttribute("data-scroll-left")).toBe(false);
    expect(surface.hasAttribute("data-scroll-right")).toBe(true);

    surface.scrollLeft = 150;
    surface.dispatchEvent(new Event("scroll"));
    await flushOverflowFrame();
    expect(surface.hasAttribute("data-scroll-left")).toBe(true);
    expect(surface.hasAttribute("data-scroll-right")).toBe(true);

    surface.scrollLeft = 300;
    surface.dispatchEvent(new Event("scroll"));
    await flushOverflowFrame();
    expect(surface.hasAttribute("data-scroll-left")).toBe(true);
    expect(surface.hasAttribute("data-scroll-right")).toBe(false);

    controller.destroy();
  });

  it("maps horizontal overflow edges correctly in RTL", async () => {
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "after-message",
          variant: "chip",
          overflow: "scroll",
        },
      },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    const surface = mount.querySelector<HTMLElement>(
      '[data-persona-suggestions="follow-up"]',
    )!;
    surface.style.direction = "rtl";
    Object.defineProperties(surface, {
      clientWidth: { configurable: true, value: 200 },
      scrollWidth: { configurable: true, value: 500 },
    });
    const flushOverflowFrame = () =>
      new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));

    surface.scrollLeft = 0;
    surface.dispatchEvent(new Event("scroll"));
    await flushOverflowFrame();
    expect(surface.hasAttribute("data-scroll-left")).toBe(true);
    expect(surface.hasAttribute("data-scroll-right")).toBe(false);

    surface.scrollLeft = -300;
    surface.dispatchEvent(new Event("scroll"));
    await flushOverflowFrame();
    expect(surface.hasAttribute("data-scroll-left")).toBe(false);
    expect(surface.hasAttribute("data-scroll-right")).toBe(true);

    controller.destroy();
  });

  it("renders no chips and falls back to the tool bubble when disabled", () => {
    const { mount, controller } = makeController({
      features: { suggestReplies: { enabled: false } },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    expect(chipButtons(mount, "Tell me more")).toHaveLength(0);
    // The generic tool bubble renders instead, keeping the parked call visible.
    expect(mount.textContent).toContain("suggest_replies");

    controller.destroy();
  });

  it("dispatches persona:suggestReplies:shown and :selected DOM events", async () => {
    global.fetch = vi.fn().mockImplementation(async () => {
      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(c) {
          c.enqueue(encoder.encode('data: {"type":"done"}\n\n'));
          c.close();
        },
      });
      return new Response(stream, {
        headers: { "Content-Type": "text/event-stream" },
      });
    });

    const shown: string[][] = [];
    const selected: string[] = [];
    document.addEventListener("persona:suggestReplies:shown", (e) => {
      shown.push((e as CustomEvent).detail.suggestions);
    });
    document.addEventListener("persona:suggestReplies:selected", (e) => {
      selected.push((e as CustomEvent).detail.suggestion);
    });

    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);

    expect(shown).toEqual([["Tell me more", "Show pricing"]]);

    // Re-rendering the same chip set must not re-fire `shown`.
    injectSuggestReplies(controller, { id: "sr-1" });
    expect(shown).toHaveLength(1);

    chipButtons(mount, "Show pricing")[0]!.click();
    await Promise.resolve();
    expect(selected).toEqual(["Show pricing"]);

    controller.destroy();
  });

  it("dispatches unified suggestion events with surface and behavior metadata", () => {
    const shown: CustomEvent["detail"][] = [];
    const selected: CustomEvent["detail"][] = [];
    document.addEventListener("persona:suggestion:shown", (event) => {
      shown.push((event as CustomEvent).detail);
    });
    document.addEventListener("persona:suggestion:selected", (event) => {
      selected.push((event as CustomEvent).detail);
    });

    const { mount, controller } = makeController({
      suggestions: {
        starters: {
          behavior: "fill",
          items: [{ id: "draft", label: "Draft a reply" }],
        },
      },
    });

    chipButtons(mount, "Draft a reply")[0]!.click();

    expect(shown).toHaveLength(1);
    expect(shown[0]).toMatchObject({
      surface: "starter",
      source: "config",
      variant: "card",
    });
    expect(selected[0]).toMatchObject({
      surface: "starter",
      source: "config",
      behavior: "fill",
      suggestion: { id: "draft", prompt: "Draft a reply" },
    });

    controller.destroy();
  });

  it("lets plugins transform starter and follow-up suggestion sets", () => {
    const transformSuggestions = vi.fn<
      NonNullable<AgentWidgetPlugin["transformSuggestions"]>
    >(({ suggestions, surface }) =>
        suggestions.map((suggestion, index) => ({
          ...suggestion,
          id: `${surface}-${index}`,
          label: `${suggestion.label} · curated`,
          description: `Transformed on the ${surface} surface`,
          emphasis: index === 0 ? "primary" : "default",
        })));
    const { mount, controller } = makeController({
      plugins: [{ id: "curate", transformSuggestions }],
      suggestions: {
        starters: {
          items: ["Compare plans", "Browse docs"],
          maxItems: 1,
        },
      },
    });

    expect(mount.textContent).toContain("Compare plans · curated");
    expect(mount.textContent).toContain(
      "Transformed on the starter surface",
    );
    expect(mount.textContent).not.toContain("Browse docs · curated");
    // Hooks receive normalized items: the string shorthand is already expanded
    // and the surface behavior resolved before the first transform runs.
    expect(transformSuggestions).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "starter",
        source: "config",
        suggestions: [
          {
            id: "Compare plans",
            label: "Compare plans",
            prompt: "Compare plans",
            emphasis: "default",
            behavior: "send",
          },
          {
            id: "Browse docs",
            label: "Browse docs",
            prompt: "Browse docs",
            emphasis: "default",
            behavior: "send",
          },
        ],
      }),
    );

    injectUserMessage(controller);
    injectSuggestReplies(controller, { suggestions: ["See examples"] });
    expect(mount.textContent).toContain("See examples · curated");
    expect(transformSuggestions).toHaveBeenLastCalledWith(
      expect.objectContaining({
        surface: "followUp",
        source: "agent",
        suggestions: [
          expect.objectContaining({
            label: "See examples",
            prompt: "See examples",
            behavior: "send",
          }),
        ],
      }),
    );

    controller.destroy();
  });

  it("composes suggestion transforms in plugin priority order", () => {
    const append = (
      suffix: string,
    ): NonNullable<AgentWidgetPlugin["transformSuggestions"]> =>
      ({ suggestions }) =>
        suggestions.map((suggestion) => ({
          ...suggestion,
          label: `${suggestion.label} · ${suffix}`,
        }));
    const { mount, controller } = makeController({
      plugins: [
        { id: "low", priority: 0, transformSuggestions: append("low") },
        { id: "high", priority: 10, transformSuggestions: append("high") },
      ],
      suggestions: {
        starters: { items: ["Original"] },
      },
    });

    expect(mount.textContent).toContain("Original · high · low");

    controller.destroy();
  });

  it("re-normalizes string shorthand returned by a transform", () => {
    const shorthand: AgentWidgetPlugin = {
      id: "shorthand",
      transformSuggestions: ({ suggestions }) => [
        ...suggestions,
        "Appended shorthand",
      ],
    };
    const { mount, controller } = makeController({
      plugins: [shorthand],
      suggestions: {
        starters: { items: [{ label: "Configured" }] },
      },
    });

    const appended = chipButtons(mount, "Appended shorthand")[0];
    expect(appended).toBeDefined();
    expect(appended?.dataset.suggestionId).toBe("Appended shorthand");
    expect(appended?.dataset.behavior).toBe("send");

    controller.destroy();
  });

  it("keeps a per-item behavior set by a transform", () => {
    const fillLongPrompts: AgentWidgetPlugin = {
      id: "long-prompts-fill",
      transformSuggestions: ({ suggestions }) =>
        suggestions.map((suggestion) =>
          suggestion.label === "Draft"
            ? { ...suggestion, behavior: "fill" as const }
            : suggestion,
        ),
    };
    const { mount, controller } = makeController({
      plugins: [fillLongPrompts],
      suggestions: {
        starters: { behavior: "send", items: ["Draft", "Send"] },
      },
    });

    expect(chipButtons(mount, "Draft")[0]?.dataset.behavior).toBe("fill");
    expect(chipButtons(mount, "Send")[0]?.dataset.behavior).toBe("send");

    chipButtons(mount, "Draft")[0]!.click();
    expect(mount.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Draft",
    );

    controller.destroy();
  });

  it("caps after the full transform chain, so transforms can add items", () => {
    const expand: AgentWidgetPlugin = {
      id: "expand",
      transformSuggestions: ({ suggestions }) => [
        ...suggestions,
        "Added one",
        "Added two",
        "Beyond the cap",
      ],
    };
    const { mount, controller } = makeController({
      plugins: [expand],
      suggestions: {
        starters: { items: ["Configured"], maxItems: 3 },
      },
    });

    expect(chipButtons(mount, "Configured")).toHaveLength(1);
    expect(chipButtons(mount, "Added one")).toHaveLength(1);
    expect(chipButtons(mount, "Added two")).toHaveLength(1);
    expect(chipButtons(mount, "Beyond the cap")).toHaveLength(0);

    controller.destroy();
  });

  it("hides the surface when a transform returns an empty array", () => {
    const { mount, controller } = makeController({
      plugins: [{ id: "hide-all", transformSuggestions: () => [] }],
      suggestions: {
        starters: { items: ["Compare plans", "Browse docs"] },
      },
    });

    expect(chipButtons(mount, "Compare plans")).toHaveLength(0);
    const surfaces = Array.from(
      mount.querySelectorAll<HTMLElement>(
        '[data-persona-suggestions="starter"]',
      ),
    );
    expect(surfaces.length).toBeGreaterThan(0);
    expect(surfaces.every((surface) => surface.hidden)).toBe(true);

    controller.destroy();
  });

  it("lets a renderSuggestion plugin own the item UI and use select()", () => {
    const renderSuggestion = vi.fn<
      NonNullable<AgentWidgetPlugin["renderSuggestion"]>
    >(({ suggestion, surface, select }) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "custom-suggestion";
        button.textContent = `${surface}: ${suggestion.label}`;
        button.addEventListener("click", select);
        return button;
      });
    const { mount, controller } = makeController({
      plugins: [{ id: "custom-suggestion", renderSuggestion }],
      suggestions: {
        starters: {
          behavior: "fill",
          items: [{ id: "draft", label: "Draft a reply" }],
        },
      },
    });

    const custom = mount.querySelector<HTMLButtonElement>(
      ".custom-suggestion",
    );
    expect(custom?.textContent).toBe("starter: Draft a reply");
    expect(custom?.dataset.suggestionId).toBe("draft");
    custom?.click();
    expect(mount.querySelector<HTMLTextAreaElement>("textarea")?.value).toBe(
      "Draft a reply",
    );
    expect(renderSuggestion).toHaveBeenCalledWith(
      expect.objectContaining({
        index: 0,
        surface: "starter",
        source: "config",
        variant: "card",
        suggestion: expect.objectContaining({
          id: "draft",
          behavior: "fill",
        }),
        defaultRenderer: expect.any(Function),
        select: expect.any(Function),
      }),
    );

    controller.destroy();
  });

  it("falls back to the built-in renderer when renderSuggestion returns null", () => {
    const { mount, controller } = makeController({
      plugins: [
        {
          id: "decline-suggestion",
          renderSuggestion: () => null,
        },
      ],
      suggestions: {
        starters: { items: ["Use the default"] },
      },
    });

    expect(
      chipButtons(mount, "Use the default")[0]?.classList.contains(
        "persona-suggestion--card",
      ),
    ).toBe(true);

    controller.destroy();
  });

  it("lets selection hooks and cancelable DOM events prevent the default action", () => {
    const onSuggestionSelect = vi.fn((): boolean => false);
    const { mount, controller } = makeController({
      plugins: [{ id: "selection-guard", onSuggestionSelect }],
      suggestions: {
        starters: {
          behavior: "fill",
          items: ["Plugin guarded", "DOM guarded"],
        },
      },
    });
    const textarea = mount.querySelector<HTMLTextAreaElement>("textarea")!;

    chipButtons(mount, "Plugin guarded")[0]!.click();
    expect(onSuggestionSelect).toHaveBeenCalledWith(
      expect.objectContaining({
        surface: "starter",
        source: "config",
        variant: "card",
        suggestion: expect.objectContaining({
          label: "Plugin guarded",
          behavior: "fill",
        }),
      }),
    );
    expect(textarea.value).toBe("");

    onSuggestionSelect.mockReturnValue(true);
    mount.addEventListener(
      "persona:suggestion:selected",
      (event) => event.preventDefault(),
      { once: true },
    );
    chipButtons(mount, "DOM guarded")[0]!.click();
    expect(textarea.value).toBe("");

    controller.destroy();
  });
});

describe("minimal BYO wire sequence", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  // Pins the four-frame sequence documented in UI-COMPONENTS.md: no
  // turn_start, no text frames, no await/resume. Args ride tool_start.
  it("renders chips from execution_start, tool_start, tool_complete, execution_complete", async () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);

    await completeStream(controller, [
      { type: "execution_start", executionId: "exec-byo" },
      {
        type: "tool_start",
        executionId: "exec-byo",
        toolCallId: "call_byo_1",
        toolName: SUGGEST_REPLIES_TOOL_NAME,
        toolType: "local",
        parameters: {
          suggestions: [
            { label: "Tell me more" },
            { label: "Show pricing", prompt: "Show me the pricing tiers" },
          ],
        },
      },
      {
        type: "tool_complete",
        executionId: "exec-byo",
        toolCallId: "call_byo_1",
        success: true,
        result: { content: [{ type: "text", text: "Suggestions shown to the user." }] },
      },
      { type: "execution_complete", executionId: "exec-byo" },
    ]);

    const toolMessage = controller
      .getMessages()
      .find((message) => message.toolCall?.name === SUGGEST_REPLIES_TOOL_NAME);
    expect(toolMessage?.variant).toBe("tool");
    expect(toolMessage?.toolCall?.args).toEqual({
      suggestions: [
        { label: "Tell me more" },
        { label: "Show pricing", prompt: "Show me the pricing tiers" },
      ],
    });

    const chips = chipButtons(mount, "Tell me more");
    expect(chips).toHaveLength(1);
    expect(chips[0]!.disabled).toBe(false);
    expect(chipButtons(mount, "Show pricing")).toHaveLength(1);

    controller.destroy();
  });
});

describe("follow-ups never called debug hint", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  const spyHints = () => {
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    info.mockClear();
    return () =>
      info.mock.calls.filter((call) =>
        String(call[0]).includes("has not called suggest_replies"),
      );
  };

  it("fires once after a stream completes with the default flags", async () => {
    const hints = spyHints();
    const { controller } = makeController({ debug: true });
    injectUserMessage(controller);
    injectAssistantMessage(controller);

    await completeStream(controller);
    expect(hints()).toHaveLength(1);
    expect(String(hints()[0]![0])).toContain("suggestions.followUps.expose");

    await completeStream(controller);
    expect(hints()).toHaveLength(1);

    controller.destroy();
  });

  it("does not fire on a restored transcript with no dispatch this session", () => {
    const hints = spyHints();
    const { controller } = makeController({ debug: true });
    injectUserMessage(controller);
    injectAssistantMessage(controller);
    injectAssistantMessage(controller, "a2", "2026-06-10T00:00:03.000Z");

    expect(hints()).toHaveLength(0);

    controller.destroy();
  });

  it("does not fire when the host drives follow-ups itself", async () => {
    const hints = spyHints();
    const { controller } = makeController({ debug: true });
    injectUserMessage(controller);
    injectAssistantMessage(controller);
    controller.setFollowUpSuggestions(["Book a demo"]);

    await completeStream(controller);
    // The overlay expires on the next user message; the hint stays off anyway.
    injectUserMessage(controller, "u2", "2026-06-10T00:00:04.000Z");
    await completeStream(controller);
    expect(hints()).toHaveLength(0);

    controller.destroy();
  });

  it("does not fire when the widget exposes the tool itself", async () => {
    const hints = spyHints();
    const { controller } = makeController({
      debug: true,
      suggestions: { followUps: { expose: true } },
    });
    injectUserMessage(controller);
    injectAssistantMessage(controller);
    await completeStream(controller);

    expect(hints()).toHaveLength(0);

    controller.destroy();
  });

  it("does not fire once a suggest_replies message exists", async () => {
    const hints = spyHints();
    const { controller } = makeController({ debug: true });
    injectUserMessage(controller);
    injectSuggestReplies(controller);
    await completeStream(controller);

    expect(hints()).toHaveLength(0);

    controller.destroy();
  });

  it("does not fire when the feature is disabled", async () => {
    const hints = spyHints();
    const { controller } = makeController({
      debug: true,
      suggestions: { followUps: { enabled: false } },
    });
    injectUserMessage(controller);
    injectAssistantMessage(controller);
    await completeStream(controller);

    expect(hints()).toHaveLength(0);

    controller.destroy();
  });

  it("does not fire without debug", async () => {
    const hints = spyHints();
    const { controller } = makeController();
    injectUserMessage(controller);
    injectAssistantMessage(controller);
    await completeStream(controller);

    expect(hints()).toHaveLength(0);

    controller.destroy();
  });
});

describe("host-set follow-up suggestions", () => {
  afterEach(() => {
    document.body.innerHTML = "";
    if (typeof localStorage !== "undefined") localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders through the followUps config and reports source host", () => {
    const transformSuggestions = vi.fn<
      NonNullable<AgentWidgetPlugin["transformSuggestions"]>
    >(({ suggestions }) => suggestions);
    const { mount, controller } = makeController({
      plugins: [{ id: "spy", transformSuggestions }],
      suggestions: {
        followUps: { placement: "after-message", variant: "list" },
      },
    });
    const shown: CustomEvent["detail"][] = [];
    const legacyShown: string[][] = [];
    mount.addEventListener("persona:suggestion:shown", (event) => {
      shown.push((event as CustomEvent).detail);
    });
    mount.addEventListener("persona:suggestReplies:shown", (event) => {
      legacyShown.push((event as CustomEvent).detail.suggestions);
    });

    injectUserMessage(controller);
    controller.setFollowUpSuggestions([
      { label: "Book a demo", description: "Talk to the team" },
    ]);

    const surface = mount.querySelector(
      '[data-persona-suggestions="follow-up"]',
    );
    expect(surface?.getAttribute("data-variant")).toBe("list");
    expect(surface?.textContent).toContain("Book a demo");
    expect(surface?.textContent).toContain("Talk to the team");
    expect(transformSuggestions).toHaveBeenLastCalledWith(
      expect.objectContaining({ surface: "followUp", source: "host" }),
    );
    expect(shown.at(-1)).toMatchObject({
      surface: "followUp",
      source: "host",
      variant: "list",
    });
    expect(legacyShown.at(-1)).toEqual(["Book a demo"]);

    controller.destroy();
  });

  it("reports source host to the selection hook and legacy event", () => {
    const onSuggestionSelect = vi.fn((): boolean => false);
    const { mount, controller } = makeController({
      plugins: [{ id: "guard", onSuggestionSelect }],
      suggestions: { followUps: { placement: "composer" } },
    });
    const legacySelected: string[] = [];
    mount.addEventListener("persona:suggestReplies:selected", (event) => {
      legacySelected.push((event as CustomEvent).detail.suggestion);
    });

    injectUserMessage(controller);
    controller.setFollowUpSuggestions(["Show pricing"]);
    chipButtons(mount, "Show pricing")[0]!.click();

    expect(onSuggestionSelect).toHaveBeenCalledWith(
      expect.objectContaining({ surface: "followUp", source: "host" }),
    );
    expect(legacySelected).toEqual(["Show pricing"]);

    controller.destroy();
  });

  it("clears on the next user message", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller, "u1");
    controller.setFollowUpSuggestions(["Keep going"]);
    expect(chipButtons(mount, "Keep going")).toHaveLength(1);

    injectUserMessage(controller, "u2", "2026-06-10T00:00:02.000Z");
    expect(chipButtons(mount, "Keep going")).toHaveLength(0);

    controller.destroy();
  });

  it("clears via clearFollowUpSuggestions and via an empty array", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);

    controller.setFollowUpSuggestions(["Keep going"]);
    expect(chipButtons(mount, "Keep going")).toHaveLength(1);
    controller.clearFollowUpSuggestions();
    expect(chipButtons(mount, "Keep going")).toHaveLength(0);

    controller.setFollowUpSuggestions(["Keep going"]);
    expect(chipButtons(mount, "Keep going")).toHaveLength(1);
    controller.setFollowUpSuggestions([]);
    expect(chipButtons(mount, "Keep going")).toHaveLength(0);

    controller.destroy();
  });

  it("overrides agent chips shown at the time of the call", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller);
    expect(chipButtons(mount, "Tell me more")).toHaveLength(1);

    controller.setFollowUpSuggestions(["Host wins"]);
    expect(chipButtons(mount, "Host wins")).toHaveLength(1);
    expect(chipButtons(mount, "Tell me more")).toHaveLength(0);

    controller.destroy();
  });

  it("yields to a suggest_replies payload that arrives afterwards", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    injectSuggestReplies(controller, { id: "sr-1", suggestions: ["First"] });
    controller.setFollowUpSuggestions(["Host wins"]);
    expect(chipButtons(mount, "Host wins")).toHaveLength(1);

    injectSuggestReplies(controller, { id: "sr-2", suggestions: ["Newest"] });
    expect(chipButtons(mount, "Host wins")).toHaveLength(0);
    expect(chipButtons(mount, "Newest")).toHaveLength(1);

    controller.destroy();
  });

  it("renders even when the follow-ups feature is disabled", () => {
    const { mount, controller } = makeController({
      suggestions: { followUps: { enabled: false } },
    });
    injectUserMessage(controller);
    injectSuggestReplies(controller);
    expect(chipButtons(mount, "Tell me more")).toHaveLength(0);

    controller.setFollowUpSuggestions(["Still rendered"]);
    expect(chipButtons(mount, "Still rendered")).toHaveLength(1);

    controller.destroy();
  });

  it("renders with no suggestions config present", () => {
    const { mount, controller } = makeController();
    injectUserMessage(controller);
    controller.setFollowUpSuggestions(["Defaults apply"]);

    const surface = mount.querySelector(
      '[data-persona-composer-suggestions][data-persona-suggestion-surface="follow-up"]',
    );
    expect(surface?.getAttribute("data-variant")).toBe("chip");
    expect(surface?.textContent).toContain("Defaults apply");

    controller.destroy();
  });

  it("keeps items set while the panel is closed and shows them on open", () => {
    const mount = createMount();
    const controller = createAgentExperience(mount, {
      apiUrl: "https://api.example.com/chat",
      launcher: { enabled: true },
      suggestionChips: [],
    } as unknown as Parameters<typeof createAgentExperience>[1]);

    expect(controller.isOpen()).toBe(false);
    injectUserMessage(controller);
    controller.setFollowUpSuggestions(["Set while closed"]);

    controller.open();
    expect(chipButtons(mount, "Set while closed")).toHaveLength(1);

    controller.destroy();
  });

  it("keeps the overlay out of the session transcript", () => {
    const { controller } = makeController();
    injectUserMessage(controller);
    const before = controller.getMessages();

    controller.setFollowUpSuggestions([
      { label: "Book a demo", prompt: "Book a demo for my team" },
    ]);

    expect(controller.getMessages()).toEqual(before);
    expect(
      JSON.stringify(controller.getMessages()),
    ).not.toContain("Book a demo");

    controller.destroy();
  });
});
