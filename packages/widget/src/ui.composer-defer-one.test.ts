// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";
import { createUnifiedEventWrite } from "./utils/__fixtures__/unified-translator.oracle";

const legacyEvent = (type: string, data: Record<string, unknown>) =>
  `event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`;

/** One complete assistant turn, in the same wire shape the widget expects. */
const unifiedFrames = (): string => {
  let out = "";
  const write = createUnifiedEventWrite((chunk) => {
    out += chunk;
  });
  write(legacyEvent("flow_start", { flowId: "flow_1", flowName: "T", totalSteps: 1 }));
  write(
    legacyEvent("step_start", {
      id: "step_1",
      name: "Prompt",
      stepType: "prompt",
      index: 0,
      totalSteps: 1,
    })
  );
  write(legacyEvent("text_start", { messageId: "message_1" }));
  write(legacyEvent("step_delta", { id: "step_1", text: "answer" }));
  write(legacyEvent("text_end", { messageId: "message_1" }));
  write(
    legacyEvent("step_complete", {
      id: "step_1",
      name: "Prompt",
      stepType: "prompt",
      success: true,
      result: { response: "answer" },
    })
  );
  write(legacyEvent("flow_complete", { flowId: "flow_1", success: true }));
  return out;
};

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

/** A stream the test opens and closes by hand, so streaming state is stable. */
const openStream = () => {
  const encoder = new TextEncoder();
  let push!: (frame: string) => void;
  let close!: () => void;
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      push = (frame) => controller.enqueue(encoder.encode(frame));
      close = () => controller.close();
    },
  });
  return {
    push,
    close,
    response: { ok: true, status: 200, headers: new Headers(), body } as unknown as Response,
  };
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
    composer: { streamingSubmitBehavior: "defer-one" },
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 10) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const type = (mount: HTMLElement, value: string) => {
  const textarea = textareaOf(mount);
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
};

const pressEnter = (mount: HTMLElement) =>
  textareaOf(mount).dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  );

const pendingCard = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-pending]");

const pendingText = (mount: HTMLElement) =>
  mount.querySelector<HTMLElement>("[data-persona-composer-pending-text]")?.textContent;

describe("streamingSubmitBehavior: defer-one", () => {
  let stream: ReturnType<typeof openStream>;

  beforeEach(() => {
    window.scrollTo = vi.fn();
    stream = openStream();
    global.fetch = vi.fn(async () => stream.response) as unknown as typeof fetch;
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  /** Start a turn and leave it streaming. */
  const startStreaming = async (mount: HTMLElement) => {
    type(mount, "first message");
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush();
  };

  it("captures one submission, clears the draft, and shows the card", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);

    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    expect(textareaOf(mount).value).toBe("");
    expect(pendingCard(mount)?.style.display).toBe("flex");
    expect(pendingText(mount)).toBe("queued message");
    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );
  });

  it("the captured snapshot is immutable: typing afterwards does not change it", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    type(mount, "typed after capture");
    await flush();
    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );
    expect(() => {
      (
        controller.getComposerState().pendingSubmission as unknown as {
          text: string;
        }
      ).text = "mutated";
    }).toThrow();
  });

  it("rejects a second submit instead of silently replacing the queued one", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    type(mount, "second attempt");
    pressEnter(mount);
    await flush();

    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );
    // The refused draft is preserved for the user to edit or remove.
    expect(textareaOf(mount).value).toBe("second attempt");
    const status = mount.querySelector<HTMLElement>(
      "[data-persona-composer-notice]"
    );
    expect(status?.textContent).toContain("already queued");
  });

  it("card Edit restores the snapshot into the draft and drops the card", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-pending-edit]")!
      .click();
    await flush();

    expect(textareaOf(mount).value).toBe("queued message");
    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
    expect(pendingCard(mount)?.style.display).toBe("none");
  });

  it("card Remove discards the snapshot", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    mount
      .querySelector<HTMLButtonElement>("[data-persona-composer-pending-remove]")!
      .click();
    await flush();

    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
    expect(textareaOf(mount).value).toBe("");
  });

  it("auto-sends the queued item when the assistant turn completes", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();
    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );

    const completed = new Promise<void>((resolve) => {
      controller.on("assistant:complete", () => resolve());
    });
    stream.push(unifiedFrames());
    stream.close();
    await completed;
    await flush(30);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flush(30);

    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
    const users = controller.getMessages().filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).toContain("queued message");
  });

  it("stays pending after an explicit Stop", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    // The send button doubles as Stop while streaming.
    mount
      .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
      .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await flush(20);

    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );
    const users = controller.getMessages().filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).not.toContain("queued message");
  });

  it("stays pending after a stream error", async () => {
    const { mount, controller } = makeController();
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    stream.push('data: {"type":"error","error":"boom"}\n\n');
    stream.close();
    await flush(30);
    await new Promise((resolve) => setTimeout(resolve, 5));
    await flush(20);

    expect(controller.getComposerState().pendingSubmission?.text).toBe(
      "queued message"
    );
    const users = controller.getMessages().filter((m) => m.role === "user");
    expect(users.map((m) => m.content)).not.toContain("queued message");
  });

  it("clear chat removes the queued item", async () => {
    const { mount, controller } = makeController({
      launcher: { enabled: false, clearChat: { enabled: true } },
    });
    await startStreaming(mount);
    type(mount, "queued message");
    pressEnter(mount);
    await flush();

    controller.clearChat();
    await flush();
    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
  });

  it("leaves the default block policy inert on Enter while streaming", async () => {
    const { mount, controller } = makeController({ composer: {} });
    await startStreaming(mount);
    type(mount, "ignored while streaming");
    pressEnter(mount);
    await flush();

    expect(controller.getComposerState().pendingSubmission).toBeUndefined();
    expect(textareaOf(mount).value).toBe("ignored while streaming");
  });
});
