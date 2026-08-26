// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetMessage } from "./types";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

const streamResponse = () => {
  const encoder = new TextEncoder();
  return {
    ok: true,
    status: 200,
    headers: new Headers(),
    body: new ReadableStream({
      start(controller) {
        controller.enqueue(
          encoder.encode('data: {"type":"flow_complete","success":true}\n\n')
        );
        controller.close();
      },
    }),
  } as unknown as Response;
};

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

const flush = async (times = 8) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const actionButton = (mount: HTMLElement, messageId: string, action: string) =>
  mount.querySelector<HTMLButtonElement>(
    `[data-actions-for="${messageId}"] [data-action="${action}"]`
  );

const editor = (mount: HTMLElement, messageId: string) =>
  mount.querySelector<HTMLElement>(`[data-persona-message-edit="${messageId}"]`);

const editInput = (mount: HTMLElement, messageId: string) =>
  mount.querySelector<HTMLTextAreaElement>(
    `[data-persona-message-edit="${messageId}"] [data-persona-message-edit-input]`
  );

const turn = (): AgentWidgetMessage[] => [
  {
    id: "u1",
    role: "user",
    content: "first question",
    createdAt: "2026-01-01T00:00:00.000Z",
    sequence: 1,
  },
  {
    id: "a1",
    role: "assistant",
    content: "first answer",
    createdAt: "2026-01-01T00:00:01.000Z",
    sequence: 2,
  },
  {
    id: "u2",
    role: "user",
    content: "second question",
    createdAt: "2026-01-01T00:00:02.000Z",
    sequence: 3,
  },
  {
    id: "a2",
    role: "assistant",
    content: "second answer",
    createdAt: "2026-01-01T00:00:03.000Z",
    sequence: 4,
  },
];

describe("regenerate action", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  it("renders only on the final retryable assistant turn", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: { showRegenerate: true, showCopy: false },
    });
    await flush();
    expect(actionButton(mount, "a1", "regenerate")).toBeNull();
    expect(actionButton(mount, "a2", "regenerate")).not.toBeNull();
  });

  it("is absent by default", async () => {
    const { mount } = makeController({ initialMessages: turn() });
    await flush();
    expect(actionButton(mount, "a2", "regenerate")).toBeNull();
  });

  it("is hidden while a response streams", async () => {
    const messages = turn();
    messages[3].streaming = true;
    const { mount } = makeController({
      initialMessages: messages,
      messageActions: { showRegenerate: true, showCopy: false },
    });
    await flush();
    expect(actionButton(mount, "a2", "regenerate")).toBeNull();
  });

  it("resubmits from the preceding user message and truncates the tail", async () => {
    const { mount, controller } = makeController({
      initialMessages: turn(),
      messageActions: { showRegenerate: true, showCopy: false },
    });
    await flush();
    actionButton(mount, "a2", "regenerate")!.click();
    await flush();
    const ids = controller.getMessages().map((m) => m.id);
    expect(ids).not.toContain("u2");
    expect(ids).not.toContain("a2");
    expect(ids).toContain("u1");
    const users = controller.getMessages().filter((m) => m.role === "user");
    expect(users.at(-1)?.content).toBe("second question");
  });
});

describe("edit action eligibility", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  it("shows on a text-only user message", async () => {
    const { mount } = makeController({
      initialMessages: turn(),
      messageActions: { showEdit: true, showCopy: false },
    });
    await flush();
    expect(actionButton(mount, "u1", "edit")).not.toBeNull();
  });

  it("is absent by default", async () => {
    const { mount } = makeController({ initialMessages: turn() });
    await flush();
    expect(actionButton(mount, "u1", "edit")).toBeNull();
  });

  it.each([
    ["attachments", { contentParts: [{ type: "text" as const, text: "x" }] }],
    [
      "mention refs",
      { contextMentions: [{ sourceId: "s", itemId: "i", label: "l" }] },
    ],
    ["inline segments", { contentSegments: [{ type: "text" as const, text: "x" }] }],
    ["structured mention context", { mentionContext: { a: 1 } }],
    ["raw content", { rawContent: "{}" }],
    ["a distinct llmContent", { llmContent: "hidden" }],
    ["a quote", { quote: { text: "q" } }],
  ])("hides Edit on a user message carrying %s", async (_label, extra) => {
    const messages = turn();
    Object.assign(messages[0], extra);
    const { mount } = makeController({
      initialMessages: messages,
      messageActions: { showEdit: true, showCopy: false },
    });
    await flush();
    expect(actionButton(mount, "u1", "edit")).toBeNull();
  });
});

describe("edit-and-resend editor", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
    global.fetch = vi.fn(async () => streamResponse()) as unknown as typeof fetch;
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  const openEditor = async () => {
    const made = makeController({
      initialMessages: turn(),
      messageActions: { showEdit: true, showCopy: false },
    });
    await flush();
    actionButton(made.mount, "u1", "edit")!.click();
    await flush();
    return made;
  };

  it("swaps the bubble for a mini editor seeded with the message text", async () => {
    const { mount } = await openEditor();
    expect(editor(mount, "u1")).not.toBeNull();
    expect(editInput(mount, "u1")!.value).toBe("first question");
    expect(mount.querySelector("#bubble-u1")).toBeNull();
  });

  it("survives transcript morphs: typing is not reset by a re-render", async () => {
    const { mount, controller } = await openEditor();
    const input = editInput(mount, "u1")!;
    input.value = "edited in place";
    // Two more full render passes (the transcript morphs on every change).
    controller.injectAssistantMessage({ content: "chatter one" });
    await flush();
    controller.injectAssistantMessage({ content: "chatter two" });
    await flush();
    const stillThere = editInput(mount, "u1");
    expect(stillThere).toBe(input);
    expect(stillThere!.value).toBe("edited in place");
  });

  it("Escape cancels and restores the bubble", async () => {
    const { mount } = await openEditor();
    editInput(mount, "u1")!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", bubbles: true })
    );
    await flush();
    expect(editor(mount, "u1")).toBeNull();
    expect(mount.querySelector("#bubble-u1")).not.toBeNull();
  });

  it("Cancel restores the bubble", async () => {
    const { mount } = await openEditor();
    mount
      .querySelector<HTMLButtonElement>("[data-persona-message-edit-cancel]")!
      .click();
    await flush();
    expect(editor(mount, "u1")).toBeNull();
    expect(mount.querySelector("#bubble-u1")).not.toBeNull();
  });

  it("Save resubmits with the edited text and truncates the tail", async () => {
    const { mount, controller } = await openEditor();
    editInput(mount, "u1")!.value = "edited question";
    mount
      .querySelector<HTMLButtonElement>("[data-persona-message-edit-save]")!
      .click();
    await flush();
    const messages = controller.getMessages();
    expect(messages.map((m) => m.id)).not.toContain("a1");
    expect(messages.map((m) => m.id)).not.toContain("u2");
    expect(messages[0].content).toBe("edited question");
    expect(messages[0].id).not.toBe("u1");
    expect(editor(mount, "u1")).toBeNull();
  });

  it("re-pins the anchored message after the tail collapses", async () => {
    const made = makeController({
      initialMessages: turn(),
      messageActions: { showEdit: true, showCopy: false },
      scroll: { mode: "anchor-top" },
    });
    await flush();
    actionButton(made.mount, "u1", "edit")!.click();
    await flush();
    editInput(made.mount, "u1")!.value = "edited question";
    // The repin runs at the collapse site; it must not throw in anchor-top mode
    // and the truncated transcript must be the one that ends up rendered.
    made.mount
      .querySelector<HTMLButtonElement>("[data-persona-message-edit-save]")!
      .click();
    await flush();
    expect(made.controller.getMessages().map((m) => m.id)).not.toContain("a1");
    expect(made.mount.querySelector("#wrapper-a1")).toBeNull();
  });

  it("a composer send cancels the open editor", async () => {
    const { mount } = await openEditor();
    const textarea = mount.querySelector<HTMLTextAreaElement>(
      "[data-persona-composer-input]"
    )!;
    textarea.value = "brand new message";
    textarea.dispatchEvent(new Event("input", { bubbles: true }));
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
    expect(editor(mount, "u1")).toBeNull();
  });
});
