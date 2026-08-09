// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import type { AgentWidgetRequestPayload } from "./types";

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

const makeController = (
  config: Record<string, unknown> = {},
  sent: AgentWidgetRequestPayload[] = []
) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    apiUrl: "https://api.example.com/chat",
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    customFetch: async (_url: string, _init: unknown, payload: unknown) => {
      sent.push(payload as AgentWidgetRequestPayload);
      return streamResponse();
    },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller, sent };
};

const flush = async (times = 10) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const banner = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-quote]");

const submit = async (mount: HTMLElement, text: string) => {
  const textarea = mount.querySelector<HTMLTextAreaElement>(
    "[data-persona-composer-input]"
  )!;
  textarea.value = text;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  mount
    .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
};

describe("composer quote", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  it("renders a dismissible banner with the source label", async () => {
    const { mount, controller } = makeController();
    expect(banner(mount)?.style.display).toBe("none");

    controller.setQuote({ text: "quoted material", sourceLabel: "Docs" });
    await flush();
    expect(banner(mount)?.style.display).toBe("flex");
    expect(
      mount.querySelector("[data-persona-composer-quote-text]")?.textContent
    ).toBe("quoted material");
    expect(
      mount.querySelector(".persona-composer-quote-source")?.textContent
    ).toBe("Docs");
    expect(controller.getComposerState().quote?.text).toBe("quoted material");

    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-quote-dismiss]")!
      .click();
    await flush();
    expect(controller.getComposerState().quote).toBeUndefined();
    expect(banner(mount)?.style.display).toBe("none");
  });

  it("clearQuote drops it and a blank quote is ignored", async () => {
    const { controller } = makeController();
    controller.setQuote({ text: "   " });
    await flush();
    expect(controller.getComposerState().quote).toBeUndefined();

    controller.setQuote({ text: "keep" });
    await flush();
    controller.clearQuote();
    await flush();
    expect(controller.getComposerState().quote).toBeUndefined();
  });

  it("prepends a delimited block to llmContent for a plain string message", async () => {
    const { mount, controller } = makeController();
    controller.setQuote({ text: "quoted material" });
    await flush();
    await submit(mount, "what about this");

    const sentMessage = controller.getMessages().find((m) => m.role === "user")!;
    expect(sentMessage.content).toBe("what about this");
    expect(sentMessage.llmContent).toBe(
      "```quoted-text\nquoted material\n```\n\nwhat about this"
    );
    expect(sentMessage.quote).toEqual({ text: "quoted material" });
    // Clears after local acceptance.
    expect(controller.getComposerState().quote).toBeUndefined();
  });

  it("escalates the fence when the quoted text contains a fence", async () => {
    const { mount, controller } = makeController();
    controller.setQuote({ text: "```js\ncode\n```" });
    await flush();
    await submit(mount, "explain");

    const sentMessage = controller.getMessages().find((m) => m.role === "user")!;
    expect(sentMessage.llmContent?.startsWith("````quoted-text\n")).toBe(true);
  });

  it("leaves a non-quoted send byte-identical to before", async () => {
    const sent: AgentWidgetRequestPayload[] = [];
    const { mount, controller } = makeController({}, sent);
    await submit(mount, "plain message");

    const sentMessage = controller.getMessages().find((m) => m.role === "user")!;
    expect(sentMessage.llmContent).toBeUndefined();
    expect(sentMessage.contentParts).toBeUndefined();
    expect(sentMessage.quote).toBeUndefined();
    expect(sent[0].messages.at(-1)?.content).toBe("plain message");
  });

  it("the transcript Quote action loads the message into the banner", async () => {
    const { mount, controller } = makeController({
      messageActions: { showQuote: true, showCopy: false },
      initialMessages: [
        {
          id: "a1",
          role: "assistant",
          content: "assistant said this",
          createdAt: "2026-01-01T00:00:00.000Z",
          sequence: 1,
        },
      ],
    });
    await flush();
    mount
      .querySelector<HTMLButtonElement>(
        '[data-actions-for="a1"] [data-action="quote"]'
      )!
      .click();
    await flush();
    expect(controller.getComposerState().quote).toEqual({
      text: "assistant said this",
      messageId: "a1",
    });
  });

  it("the Quote action is absent by default", async () => {
    const { mount } = makeController({
      initialMessages: [
        {
          id: "a1",
          role: "assistant",
          content: "assistant said this",
          createdAt: "2026-01-01T00:00:00.000Z",
          sequence: 1,
        },
      ],
    });
    await flush();
    expect(
      mount.querySelector('[data-actions-for="a1"] [data-action="quote"]')
    ).toBeNull();
  });
});
