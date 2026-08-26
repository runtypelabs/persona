// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { createAgentExperience } from "./ui";

const mounts: HTMLElement[] = [];
const controllers: ReturnType<typeof createAgentExperience>[] = [];

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
    response: {
      ok: true,
      status: 200,
      headers: new Headers(),
      body,
    } as unknown as Response,
  };
};

const initResponse = () =>
  ({
    ok: true,
    json: async () => ({
      sessionId: "cs_1",
      expiresAt: new Date(Date.now() + 5 * 60_000).toISOString(),
      config: {},
    }),
  }) as unknown as Response;

const makeController = (config: Record<string, unknown> = {}) => {
  const mount = document.createElement("div");
  document.body.appendChild(mount);
  mounts.push(mount);
  const controller = createAgentExperience(mount, {
    launcher: { enabled: false },
    persistState: false,
    suggestionChips: [],
    ...config,
  } as unknown as Parameters<typeof createAgentExperience>[1]);
  controllers.push(controller);
  return { mount, controller };
};

const flush = async (times = 12) => {
  for (let i = 0; i < times; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
};

const textareaOf = (mount: HTMLElement) =>
  mount.querySelector<HTMLTextAreaElement>("[data-persona-composer-input]")!;

const send = async (mount: HTMLElement, value: string) => {
  const textarea = textareaOf(mount);
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  mount
    .querySelector<HTMLFormElement>("[data-persona-composer-form]")!
    .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  await flush();
};

const pressEnter = async (mount: HTMLElement, value: string) => {
  const textarea = textareaOf(mount);
  textarea.value = value;
  textarea.dispatchEvent(new Event("input", { bubbles: true }));
  textarea.dispatchEvent(
    new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })
  );
  await flush();
};

describe("streamingSubmitBehavior: interrupt", () => {
  beforeEach(() => {
    window.scrollTo = vi.fn();
  });

  afterEach(() => {
    controllers.splice(0).forEach((controller) => controller.destroy());
    mounts.splice(0).forEach((mount) => mount.remove());
    vi.restoreAllMocks();
  });

  it("supersedes the in-flight run on the client-token transport", async () => {
    const bodies: Record<string, unknown>[] = [];
    const streams = [openStream(), openStream()];
    let index = 0;
    global.fetch = vi.fn(async (url: unknown, init: any) => {
      if (String(url).endsWith("/v1/client/init")) return initResponse();
      bodies.push(JSON.parse(init.body));
      const stream = streams[Math.min(index, streams.length - 1)];
      index += 1;
      return stream.response;
    }) as unknown as typeof fetch;

    const { mount } = makeController({
      clientToken: "ct_test",
      composer: { streamingSubmitBehavior: "interrupt" },
    });
    await send(mount, "first");
    await vi.waitFor(() => expect(bodies).toHaveLength(1));

    await pressEnter(mount, "second");
    await vi.waitFor(() => expect(bodies).toHaveLength(2));

    expect(bodies[0].submitMode).toBeUndefined();
    expect(bodies[1].submitMode).toBe("interrupt");
    expect(bodies[1].turnId).not.toBe(bodies[0].turnId);
    streams.forEach((stream) => stream.close());
  });

  it("falls back to block on a non-client-token transport, warning once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = openStream();
    global.fetch = vi.fn(async () => stream.response) as unknown as typeof fetch;

    const { mount, controller } = makeController({
      apiUrl: "https://api.example.com/chat",
      debug: true,
      composer: { streamingSubmitBehavior: "interrupt" },
    });
    await send(mount, "first");
    await pressEnter(mount, "second");
    await pressEnter(mount, "third");

    // Blocked: neither Enter created a second user message, and the draft stays.
    expect(controller.getMessages().filter((m) => m.role === "user")).toHaveLength(1);
    expect(textareaOf(mount).value).toBe("third");
    const fallbackWarnings = warn.mock.calls.filter((call) =>
      String(call[0]).includes("streamingSubmitBehavior")
    );
    expect(fallbackWarnings).toHaveLength(1);
    stream.close();
  });

  it("stays silent about the fallback outside debug mode", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const stream = openStream();
    global.fetch = vi.fn(async () => stream.response) as unknown as typeof fetch;

    const { mount } = makeController({
      apiUrl: "https://api.example.com/chat",
      composer: { streamingSubmitBehavior: "interrupt" },
    });
    await send(mount, "first");
    await pressEnter(mount, "second");

    expect(
      warn.mock.calls.filter((call) =>
        String(call[0]).includes("streamingSubmitBehavior")
      )
    ).toHaveLength(0);
    stream.close();
  });
});
