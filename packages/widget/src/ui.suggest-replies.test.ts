// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { SUGGEST_REPLIES_TOOL_NAME } from "./suggest-replies-tool";

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
  }: { id?: string; suggestions?: string[] } = {},
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
      // No executionId/awaitingLocalTool — rendering is driven purely by the
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
    // suggestions row — it must re-apply the agent-chips rule, not fall back
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
});
