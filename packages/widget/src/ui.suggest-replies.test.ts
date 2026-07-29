// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { SUGGEST_REPLIES_TOOL_NAME } from "./suggest-replies-tool";
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

  it("fills the composer without sending when selection is fill", () => {
    global.fetch = vi.fn();
    const { mount, controller } = makeController({
      suggestions: {
        followUps: {
          placement: "composer",
          selection: "fill",
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
          selection: "fill",
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

  it("dispatches unified suggestion events with surface and selection metadata", () => {
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
          selection: "fill",
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
      selection: "fill",
      suggestion: { id: "draft", prompt: "Draft a reply" },
    });

    controller.destroy();
  });
});
